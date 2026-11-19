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

Each design position plays the part of a condition in enrichment.py: its count is the
sum over its samples, and the filters, totals and frequencies are the classic ones
(totals and element count are taken before filtering). Enrichment is log2(f_num / f_den).
A score is the target enrichment minus the highest control enrichment, with
negative control values counted as 0.
"""

import argparse
import json

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
    print(f"design enrichment: {out.height} of {n} elements, "
          f"{len(plan['comparisons'])} comparisons, {len(plan['scores'])} scores")


if __name__ == "__main__":
    main()
