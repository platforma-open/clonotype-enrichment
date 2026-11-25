"""Plot data for design mode (draft): the step that knows what things are called.

Input:
  --plot_data  design_enrichment.py's wide frame: elementId, one column per comparison and
               score id, and one frequency column per position (f_<pid>)
  --plan       the plan as the model built it, labels included
Output, in the shapes enrichment.py gives the classic plots, with a path, comparison or score
in place of the condition where a design has several:
  --plot_freq     top clones' frequency along each track (path) of the plan
  --plot_bubble   top clones' enrichment in each comparison of the plan
  --plot_control  every clone's target vs highest control enrichment, by score (scores with
                  controls only)

This runs apart from design_enrichment.py so that the labels live on this side of the
expensive work. Renaming a sample or a metadata value re-runs this step, which reads one
frame and writes three, and leaves the enrichment numbers alone.
"""

import argparse
import json

import polars as pl


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plot_data", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--plot_freq", required=True)
    ap.add_argument("--plot_bubble", required=True)
    ap.add_argument("--plot_control", required=True)
    ap.add_argument("--enrichment_threshold", type=float, default=2.0)
    ap.add_argument("--control_threshold", type=float, default=1.0)
    ap.add_argument("--top_n", type=int, default=10)
    args = ap.parse_args()

    with open(args.plan) as f:
        plan = json.load(f)
    res = pl.read_csv(args.plot_data, infer_schema_length=None)
    write_plots(args, plan, res)
    print(f"design plots: {res.height} elements, {len(plan.get('tracks', []))} tracks, "
          f"{len(plan['comparisons'])} comparisons, {len(plan['scores'])} scores")


def write_plots(args, plan: dict, res: pl.DataFrame) -> None:
    """Plot data from the results: comparisons, scores and per-position frequencies (f_<pid>)."""
    # The frequency plot's x axis: the step without the piece it is of, so round 1 of every
    # parallel line lands on one tick instead of one tick per line. The piece names the facet.
    steps = {p["id"]: p.get("step") or p.get("name") or p["label"] for p in plan["positions"]}

    # Top clones per arm, as enrichment.py picks them for the whole run: ranked by the arm's best
    # score (else its best comparison), at or above the enrichment threshold
    def top_of(group: str) -> pl.DataFrame:
        cols = [s["id"] for s in plan["scores"] if s.get("group", s["arm"]) == group] or [
            c["id"] for c in plan["comparisons"] if c["group"] == group]
        if not cols:
            return res.head(0)
        return (
            res.with_columns(pl.max_horizontal([pl.col(c) for c in cols]).alias("_rank"))
            .filter(pl.col("_rank") >= args.enrichment_threshold)
            .sort(["_rank", "elementId"], descending=[True, False])
            .head(args.top_n)
        )

    parts = []
    for t in plan.get("tracks", []):
        top = top_of(t["group"])
        width = len(str(len(t["positions"])))
        first = f"f_{t['positions'][0]}"
        for k, pid in enumerate(t["positions"]):
            f = pl.col(f"f_{pid}")
            parts.append(top.select(
                "elementId",
                pl.lit(t["label"]).alias("Track"),
                # numbered so the plots keep the path's order
                pl.lit(f"{k + 1:0{width}d}. {steps[pid]}").alias("Condition"),
                f.alias("Frequency"),
                pl.when((f > 0) & (pl.col(first) > 0)).then((f / pl.col(first)).log(2))
                .otherwise(None).alias("EnrichmentVsBaseline"),
            ))
    frame(parts, {"elementId": pl.Utf8, "Track": pl.Utf8, "Condition": pl.Utf8,
                  "Frequency": pl.Float64, "EnrichmentVsBaseline": pl.Float64}
          ).write_csv(args.plot_freq)

    parts = []
    tops = {g: top_of(g) for g in dict.fromkeys(c["group"] for c in plan["comparisons"])}
    for c in plan["comparisons"]:
        top = tops[c["group"]]
        parts.append(top.select(
            "elementId",
            pl.lit(c["label"]).alias("Comparison"),
            pl.col(c["id"]).alias("Enrichment"),
            pl.col(f"f_{c['num']}").alias("Frequency_Numerator"),
        ).filter(pl.col("Enrichment").is_not_null()))
    frame(parts, {"elementId": pl.Utf8, "Comparison": pl.Utf8,
                  "Enrichment": pl.Float64, "Frequency_Numerator": pl.Float64}
          ).write_csv(args.plot_bubble)

    # Binding specificity as enrichment.py: target at the enrichment threshold, control at the
    # control threshold
    num_of = {c["id"]: c["num"] for c in plan["comparisons"]}
    parts = []
    for s in plan["scores"]:
        if not s["controls"]:
            continue
        target = pl.col(s["target"])
        ctrl = pl.max_horizontal([pl.col(c) for c in s["controls"]])
        hit = target >= args.enrichment_threshold
        in_ctrl = ctrl.fill_null(float("-inf")) >= args.control_threshold
        parts.append(res.select(
            "elementId",
            pl.lit(s["label"]).alias("Score"),
            target.alias("TargetEnrichment"),
            ctrl.alias("MaxNegControlEnrichment"),
            pl.when(hit & ~in_ctrl).then(pl.lit("Antigen-Specific"))
            .when(hit & in_ctrl).then(pl.lit("Non-Specific"))
            .when(~hit & in_ctrl).then(pl.lit("Negative-Control"))
            .otherwise(pl.lit("Not-Enriched")).alias("BindingSpecificity"),
            pl.col(f"f_{num_of[s['target']]}").alias("Frequency"),
        ).filter(pl.col("TargetEnrichment").is_not_null()))
    frame(parts, {"elementId": pl.Utf8, "Score": pl.Utf8, "TargetEnrichment": pl.Float64,
                  "MaxNegControlEnrichment": pl.Float64, "BindingSpecificity": pl.Utf8,
                  "Frequency": pl.Float64}).write_csv(args.plot_control)


def frame(parts: list, schema: dict) -> pl.DataFrame:
    """Concatenated parts, or an empty frame with the expected columns."""
    if not parts:
        return pl.DataFrame(schema=schema)
    return pl.concat(parts).cast(schema)


if __name__ == "__main__":
    main()
