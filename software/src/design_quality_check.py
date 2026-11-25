"""
Self-check for design mode's extra columns: `python3 design_quality_check.py`.
Two parts: the quality classes on a hand-made frame, then a whole run over a tiny design, which is
what catches a column being read off the wrong frame.
"""

import json
import sys
import tempfile
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
import design_enrichment  # noqa: E402
import design_plots  # noqa: E402
from design_enrichment import quality  # noqa: E402


def structure_of(plan: dict) -> dict:
    """The plan as main.tpl.tengo's planStructure gives it to the enrichment step: no labels."""
    return {
        "positions": [{"id": p["id"], "samples": p["samples"]} for p in plan["positions"]],
        "comparisons": [{"id": c["id"], "num": c["num"], "den": c["den"]} for c in plan["comparisons"]],
        "scores": [
            {k: s[k] for k in ("id", "target", "controls", "steps", "path")}
            for s in plan["scores"]
        ],
    }


def check_run() -> None:
    """One library, one round, one end point: the columns must line up end to end."""
    plan = {
        "designId": "D",
        "designName": "check",
        "comparison": "panel-1",
        "positions": [
            {"id": "p1", "label": "lib", "name": "lib", "samples": ["s_lib"]},
            {"id": "p2", "label": "r1", "name": "r1", "samples": ["s_r1"]},
        ],
        "comparisons": [
            {"id": "c1", "label": "r1 / lib", "group": "arm", "kind": "step", "num": "p2", "den": "p1"}
        ],
        "scores": [
            {
                "id": "s1",
                "label": "Overall Log2FC, arm",
                "arm": "arm",
                "group": "arm",
                "target": "c1",
                "controls": [],
                "steps": ["c1"],
                "path": ["p1", "p2"],
                "end": '["s_r1"]',
                "endName": "arm · r1",
            }
        ],
        "arms": [{"split": "arm", "name": "arm", "role": "target", "score": "s1"}],
        "tracks": [{"label": "arm", "group": "arm", "positions": ["p1", "p2"]}],
    }
    rows = [("s_lib", "winner", 10.0), ("s_r1", "winner", 900.0), ("s_lib", "dud", 500.0), ("s_r1", "dud", 5.0)]
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        pl.DataFrame(rows, schema=["sampleId", "elementId", "abundance"], orient="row").write_csv(
            d / "in.csv"
        )
        # The enrichment step is given the structural plan only. If it ever reads a label again
        # this raises a KeyError here, which is the point: labels must not reach it.
        (d / "structure.json").write_text(json.dumps(structure_of(plan)))
        (d / "plan.json").write_text(json.dumps(plan))
        argv = sys.argv
        sys.argv = [
            "design_enrichment.py",
            *("--input", str(d / "in.csv")),
            *("--plan", str(d / "structure.json")),
            *("--output", str(d / "out.csv")),
            *("--filtered_too_much", str(d / "ftm.txt")),
            *("--plot_data", str(d / "plot_data.csv")),
            *("--stats", str(d / "stats.json")),
        ]
        try:
            design_enrichment.main()
            sys.argv = [
                "design_plots.py",
                *("--plot_data", str(d / "plot_data.csv")),
                *("--plan", str(d / "plan.json")),
                *("--plot_freq", str(d / "freq.csv")),
                *("--plot_bubble", str(d / "bubble.csv")),
                *("--plot_control", str(d / "control.csv")),
            ]
            design_plots.main()
        finally:
            sys.argv = argv
        got = pl.read_csv(d / "out.csv")
        # The plot frames name their axes in pf-design-plots.lib.tengo; a column added or dropped
        # on one side only makes the import fail in the app, not here.
        bubble = pl.read_csv(d / "bubble.csv").columns

    assert set(got.columns) == {"elementId", "c1", "s1", "s1_max", "s1_quality"}, got.columns
    assert set(bubble) == {"elementId", "Comparison", "Enrichment", "Frequency_Numerator"}, bubble
    by = {r["elementId"]: r for r in got.iter_rows(named=True)}
    assert by["winner"]["s1"] > 0 > by["dud"]["s1"], by
    assert by["winner"]["s1_max"] == by["winner"]["c1"], by
    print("design run: OK")


def main() -> None:
    out = pl.DataFrame(
        {
            "elementId": ["stable", "rescuer", "parasite", "dud"],
            # the end point's own log2FC: steady riser, fell back, big but flat, nothing
            "target": [4.0, 0.1, -3.0, 0.0],
            "s1_max": [4.0, 3.0, -3.0, 0.0],
            "s1_freq": [0.01, 0.01, 0.90, 0.01],
            "ctrl": [0.0, 0.0, 0.0, 0.0],
        }
    )
    s = {"id": "s1", "target": "target", "controls": []}
    got = dict(
        out.with_columns(quality(out, s, 2.0)).select("elementId", "s1_quality").iter_rows()
    )
    assert got == {
        "stable": "Stable Binder",
        "rescuer": "Rescuer",
        "parasite": "Parasite",
        "dud": "Weak Binder",
    }, got

    # With a control, anything that ends below the cutoff is a non-binder, as in classic mode.
    s["controls"] = ["ctrl"]
    got = dict(
        out.with_columns(quality(out, s, 2.0)).select("elementId", "s1_quality").iter_rows()
    )
    assert got["stable"] == "Stable Binder", got
    assert got["rescuer"] == got["dud"] == "Non Binder", got
    print("design quality: OK")
    check_run()


if __name__ == "__main__":
    main()
