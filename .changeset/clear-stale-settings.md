---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.ui": patch
---

Fix settings inconsistency when upstream selections change:
- "Export specific comparisons" and "Present in rounds" now clear entries that no longer match the current condition order.
- Target antigen, negative controls, and sequenced library antigen are cleared when the antigen column changes.
- Switching condition or antigen columns no longer leaves the condition/control order empty (caused by the sync watchers acting on stale `useWatchFetch` data during the column transition).