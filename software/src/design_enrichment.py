"""Enrichment from an experiment design plan (draft).

Input:
  --input   CSV with sampleId, elementId and abundance (or downsampledAbundance,
            the output of downsampling.py)
  --plan    JSON written by the block model (see model/src/design.ts, type Plan):
            positions (each a list of sample ids), comparisons (numerator and
            denominator position ids) and scores (target comparison and control
            comparisons)
Output:
  --output     CSV, one row per element: elementId, then one column per
               comparison id (c1, c2, ...) and one per score id (s1, s2, ...)
  --plot_data  the same values plus a frequency column per position (f_<pid>), which
               design_plots.py turns into the plot frames
  --stats      JSON: min, max, mean, median and 75th percentile of the score values

Nothing here carries a label. The plan this step reads holds structure only, so renaming a
sample or a metadata value leaves its input untouched and the numbers are not recomputed;
design_plots.py is the step that knows what things are called.

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
                    help="JSON list of position ids")
    ap.add_argument("--present_in_rounds_logic", default="OR")
    ap.add_argument("--plot_data")
    ap.add_argument("--stats")
    ap.add_argument("--enrichment_threshold", type=float, default=2.0)
    args = ap.parse_args()

    with open(args.plan) as f:
        plan = json.load(f)
    pos_ids = [p["id"] for p in plan["positions"]]

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
        known = set(pos_ids)
        rounds = [r for r in args.present_in_rounds if r in known]
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
    # The frequency each end point's quality is judged on, over the positions of its own path. It
    # is taken here because the frequencies are built on the position columns, which only `wide`
    # has: `out` holds the comparisons computed from them.
    freq_exprs = []
    for s in plan["scores"]:
        on_path = [freq[p] for p in s["path"] if p in freq]
        freq_exprs.append(
            (pl.max_horizontal(on_path) if on_path else pl.lit(None, pl.Float64)).alias(
                f"{s['id']}_freq"
            )
        )
    out = wide.select("elementId", *exprs, *freq_exprs)

    score_exprs = []
    for s in plan["scores"]:
        if s["controls"]:
            ctrl = pl.max_horizontal(
                [pl.col(cid).fill_null(0.0).clip(lower_bound=0.0) for cid in s["controls"]]
            )
            score_exprs.append((pl.col(s["target"]) - ctrl).alias(s["id"]))
        else:
            score_exprs.append(pl.col(s["target"]).alias(s["id"]))
        # Max Log2FC: the best single step on this end point's own path.
        score_exprs.append(
            pl.max_horizontal([pl.col(c) for c in s["steps"]]).alias(f"{s['id']}_max")
        )
    if score_exprs:
        out = out.with_columns(score_exprs)
        out = out.with_columns(
            [
                quality(out, s, s.get("threshold", args.enrichment_threshold))
                for s in plan["scores"]
            ]
        )

    # the per-path frequency is only there to judge quality against; the export does not read it
    out.drop([f"{s['id']}_freq" for s in plan["scores"]], strict=False).sort("elementId").write_csv(
        args.output
    )

    freqs = wide.select("elementId", *[freq[pid].alias(f"f_{pid}") for pid in pos_ids])
    res = out.join(freqs, on="elementId", how="left")
    if args.plot_data:
        res.sort("elementId").write_csv(args.plot_data)
    if args.stats:
        write_stats(args.stats, res, [s["id"] for s in plan["scores"]]
                    or [c["id"] for c in plan["comparisons"]])
    print(f"design enrichment: {out.height} of {n} elements, "
          f"{len(plan['comparisons'])} comparisons, {len(plan['scores'])} scores")


def write_stats(path: str, res: pl.DataFrame, rank_cols: list) -> None:
    """Same figures as enrichment_annotations.py, over every score value (else comparison)."""
    vals = res.select(pl.concat_list([pl.col(c) for c in rank_cols]).alias("v")).explode("v") \
        if rank_cols else pl.DataFrame({"v": []}, schema={"v": pl.Float64})
    v = vals["v"].drop_nulls()
    fmt = lambda x: "NaN" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.2f}"
    p75 = v.quantile(0.75) if len(v) else None
    with open(path, "w") as f:
        json.dump({
            "min": fmt(v.min() if len(v) else None),
            "max": fmt(v.max() if len(v) else None),
            "mean": fmt(v.mean() if len(v) else None),
            "median": fmt(v.median() if len(v) else None),
            "cutoff": fmt(None if p75 is None else max(p75, 1.0)),
        }, f)


def quality(out: pl.DataFrame, s: dict, threshold: float) -> pl.Expr:
    """
    Enrichment Quality for one end point, as classic mode calls it: the cutoffs are percentiles of
    this run, so a clone is judged against the others in the same experiment, not an absolute scale.
    "Non Binder" comes first here; classic mode computes it last and overrides, which is the same
    answer. It needs a control, as in classic mode: with nothing to judge specificity against, a
    clone that ends low is a Rescuer or a Weak Binder, never a non-binder.
    """
    mx, fq, overall = pl.col(f"{s['id']}_max"), pl.col(f"{s['id']}_freq"), pl.col(s["target"])
    q = lambda e, p: out.select(e.fill_null(0.0).quantile(p)).item()
    high = max(threshold, q(mx, 0.75))
    stable = max(threshold, q(overall, 0.50))
    low, freq_cut = q(mx, 0.25), q(fq, 0.75)

    not_binder = (overall < threshold) if s["controls"] else pl.lit(False)
    return (
        pl.when(not_binder)
        .then(pl.lit("Non Binder"))
        .when((mx >= high) & (overall >= stable))
        .then(pl.lit("Stable Binder"))
        .when((mx >= high) & (overall < stable))
        .then(pl.lit("Rescuer"))
        .when((mx < low) & (fq >= freq_cut))
        .then(pl.lit("Parasite"))
        .otherwise(pl.lit("Weak Binder"))
        .alias(f"{s['id']}_quality")
    )


if __name__ == "__main__":
    main()
