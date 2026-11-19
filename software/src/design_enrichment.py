"""Enrichment from an experiment design plan (draft).

Input:
  --input   CSV with sampleId, elementId and abundance (or downsampledAbundance,
            the output of downsampling.py)
  --plan    JSON written by the block model (see model/src/design.ts, type Plan):
            positions (each a list of sample ids), comparisons (numerator and
            denominator position ids) and scores (target comparison and control
            comparisons)
Output:
  --output  CSV, one row per element: elementId, then one column per
            comparison id (c1, c2, ...) and one per score id (s1, s2, ...)
  Plot data (top clones are picked per arm), in the shapes enrichment.py gives the classic plots, with an arm, path or score
  in place of the condition where a design has several:
  --plot_freq     top clones' frequency along each track (path) of the plan
  --plot_bubble   top clones' enrichment in each comparison, by arm
  --plot_control  every clone's target vs highest control enrichment, by score (scores with
                  controls only)
  --stats         JSON: min, max, mean, median and 75th percentile of the score values

Each design position plays the part of a condition in enrichment.py: its count is the
sum over its samples, and the filters, totals and frequencies are the classic ones
(totals and element count are taken before filtering). Enrichment is log2(f_num / f_den).
A score is the target enrichment minus the highest control enrichment, with
negative control values counted as 0.
"""

import argparse
import json
import math

import polars as pl

from enrichment import apply_clonotype_definition, filter_clonotypes_by_criteria


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--filtered_too_much", required=True)
    ap.add_argument("--pseudo_count", type=float, default=1.0)
    ap.add_argument("--clonotype-definition", dest="clonotype_definition")
    ap.add_argument("--filter_single_sample", action="store_true")
    ap.add_argument("--filter_any_zero", action="store_true")
    ap.add_argument("--min_abundance", type=int, default=0)
    ap.add_argument("--min_frequency", type=float, default=0.0)
    ap.add_argument("--present_in_rounds", type=json.loads, default=None,
                    help="JSON list of position labels")
    ap.add_argument("--present_in_rounds_logic", default="OR")
    ap.add_argument("--plot_freq")
    ap.add_argument("--plot_bubble")
    ap.add_argument("--plot_control")
    ap.add_argument("--stats")
    ap.add_argument("--enrichment_threshold", type=float, default=2.0)
    ap.add_argument("--control_threshold", type=float, default=1.0)
    ap.add_argument("--top_n", type=int, default=10)
    args = ap.parse_args()

    with open(args.plan) as f:
        plan = json.load(f)
    pos_ids = [p["id"] for p in plan["positions"]]
    pos_by_label = {p["label"]: p["id"] for p in plan["positions"]}

    data = pl.read_csv(args.input, infer_schema_length=0)
    value_col = "downsampledAbundance" if "downsampledAbundance" in data.columns else "abundance"
    data = (
        data.filter(pl.col(value_col).is_not_null() & (pl.col(value_col) != ""))
        .with_columns(pl.col(value_col).cast(pl.Float64).alias("abundance"))
        .select("sampleId", "elementId", "abundance")
    )

    # sample -> position (a sample may belong to several positions); the position is the condition
    mapping = pl.DataFrame(
        [(s, p["id"]) for p in plan["positions"] for s in p["samples"]],
        schema={"sampleId": pl.Utf8, "condition": pl.Utf8},
        orient="row",
    )
    data = data.join(mapping, on="sampleId", how="inner")

    if args.clonotype_definition:
        definition = pl.read_csv(args.clonotype_definition, infer_schema_length=0)
        data = apply_clonotype_definition(data, definition, "condition", "abundance")

    aggregated = data.group_by("elementId", "condition").agg(pl.col("abundance").sum())

    # As in enrichment.py: totals and element count before filtering
    totals = dict(aggregated.group_by("condition").agg(pl.col("abundance").sum()).iter_rows())
    n = aggregated.select("elementId").n_unique()
    pc = args.pseudo_count

    rounds = None
    if args.present_in_rounds:
        rounds = [pos_by_label[r] for r in args.present_in_rounds if r in pos_by_label]
    filtered = filter_clonotypes_by_criteria(
        aggregated, pos_ids,
        filter_single_sample=args.filter_single_sample,
        filter_any_zero=args.filter_any_zero,
        min_abundance=args.min_abundance,
        min_frequency=args.min_frequency,
        total_reads_dict=totals,
        present_in_rounds=rounds,
        present_in_rounds_logic=args.present_in_rounds_logic,
        pseudo_count=pc,
        n_clonotypes=n,
    )

    with open(args.filtered_too_much, "w") as f:
        f.write("true" if filtered.select("elementId").n_unique() < 1 else "false")

    wide = (
        filtered.pivot(values="abundance", index="elementId", on="condition", aggregate_function="sum")
        .fill_null(0.0)
    )
    for pid in pos_ids:
        if pid not in wide.columns:
            wide = wide.with_columns(pl.lit(0.0).alias(pid))

    freq = {pid: (pl.col(pid) + pc) / (totals.get(pid, 1) + n * pc) for pid in pos_ids}
    exprs = []
    for c in plan["comparisons"]:
        f_num, f_den = freq[c["num"]], freq[c["den"]]
        exprs.append(
            pl.when((f_num > 0) & (f_den > 0))
            .then((f_num / f_den).log(2))
            .otherwise(None)
            .alias(c["id"])
        )
    out = wide.select("elementId", *exprs)

    score_exprs = []
    for s in plan["scores"]:
        if s["controls"]:
            ctrl = pl.max_horizontal(
                [pl.col(cid).fill_null(0.0).clip(lower_bound=0.0) for cid in s["controls"]]
            )
            score_exprs.append((pl.col(s["target"]) - ctrl).alias(s["id"]))
        else:
            score_exprs.append(pl.col(s["target"]).alias(s["id"]))
    if score_exprs:
        out = out.with_columns(score_exprs)

    out.sort("elementId").write_csv(args.output)

    freqs = wide.select("elementId", *[freq[pid].alias(f"f_{pid}") for pid in pos_ids])
    write_plots(args, plan, out.join(freqs, on="elementId", how="left"))
    print(f"design enrichment: {out.height} of {n} elements, "
          f"{len(plan['comparisons'])} comparisons, {len(plan['scores'])} scores")


def write_plots(args, plan: dict, res: pl.DataFrame) -> None:
    """Plot data from the results: comparisons, scores and per-position frequencies (f_<pid>)."""
    names = {p["id"]: p.get("name") or p["label"] for p in plan["positions"]}
    cmp_ids = [c["id"] for c in plan["comparisons"]]
    score_ids = [s["id"] for s in plan["scores"]]

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
    rank_cols = score_ids or cmp_ids

    if args.plot_freq:
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
                    pl.lit(f"{k + 1:0{width}d}. {names[pid]}").alias("Condition"),
                    f.alias("Frequency"),
                    pl.when((f > 0) & (pl.col(first) > 0)).then((f / pl.col(first)).log(2))
                    .otherwise(None).alias("EnrichmentVsBaseline"),
                ))
        frame(parts, {"elementId": pl.Utf8, "Track": pl.Utf8, "Condition": pl.Utf8,
                      "Frequency": pl.Float64, "EnrichmentVsBaseline": pl.Float64}
              ).write_csv(args.plot_freq)

    if args.plot_bubble:
        parts = []
        tops = {g: top_of(g) for g in dict.fromkeys(c["group"] for c in plan["comparisons"])}
        for c in plan["comparisons"]:
            top = tops[c["group"]]
            prefix = f"{c['group']}: "
            label = c["label"][len(prefix):] if c["label"].startswith(prefix) else c["label"]
            parts.append(top.select(
                "elementId",
                pl.lit(c["group"]).alias("Arm"),
                pl.lit(label).alias("Comparison"),
                pl.col(c["id"]).alias("Enrichment"),
                pl.col(f"f_{c['num']}").alias("Frequency_Numerator"),
            ).filter(pl.col("Enrichment").is_not_null()))
        frame(parts, {"elementId": pl.Utf8, "Arm": pl.Utf8, "Comparison": pl.Utf8,
                      "Enrichment": pl.Float64, "Frequency_Numerator": pl.Float64}
              ).write_csv(args.plot_bubble)

    if args.plot_control:
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

    if args.stats:
        # Same figures as enrichment_annotations.py, over every score value (else comparison)
        vals = res.select(pl.concat_list([pl.col(c) for c in rank_cols]).alias("v")).explode("v") \
            if rank_cols else pl.DataFrame({"v": []}, schema={"v": pl.Float64})
        v = vals["v"].drop_nulls()
        fmt = lambda x: "NaN" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.2f}"
        p75 = v.quantile(0.75) if len(v) else None
        with open(args.stats, "w") as f:
            json.dump({
                "min": fmt(v.min() if len(v) else None),
                "max": fmt(v.max() if len(v) else None),
                "mean": fmt(v.mean() if len(v) else None),
                "median": fmt(v.median() if len(v) else None),
                "cutoff": fmt(None if p75 is None else max(p75, 1.0)),
            }, f)


def frame(parts: list, schema: dict) -> pl.DataFrame:
    """Concatenated parts, or an empty frame with the expected columns."""
    if not parts:
        return pl.DataFrame(schema=schema)
    return pl.concat(parts).cast(schema)


if __name__ == "__main__":
    main()
