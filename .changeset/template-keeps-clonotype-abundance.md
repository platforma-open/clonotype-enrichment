---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.kind": minor
"@platforma-open/milaboratories.clonotype-enrichment.model": patch
---

Keep the per-clonotype abundance of a cluster input in project templates

The initialization params of the kind carry `clonotypeAbundanceRef`, the per-clonotype (or
per-variant) abundance a cluster abundance was built from, and template export writes it. A
block created from a template now runs with it, so the clonotype Max Frequency score is
computed, and opening the block afterwards no longer changes its arguments, which made the
block and every block below it stale. Templates without the field keep loading.
