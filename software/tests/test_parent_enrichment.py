import math
import os
import sys

import polars as pl
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import parent_enrichment as pe  # noqa: E402

CONDITIONS = ["R0", "R1", "R2"]
LN2 = math.log(2)


def values(rows):
    """rows: {elementId: (e_1_0, e_2_0, e_2_1)}"""
    return pl.DataFrame(
        {
            "elementId": list(rows),
            "e_1_0": [r[0] for r in rows.values()],
            "e_2_0": [r[1] for r in rows.values()],
            "e_2_1": [r[2] for r in rows.values()],
        },
        schema={"elementId": pl.Utf8, "e_1_0": pl.Float64, "e_2_0": pl.Float64, "e_2_1": pl.Float64},
    )


def counts(rows):
    """rows: {elementId: (k_0, k_1, k_2)}"""
    return pl.DataFrame(
        {"elementId": list(rows), **{f"k_{i}": [float(r[i]) for r in rows.values()] for i in range(3)}},
        schema={"elementId": pl.Utf8, "k_0": pl.Float64, "k_1": pl.Float64, "k_2": pl.Float64},
    )


def links(pairs):
    return pl.DataFrame({"elementId": [p[0] for p in pairs], "parentId": [p[1] for p in pairs]})


def mutations(rows):
    return pl.DataFrame({"elementId": list(rows), "mutationCount": list(rows.values())})


def row(frame, element):
    return frame.filter(pl.col("elementId") == element).row(0, named=True)


TWO_PARENTS_VALUES = values({"a0": (1.0, 2.0, 1.0), "a1": (3.0, 1.0, -2.0), "b0": (0.0, 0.0, 0.0), "b1": (0.5, -1.0, -1.5)})
TWO_PARENTS_COUNTS = counts({"a0": (100, 200, 400), "a1": (10, 80, 20), "b0": (50, 50, 50), "b1": (5, 7, 2)})
TWO_PARENTS_LINKS = links([("a0", "A"), ("a1", "A"), ("b0", "B"), ("b1", "B")])
TWO_PARENTS_MUTATIONS = mutations({"a0": 0, "a1": 2, "b0": 0, "b1": 1})


def test_each_variant_is_referenced_to_its_own_parent():
    out, parents, summary = pe.compute(
        CONDITIONS, TWO_PARENTS_VALUES, TWO_PARENTS_COUNTS, TWO_PARENTS_LINKS, TWO_PARENTS_MUTATIONS
    )
    assert summary["mode"] == pe.MODE_REFERENCED
    assert summary["unidentifiable"] == []
    a1, b1, a0 = row(out, "a1"), row(out, "b1"), row(out, "a0")
    assert (a1["pn_1_0"], a1["pn_2_0"], a1["pn_2_1"]) == (2.0, -1.0, -3.0)
    assert (b1["pn_1_0"], b1["pn_2_0"], b1["pn_2_1"]) == (0.5, -1.0, -1.5)
    assert (a0["pn_1_0"], a0["pn_2_0"], a0["pn_2_1"]) == (0.0, 0.0, 0.0)
    assert a1["pn_overall"] == -1.0
    assert a1["reads_2"] == 20


def test_maximum_is_taken_over_normalized_pairs_and_is_not_clipped():
    out, _, _ = pe.compute(CONDITIONS, TWO_PARENTS_VALUES, TWO_PARENTS_COUNTS, TWO_PARENTS_LINKS, TWO_PARENTS_MUTATIONS)
    assert row(out, "a1")["pn_max"] == 2.0
    all_below = values({"a0": (1.0, 1.0, 1.0), "a1": (0.0, -1.0, 0.5)})
    out, _, _ = pe.compute(
        CONDITIONS, all_below, counts({"a0": (9, 9, 9), "a1": (9, 9, 9)}),
        links([("a0", "A"), ("a1", "A")]), mutations({"a0": 0, "a1": 1}),
    )
    assert row(out, "a1")["pn_max"] == -0.5


def test_parent_missing_in_a_round_drops_only_the_pairs_using_it():
    no_r2 = counts({"a0": (100, 200, 0), "a1": (10, 80, 20)})
    out, parents, _ = pe.compute(
        CONDITIONS, values({"a0": (1.0, 2.0, 1.0), "a1": (3.0, 1.0, -2.0)}), no_r2,
        links([("a0", "A"), ("a1", "A")]), mutations({"a0": 0, "a1": 1}),
    )
    a1 = row(out, "a1")
    assert a1["pn_1_0"] == 2.0
    assert a1["pn_2_0"] is None and a1["pn_2_1"] is None and a1["pn_overall"] is None
    assert a1["pn_max"] == 2.0
    a = parents.row(0, named=True)
    assert (a["state_0"], a["state_1"], a["state_2"]) == (pe.STATE_OBSERVED, pe.STATE_OBSERVED, pe.STATE_ABSENT)


def test_thin_parent_still_gives_a_value():
    _, parents, _ = pe.compute(
        CONDITIONS, values({"a0": (1.0, 2.0, 1.0)}), counts({"a0": (19, 20, 1)}),
        links([("a0", "A")]), mutations({"a0": 0}),
    )
    a = parents.row(0, named=True)
    assert (a["state_0"], a["state_1"], a["state_2"]) == (pe.STATE_THIN, pe.STATE_OBSERVED, pe.STATE_THIN)
    assert (a["reads_0"], a["reads_2"]) == (19, 1)


@pytest.mark.parametrize(
    "b_mutations, reason",
    [({"b0": 1, "b1": 1}, pe.REASON_NO_UNMUTATED), ({"b0": 0, "b1": 0}, pe.REASON_SEVERAL_UNMUTATED)],
)
def test_one_unidentifiable_parent_cancels_the_whole_run(b_mutations, reason):
    out, parents, summary = pe.compute(
        CONDITIONS, TWO_PARENTS_VALUES, TWO_PARENTS_COUNTS, TWO_PARENTS_LINKS,
        mutations({"a0": 0, "a1": 2, **b_mutations}),
    )
    assert summary["mode"] == pe.MODE_CANCELLED
    assert summary["unidentifiable"] == [{"parentId": "B", "reason": reason}]
    a1 = row(out, "a1")
    assert (a1["pn_1_0"], a1["pn_2_0"], a1["pn_2_1"]) == (3.0, 1.0, -2.0)
    assert a1["pn_max"] == 3.0
    b = parents.filter(pl.col("parentId") == "B").row(0, named=True)
    assert b["reads_0"] is None and b["state_0"] == pe.STATE_ABSENT


def test_variant_with_two_parents_is_scored_nowhere():
    out, _, summary = pe.compute(
        CONDITIONS, TWO_PARENTS_VALUES, TWO_PARENTS_COUNTS,
        links([("a0", "A"), ("a1", "A"), ("a1", "B"), ("b0", "B"), ("b1", "B")]), TWO_PARENTS_MUTATIONS,
    )
    assert summary["multiParentVariants"] == 1
    a1 = row(out, "a1")
    assert a1["pn_1_0"] is None and a1["pn_max"] is None
    assert a1["reads_0"] == 10


def test_mode_off_gives_reads_only():
    out, parents, summary = pe.compute(CONDITIONS, TWO_PARENTS_VALUES, TWO_PARENTS_COUNTS)
    assert summary == {"mode": None}
    assert parents is None
    assert [c for c in out.columns if c.startswith("pn_")] == []
    assert row(out, "b1")["reads_1"] == 7


def test_negative_control_maximum_is_parent_normalized():
    control = pl.DataFrame({
        "elementId": ["a0", "a1", "a0", "a1"],
        "antigen": ["neg1", "neg1", "neg2", "neg2"],
        "numerator": ["C1"] * 4,
        "denominator": ["C0"] * 4,
        "enrichment": [1.0, 4.0, 2.0, 0.0],
        "numReads": [10.0, 10.0, 0.0, 10.0],
        "denReads": [10.0, 10.0, 10.0, 10.0],
    })
    out, _, _ = pe.compute(
        CONDITIONS, values({"a0": (0.0, 0.0, 0.0), "a1": (1.0, 1.0, 1.0)}),
        counts({"a0": (9, 9, 9), "a1": (9, 9, 9)}),
        links([("a0", "A"), ("a1", "A")]), mutations({"a0": 0, "a1": 1}), control_pairs=control,
    )
    # neg2 is skipped: the parent has no reads in its numerator condition.
    assert row(out, "a1")["pn_maxneg"] == 3.0


# --- errors at the protein grain ------------------------------------------------------------

PROTEIN_MAP = pl.DataFrame({"elementId": ["n1", "n2", "n3", "p1"], "mappedId": ["X", "X", "Y", "P"]})
NT_VALUES = values({"n1": (1.0, 0.0, 0.0), "n2": (3.0, 0.0, 0.0), "n3": (2.0, 0.0, 0.0), "p1": (0.0, 0.0, 0.0)})
NT_COUNTS = counts({"n1": (4, 1, 1), "n2": (4, 1, 1), "n3": (4, 1, 1), "p1": (8, 8, 8)})
AA_VALUES = values({"X": (2.0, 0.0, 0.0), "Y": (2.0, 0.0, 0.0), "P": (0.5, 0.0, 0.0)})
AA_COUNTS = counts({"X": (8, 4, 0), "Y": (4, 2, 2), "P": (8, 8, 8)})


def errors(**extra):
    return pe.compute(
        CONDITIONS, AA_VALUES, AA_COUNTS,
        nt_values=NT_VALUES, nt_counts=NT_COUNTS, protein_map=PROTEIN_MAP, **extra,
    )


def counting(k_num, k_den):
    return math.sqrt(1 / max(k_num, 0.5) + 1 / max(k_den, 0.5)) / LN2


def test_counting_error_uses_the_pseudocount_for_a_zero_count_only():
    out, _, _ = errors()
    assert row(out, "X")["se_2_0"] == pytest.approx(counting(0, 8))
    assert row(out, "X")["se_2_1"] == pytest.approx(counting(0, 4))


def test_replicate_error_is_the_weighted_scatter_and_wins_when_larger():
    out, _, _ = errors()
    x = row(out, "X")
    # x = [1, 3], equal weights: SD/sqrt(n) = sqrt(2)/sqrt(2) = 1.
    assert x["nt_1_0"] == 2
    assert x["se_1_0"] == pytest.approx(max(counting(4, 8), 1.0))


def test_single_variant_has_no_replicate_error():
    out, _, _ = errors()
    y = row(out, "Y")
    assert y["nt_1_0"] == 1
    assert y["se_1_0"] == pytest.approx(counting(2, 4))


def test_error_of_the_maximum_is_taken_at_the_pair_of_the_maximum():
    out, _, _ = errors()
    x = row(out, "X")
    assert x["se_max"] == x["se_1_0"]
    assert x["nt_max"] == 2
    assert x["se_overall"] == x["se_2_0"]


def test_normalized_error_adds_variant_and_parent_in_quadrature():
    out, _, summary = errors(
        links=links([("X", "PX"), ("P", "PX"), ("Y", "PX")]), mutations=mutations({"X": 2, "Y": 1, "P": 0})
    )
    assert summary["mode"] == pe.MODE_REFERENCED
    x = row(out, "X")
    assert x["pn_1_0"] == pytest.approx(1.5)
    expected_counting = math.sqrt(counting(4, 8) ** 2 + counting(8, 8) ** 2)
    assert x["pnse_1_0"] == pytest.approx(max(expected_counting, 1.0))
    assert x["pnse_max"] == pytest.approx(x["pnse_1_0"])
    assert x["pn_2_0"] == 0.0


def test_cancelled_normalized_error_is_the_raw_error():
    out, _, summary = errors(
        links=links([("X", "PX"), ("P", "PX"), ("Y", "PX")]), mutations=mutations({"X": 2, "Y": 1, "P": 1})
    )
    assert summary["mode"] == pe.MODE_CANCELLED
    x = row(out, "X")
    assert x["pnse_1_0"] == pytest.approx(x["se_1_0"])
