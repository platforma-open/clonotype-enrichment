---
"@platforma-open/milaboratories.clonotype-enrichment.kind": minor
"@platforma-open/milaboratories.clonotype-enrichment.model": patch
"@platforma-open/milaboratories.clonotype-enrichment.ui": patch
"@platforma-open/milaboratories.clonotype-enrichment.workflow": patch
---

Compute the block label without the UI

The trace label is now built by the workflow from the native labels of the
clonotype-definition columns plus the conditions, target antigen and filtering mode,
named after the block ("Enrichment Analysis (...)"). Opening the block no longer changes
its arguments, and a block that was never opened still gets a meaningful label. The
subtitle shows the result-pool labels of the clonotype-definition columns, refreshed when
the user picks them. Existing blocks show as stale once after the update. The
init-params contract no longer carries `defaultBlockLabel`; templates that still contain
it keep loading.
