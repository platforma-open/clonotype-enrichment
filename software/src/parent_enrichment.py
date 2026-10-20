"""Parent-normalized enrichment, its measurement error and the parent table, for one grain.

Column headers name conditions by their index in the effective condition order, never by name, since
names are arbitrary user text: `pn_{i}_{j}` is the value for "condition i vs condition j".
"""
import argparse
import json
import math
from typing import Dict, List, Optional, Tuple

import polars as pl

MODE_REFERENCED = "referenced"
MODE_CANCELLED = "cancelled"

REASON_NO_UNMUTATED = "no-unmutated-variant"
REASON_SEVERAL_UNMUTATED = "several-unmutated-variants"

STATE_OBSERVED = "observed"
STATE_THIN = "thin"
STATE_ABSENT = "absent"

# Below this many reads the symmetric error understates; the column descriptions name the same bound.
THIN_READS = 20

# Stands in for a zero read count in the counting error only, never in a value.
ZERO_READS_PSEUDOCOUNT = 0.5

ID = "elementId"
PARENT = "parentId"
PARENT_KEY = "parentKey"
REASON = "reason"
PROTEIN = "mappedId"


def pair_indices(n_conditions: int) -> List[Tuple[int, int]]:
    """Every ordered pair (later, earlier), in the order the enrichment script emits them."""
    return [(i, j) for i in range(1, n_conditions) for j in range(i)]


def key(i: int, j: int) -> str:
    return f"{i}_{j}"


def read_enrichment(path: str, conditions: List[str]) -> pl.DataFrame:
    """`elementId` plus `e_{i}_{j}`: the block's own log2FC per pair."""
    renames = {
        f"Enrichment {conditions[i]} vs {conditions[j]}": f"e_{key(i, j)}"
        for i, j in pair_indices(len(conditions))
    }
    frame = pl.read_csv(
        path,
        columns=[ID, *renames],
        schema_overrides={ID: pl.Utf8, **{name: pl.Float64 for name in renames}},
    )
    return frame.rename(renames)


def read_counts(path: str, conditions: List[str]) -> pl.DataFrame:
    """`elementId` plus `k_{i}`: reads per condition."""
    renames = {condition: f"k_{i}" for i, condition in enumerate(conditions)}
    frame = pl.read_csv(
        path,
        columns=[ID, *renames],
        schema_overrides={ID: pl.Utf8, **{name: pl.Float64 for name in renames}},
    )
    return frame.rename(renames)


def resolve_parents(links: pl.DataFrame, mutations: pl.DataFrame) -> Tuple[pl.DataFrame, pl.DataFrame, int]:
    """The parent table, each variant's single parent, and the count of variants with several.

    A parent's row is the variant linked to it whose mutation count is zero. Returns:
    `[parentId, parentKey, reason]` with exactly one of the last two set; `[elementId, parentId]` for
    variants with one parent; the number of variants scored nowhere because they have several.
    """
    links = links.select(pl.col(ID).cast(pl.Utf8), pl.col(PARENT).cast(pl.Utf8)).unique()
    per_variant = links.group_by(ID).agg(pl.col(PARENT).n_unique().alias("_n"))
    several = per_variant.filter(pl.col("_n") > 1).select(ID)
    assignment = links.join(several, on=ID, how="anti").sort(ID)

    unmutated = mutations.filter(pl.col("mutationCount") == 0).select(pl.col(ID).cast(pl.Utf8))
    candidates = (
        links.join(unmutated, on=ID, how="inner")
        .group_by(PARENT)
        .agg(pl.col(ID).first().alias("_first"), pl.len().alias("_n"))
    )
    parents = (
        links.select(PARENT).unique()
        .join(candidates, on=PARENT, how="left")
        .with_columns(
            pl.when(pl.col("_n") == 1).then(pl.col("_first")).otherwise(None).alias(PARENT_KEY),
            pl.when(pl.col("_n").is_null()).then(pl.lit(REASON_NO_UNMUTATED))
            .when(pl.col("_n") > 1).then(pl.lit(REASON_SEVERAL_UNMUTATED))
            .otherwise(None)
            .alias(REASON),
        )
        .select(PARENT, PARENT_KEY, REASON)
        .sort(PARENT)
    )
    return parents, assignment, several.height


def counting_errors(counts: pl.DataFrame, pairs: List[Tuple[int, int]]) -> pl.DataFrame:
    """`c_{i}_{j}`: (1/ln2)·sqrt(1/k_i + 1/k_j), a zero count replaced by the error pseudocount."""
    def floored(i: int) -> pl.Expr:
        return pl.max_horizontal(pl.col(f"k_{i}"), pl.lit(ZERO_READS_PSEUDOCOUNT))

    return counts.select(
        ID,
        *[
            ((1.0 / floored(i) + 1.0 / floored(j)).sqrt() / math.log(2)).alias(f"c_{key(i, j)}")
            for i, j in pairs
        ],
    )


def replicate_errors(
    nt_values: pl.DataFrame, nt_counts: pl.DataFrame, protein_map: pl.DataFrame, pairs: List[Tuple[int, int]]
) -> pl.DataFrame:
    """`r_{i}_{j}` and `n_{i}_{j}` per protein: the scatter of its nucleotide variants' log2FC.

    SE² = n/(n−1) · Σ wᵢ² (xᵢ − x̄)² / (Σ wᵢ)², weighted by each variant's reads in the reference
    round j. Null, not zero, with fewer than two variants: zero would claim perfect agreement.
    `nt_values` are taken before the block's filters, as the protein's pooled reads are. A variant
    with no reads in round j carries no weight and is not counted.
    """
    rows = nt_values.join(protein_map, on=ID, how="inner").join(nt_counts, on=ID, how="left")
    result = protein_map.select(pl.col(PROTEIN).alias(ID)).unique()
    for i, j in pairs:
        x, w = pl.col(f"e_{key(i, j)}"), pl.col(f"k_{j}").fill_null(0.0)
        per_pair = (
            rows.filter(x.is_not_null() & (w > 0))
            .with_columns(((w * x).sum().over(PROTEIN) / w.sum().over(PROTEIN)).alias("_centre"))
            .group_by(PROTEIN)
            .agg(
                (w ** 2 * (x - pl.col("_centre")) ** 2).sum().alias("_scatter"),
                w.sum().alias("_weights"),
                pl.len().alias("_n"),
            )
            .select(
                pl.col(PROTEIN).alias(ID),
                pl.when((pl.col("_n") > 1) & (pl.col("_weights") > 0))
                .then((pl.col("_n") / (pl.col("_n") - 1) * pl.col("_scatter")).sqrt() / pl.col("_weights"))
                .otherwise(None)
                .alias(f"r_{key(i, j)}"),
                pl.col("_n").cast(pl.Int64).alias(f"n_{key(i, j)}"),
            )
        )
        result = result.join(per_pair, on=ID, how="left")
    return result.with_columns(pl.col(f"n_{key(i, j)}").fill_null(0) for i, j in pairs)


def at_argmax(value_cols: List[str]) -> Tuple[pl.Expr, pl.Expr]:
    """The maximum over the non-null values, null where all are, and the position it was taken at
    (the first one on a tie)."""
    position = pl.concat_list([pl.col(c).fill_null(float("-inf")) for c in value_cols]).list.arg_max()
    return pl.max_horizontal(value_cols), position


def pick(cols: List[str], position: pl.Expr, present: pl.Expr) -> pl.Expr:
    return pl.when(present).then(pl.concat_list([pl.col(c) for c in cols]).list.get(position, null_on_oob=True))


def quadrature(*terms: pl.Expr) -> pl.Expr:
    """sqrt of the sum of squares over the non-null terms; null when all are null."""
    squares = [t ** 2 for t in terms]
    return pl.when(pl.any_horizontal([t.is_not_null() for t in terms])).then(pl.sum_horizontal(squares).sqrt())


def larger(counting: pl.Expr, replicate: pl.Expr) -> pl.Expr:
    """max(counting, replicate); a null replicate leaves the counting error."""
    return pl.max_horizontal(counting, replicate.fill_null(counting))


def compute(
    conditions: List[str],
    values: pl.DataFrame,
    counts: pl.DataFrame,
    links: Optional[pl.DataFrame] = None,
    mutations: Optional[pl.DataFrame] = None,
    control_pairs: Optional[pl.DataFrame] = None,
    nt_values: Optional[pl.DataFrame] = None,
    nt_counts: Optional[pl.DataFrame] = None,
    protein_map: Optional[pl.DataFrame] = None,
    reference: Optional[pl.DataFrame] = None,
) -> Tuple[pl.DataFrame, Dict]:
    """Returns the per-element values table and the run summary.

    `values` holds the variants the block shows, after its filters. `reference` holds every element
    before them; parents are looked up there, so a filtered parent still serves its variants.
    """
    n = len(conditions)
    pairs = pair_indices(n)
    pair_keys = [key(i, j) for i, j in pairs]
    overall = key(n - 1, 0) if n >= 2 else None
    mode_on = links is not None and mutations is not None
    with_errors = nt_values is not None and nt_counts is not None and protein_map is not None

    errors = None
    if with_errors:
        errors = counting_errors(counts, pairs).join(
            replicate_errors(nt_values, nt_counts, protein_map, pairs), on=ID, how="left"
        )

    def with_counts_and_errors(frame: pl.DataFrame) -> pl.DataFrame:
        frame = frame.join(counts, on=ID, how="left")
        if errors is not None:
            frame = frame.join(errors, on=ID, how="left")
            for k in pair_keys:
                frame = frame.with_columns(larger(pl.col(f"c_{k}"), pl.col(f"r_{k}")).alias(f"se_{k}"))
        return frame

    lookup = with_counts_and_errors(values if reference is None else reference)
    values = with_counts_and_errors(values)
    out = values.select(ID, *[pl.col(f"k_{i}").cast(pl.Int64).alias(f"reads_{i}") for i in range(n)])

    summary: Dict = {"mode": None}

    if mode_on:
        parents, assignment, several = resolve_parents(links, mutations)
        unidentifiable = parents.filter(pl.col(REASON).is_not_null())
        mode = MODE_CANCELLED if unidentifiable.height > 0 else MODE_REFERENCED
        summary = {
            "mode": mode,
            "parents": parents.height,
            "unidentifiable": [
                {"parentId": row[PARENT], "reason": row[REASON]} for row in unidentifiable.iter_rows(named=True)
            ],
            "multiParentVariants": several,
        }

        scored = values.join(assignment, on=ID, how="inner")
        parent_cols = [f"e_{k}" for k in pair_keys] + [f"k_{i}" for i in range(n)]
        if with_errors:
            parent_cols += [f"c_{k}" for k in pair_keys] + [f"r_{k}" for k in pair_keys]
        parent_values = parents.filter(pl.col(PARENT_KEY).is_not_null()).join(
            lookup.select(pl.col(ID).alias(PARENT_KEY), *[pl.col(c).alias(f"p_{c}") for c in parent_cols]),
            on=PARENT_KEY,
            how="inner",
        )
        scored = scored.join(parent_values.drop(PARENT_KEY, REASON), on=PARENT, how="left")

        for i, j in pairs:
            k = key(i, j)
            if mode == MODE_CANCELLED:
                pn = pl.col(f"e_{k}")
            else:
                observed = (pl.col(f"p_k_{i}") > 0) & (pl.col(f"p_k_{j}") > 0)
                pn = pl.when(observed).then(pl.col(f"e_{k}") - pl.col(f"p_e_{k}"))
            scored = scored.with_columns(pn.alias(f"pn_{k}"))
            if with_errors:
                if mode == MODE_CANCELLED:
                    pnse = pl.col(f"se_{k}")
                else:
                    pnse = larger(
                        quadrature(pl.col(f"c_{k}"), pl.col(f"p_c_{k}")),
                        quadrature(pl.col(f"r_{k}"), pl.col(f"p_r_{k}")),
                    )
                scored = scored.with_columns(
                    pl.when(pl.col(f"pn_{k}").is_not_null()).then(pnse).alias(f"pnse_{k}")
                )

        pn_cols = [f"pn_{k}" for k in pair_keys]
        normalized = [pl.col(c) for c in pn_cols]
        if pn_cols:
            maximum, position = at_argmax(pn_cols)
            normalized.append(maximum.alias("pn_max"))
            if with_errors:
                pnse_cols = [f"pnse_{k}" for k in pair_keys]
                normalized += [pl.col(c) for c in pnse_cols]
                normalized.append(pick(pnse_cols, position, maximum.is_not_null()).alias("pnse_max"))
        if overall is not None:
            normalized.append(pl.col(f"pn_{overall}").alias("pn_overall"))
            if with_errors:
                normalized.append(pl.col(f"pnse_{overall}").alias("pnse_overall"))
        out = out.join(scored.select(ID, *normalized), on=ID, how="left")

        if control_pairs is not None:
            out = out.join(
                max_negative_control(control_pairs, assignment, parents, mode).join(
                    values.select(ID), on=ID, how="semi"
                ),
                on=ID,
                how="left",
            )

        summary["conditions"] = list(conditions)
        summary["parentStates"] = parent_states(parents, lookup, n)

    if with_errors:
        raw_cols = [f"e_{k}" for k in pair_keys]
        se_cols = [f"se_{k}" for k in pair_keys]
        nt_cols = [f"n_{k}" for k in pair_keys]
        maximum, position = at_argmax(raw_cols)
        present = maximum.is_not_null()
        error_cols = [pl.col(c) for c in se_cols] + [pl.col(c).alias(f"nt_{c[2:]}") for c in nt_cols]
        error_cols += [pick(se_cols, position, present).alias("se_max"), pick(nt_cols, position, present).alias("nt_max")]
        if overall is not None:
            error_cols += [pl.col(f"se_{overall}").alias("se_overall"), pl.col(f"n_{overall}").alias("nt_overall")]
        out = out.join(values.select(ID, *error_cols), on=ID, how="left")

    return out.sort(ID), summary


def max_negative_control(
    control_pairs: pl.DataFrame, assignment: pl.DataFrame, parents: pl.DataFrame, mode: str
) -> pl.DataFrame:
    """`pn_maxneg`: the maximum over control-arm pairs of the variant's log2FC minus its parent's.

    A pair counts only where the parent was seen in both of its conditions. Not clipped at zero.
    """
    pair_key = ["antigen", "numerator", "denominator"]
    rows = control_pairs.with_columns(pl.col(ID).cast(pl.Utf8)).join(assignment, on=ID, how="inner")
    if mode == MODE_CANCELLED:
        normalized = rows.select(ID, pl.col("enrichment").alias("_pn"))
    else:
        parent_rows = parents.filter(pl.col(PARENT_KEY).is_not_null()).join(
            control_pairs.with_columns(pl.col(ID).cast(pl.Utf8)).rename(
                {ID: PARENT_KEY, "enrichment": "_pe", "numReads": "_pnum", "denReads": "_pden"}
            ),
            on=PARENT_KEY,
            how="inner",
        )
        normalized = (
            rows.join(parent_rows.select(PARENT, *pair_key, "_pe", "_pnum", "_pden"), on=[PARENT, *pair_key], how="inner")
            .filter((pl.col("_pnum") > 0) & (pl.col("_pden") > 0))
            .select(ID, (pl.col("enrichment") - pl.col("_pe")).alias("_pn"))
        )
    return (
        normalized.filter(pl.col("_pn").is_not_null())
        .group_by(ID)
        .agg(pl.col("_pn").max().alias("pn_maxneg"))
    )


def parent_reads(parents: pl.DataFrame, values: pl.DataFrame, n: int) -> pl.DataFrame:
    """`[parentId, k_{i}]`. A parent not identified, or not scored, has null reads."""
    scored = values.select(pl.col(ID).alias(PARENT_KEY), *[pl.col(f"k_{i}") for i in range(n)])
    return parents.join(scored, on=PARENT_KEY, how="left").select(PARENT, *[f"k_{i}" for i in range(n)])


def state(reads: pl.Expr) -> pl.Expr:
    return (
        pl.when(reads.is_null() | (reads <= 0)).then(pl.lit(STATE_ABSENT))
        .when(reads < THIN_READS).then(pl.lit(STATE_THIN))
        .otherwise(pl.lit(STATE_OBSERVED))
    )


def parent_states(parents: pl.DataFrame, values: pl.DataFrame, n: int) -> List[Dict]:
    """Per parent, its state and reads in each condition, in condition order, for the run summary."""
    table = (
        parent_reads(parents, values, n)
        .with_columns(*[state(pl.col(f"k_{i}")).alias(f"state_{i}") for i in range(n)])
        .sort(PARENT)
    )
    return [
        {
            "parentId": row[PARENT],
            "states": [row[f"state_{i}"] for i in range(n)],
            "reads": [None if row[f"k_{i}"] is None else int(row[f"k_{i}"]) for i in range(n)],
        }
        for row in table.iter_rows(named=True)
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--conditions", required=True, help="JSON list: the effective condition order")
    parser.add_argument("--enrichment", required=True, help="enrichment_results.csv of this grain")
    parser.add_argument("--counts", required=True, help="reads per element per condition, this grain")
    parser.add_argument("--parents", help="CSV [elementId, parentId]: the parent linker")
    parser.add_argument("--mutations", help="CSV [elementId, mutationCount]")
    parser.add_argument("--control_pairs", help="control-arm pairs of this grain")
    parser.add_argument("--nt_enrichment", help="pairwise log2FC at nucleotide grain, before filters")
    parser.add_argument("--nt_counts", help="reads per nucleotide variant per condition")
    parser.add_argument("--protein_map", help="CSV [elementId, mappedId]: nucleotide -> amino-acid variant")
    parser.add_argument("--reference", help="pairwise log2FC of every element of this grain, before filters")
    parser.add_argument("--values_out", required=True)
    parser.add_argument("--summary_out", required=True)
    args = parser.parse_args()

    conditions = [str(c) for c in json.loads(args.conditions)]

    def table(path: Optional[str], schema: Dict) -> Optional[pl.DataFrame]:
        return None if path is None else pl.read_csv(path, columns=list(schema), schema_overrides=schema)

    out, summary = compute(
        conditions,
        read_enrichment(args.enrichment, conditions),
        read_counts(args.counts, conditions),
        links=table(args.parents, {ID: pl.Utf8, PARENT: pl.Utf8}),
        mutations=table(args.mutations, {ID: pl.Utf8, "mutationCount": pl.Int64}),
        control_pairs=table(args.control_pairs, {
            ID: pl.Utf8, "antigen": pl.Utf8, "numerator": pl.Utf8, "denominator": pl.Utf8,
            "enrichment": pl.Float64, "numReads": pl.Float64, "denReads": pl.Float64,
        }),
        nt_values=None if args.nt_enrichment is None else read_enrichment(args.nt_enrichment, conditions),
        nt_counts=None if args.nt_counts is None else read_counts(args.nt_counts, conditions),
        protein_map=table(args.protein_map, {ID: pl.Utf8, PROTEIN: pl.Utf8}),
        reference=None if args.reference is None else read_enrichment(args.reference, conditions),
    )

    out.write_csv(args.values_out)
    with open(args.summary_out, "w") as f:
        json.dump(summary, f, sort_keys=True)


if __name__ == "__main__":
    main()
