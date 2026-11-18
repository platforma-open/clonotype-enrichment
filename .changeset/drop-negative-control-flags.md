---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.kind": minor
"@platforma-open/milaboratories.clonotype-enrichment.model": patch
"@platforma-open/milaboratories.clonotype-enrichment.ui": patch
"@platforma-open/milaboratories.clonotype-enrichment.workflow": patch
---

Drop the unused negative-control flags from the block data

`antigenControlConfig.hasSingleConditionNegativeControl` and
`hasMultiConditionNegativeControl` only mirrored the picked control conditions and nothing read
them, but they were part of the args. Opening a block created from a template could rewrite them,
which made an already calculated block and every block below it stale without changing any
result. They are no longer stored, sent to the workflow or exported to templates; the kind no
longer requires them and drops them from templates that still carry them.
