---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.model": patch
---

Fix the main table erroring out when the abundance input is switched — clustered abundance to per-clonotype abundance, say — before the block is re-run.

The table joins the enrichment results with sequence columns discovered from the result pool. The results are keyed on the element axis of the input the last run used, but discovery was anchored on `data` — the *currently selected* input. `outputs` survive an input change, so between the change and the next Run those two disagree, and discovery returns columns that co-index with the new input alone (a cluster centroid sequence reached through a clonotype→cluster linker, for instance). A discovered column's own `axesSpec` still names the old axis, so the per-column axis filter let it through, and the table was asked to join disjoint axes sets: `some of axes sets are disjoint`.

Discovery is now anchored on `activeArgs` — the input the displayed results were actually computed from — so the anchor and the results always come from the same run. The sequence columns reappear once the block is re-run on the new input.
