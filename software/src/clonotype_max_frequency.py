"""
Per-clonotype maximum frequency across target selection rounds.

Used when the enrichment block input is *cluster* abundance: the enrichment
analysis runs at cluster resolution, but Lead Selection ranks individual
clonotypes, so we surface each clonotype's own max frequency as a score.

Frequency is computed with the SAME definition the main enrichment script uses
for its per-condition frequencies (downsampled abundance + pseudo-count
normalization), so the two are comparable:

    freq_c = (abundance_c + p) / (total_c + N * p)

where, for the target track:
  - abundance_c : the clonotype's summed (downsampled) abundance in condition c
  - total_c     : total reads in condition c
  - N           : number of clonotypes in the track
  - p           : pseudo-count

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
    parser.add_argument("--pseudo_count", type=int, default=1)
    parser.add_argument("--current_target", type=str, default=None,
                        help="Target antigen value; when set, only its rows are "
                             "used (excludes library and negative controls).")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    condition_order = [str(c) for c in json.loads(args.conditions)]
    pseudo = args.pseudo_count

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

    # Track-level totals and clonotype count for the normalization denominator.
    totals_df = agg.group_by("condition").agg(pl.col("abundance").sum().alias("total"))
    totals = dict(zip(totals_df["condition"].to_list(), totals_df["total"].to_list()))
    n_clonotypes = agg.select("elementId").n_unique()

    pivot = (
        agg.pivot(values="abundance", index="elementId", on="condition",
                  aggregate_function="sum")
        .fill_null(0)
    )

    # Per-condition frequency, then max across the target rounds only.
    freq_cols = []
    for c in condition_order:
        if c not in pivot.columns:
            pivot = pivot.with_columns(pl.lit(0).alias(c))
        total = totals.get(c, 1)
        denom = total + (n_clonotypes * pseudo)
        if denom <= 0:
            denom = 1
        freq_name = f"freq_{c}"
        pivot = pivot.with_columns(
            ((pl.col(c) + pseudo) / denom).alias(freq_name)
        )
        freq_cols.append(freq_name)

    out = (
        pivot.with_columns(pl.concat_list(freq_cols).list.max().alias("MaxFrequency"))
        .select(["elementId", "MaxFrequency"])
        .sort("elementId")
    )
    out.write_csv(args.output)


if __name__ == "__main__":
    main()
