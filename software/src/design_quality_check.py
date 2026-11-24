"""
Self-check for the Enrichment Quality classes in design mode: `python3 design_quality_check.py`.
The cutoffs are percentiles of the run, so the four clones below are written to sit on either
side of each other rather than at fixed values.
"""

import sys
from pathlib import Path

import polars as pl

sys.path.insert(0, str(Path(__file__).resolve().parent))
from design_enrichment import quality  # noqa: E402


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


if __name__ == "__main__":
    main()
