"""
Per-clonotype maximum frequency across target selection rounds.

Used when the enrichment block input is *cluster* abundance: the enrichment
analysis runs at cluster resolution, but Lead Selection ranks individual
clonotypes, so we surface each clonotype's own max frequency as a score.

Frequency is the plain observed fraction (downsampled abundance over the round
total), with no pseudo-count:

    freq_c = abundance_c / total_c       (absent round -> 0)
    MaxFrequency = max over target rounds

Where:
  - abundance_c : the clonotype's summed (downsampled) abundance in condition c
  - total_c     : total reads in condition c (target track)

The "target track" excludes the library round and negative controls: when an
antigen column is present we keep only rows of the current target antigen
(library and negative-control samples carry different antigen values). The max
is taken over the target condition order only.

Input CSV (the downsampling output) columns:
    sampleId, elementId, abundance, downsampledAbundance, condition, [antigen]
Output CSV columns:
    elementId, MaxFrequency
"""
import argparse
import json

import polars as pl


def main():
    parser = argparse.ArgumentParser(
        description="Per-clonotype max frequency across target rounds")
    parser.add_argument("--input_data", required=True,
                        help="Downsampling output CSV (clonotype resolution).")
    parser.add_argument("--conditions", type=str, required=True,
                        help="JSON list of target conditions (rounds), ordered.")
    parser.add_argument("--current_target", type=str, default=None,
                        help="Target antigen value; when set, only its rows are "
                             "used (excludes library and negative controls).")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    condition_order = [str(c) for c in json.loads(args.conditions)]

    empty = pl.DataFrame(schema={"elementId": pl.Utf8, "MaxFrequency": pl.Float64})

    df = pl.read_csv(args.input_data, schema_overrides={"condition": pl.Utf8})

    # Use the downsampled abundance, matching the main enrichment script
    # (enrichment.py renames downsampledAbundance -> abundance before use).
    if "downsampledAbundance" in df.columns:
        if "abundance" in df.columns:
            df = df.drop("abundance")
        df = df.rename({"downsampledAbundance": "abundance"})

    if df.height == 0:
        empty.write_csv(args.output)
        return

    df = df.with_columns(
        pl.col("abundance").cast(pl.Float64),
        pl.col("condition").cast(pl.Utf8),
    )

    # Restrict to the target track: keep only the current target antigen's rows.
    # Library and negative-control samples carry other antigen values and are
    # dropped here, so they never contribute to the max frequency.
    if args.current_target is not None and "antigen" in df.columns:
        df = df.filter(pl.col("antigen").cast(pl.Utf8) == str(args.current_target))

    if df.height == 0:
        empty.write_csv(args.output)
        return

    # Sum (downsampled) abundance per clonotype per condition across samples.
    agg = (
        df.group_by(["elementId", "condition"])
        .agg(pl.col("abundance").sum().alias("abundance"))
    )

    # Total reads per target condition (denominator for the observed fraction).
    totals_df = agg.group_by("condition").agg(pl.col("abundance").sum().alias("total"))
    totals = dict(zip(totals_df["condition"].to_list(), totals_df["total"].to_list()))

    pivot = (
        agg.pivot(values="abundance", index="elementId", on="condition",
                  aggregate_function="sum")
        .fill_null(0)
    )

    # Observed per-condition frequency (reads / round total), then max across the
    # target rounds.
    freq_cols = []
    for c in condition_order:
        if c not in pivot.columns:
            pivot = pivot.with_columns(pl.lit(0.0).alias(c))
        total = totals.get(c, 0)
        freq_name = f"freq_{c}"
        if total > 0:
            pivot = pivot.with_columns((pl.col(c) / total).alias(freq_name))
        else:
            pivot = pivot.with_columns(pl.lit(0.0).alias(freq_name))
        freq_cols.append(freq_name)

    out = (
        pivot.with_columns(pl.concat_list(freq_cols).list.max().alias("MaxFrequency"))
        .select(["elementId", "MaxFrequency"])
        .sort("elementId")
    )
    out.write_csv(args.output)


if __name__ == "__main__":
    main()
