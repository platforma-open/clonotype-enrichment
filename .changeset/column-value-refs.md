---
"@platforma-open/milaboratories.clonotype-enrichment": minor
"@platforma-open/milaboratories.clonotype-enrichment.model": minor
"@platforma-open/milaboratories.clonotype-enrichment.ui": minor
"@platforma-open/milaboratories.clonotype-enrichment.workflow": minor
---

Condition and antigen columns are picked from upstream sample metadata by their result-pool ids, and the picked conditions, rounds, control conditions and antigens are stored as column value references, so the block that produced the metadata knows which of its values this block uses. The options of every value picker are built by the model from the metadata columns. Opening a project created before this change converts the column ids picked by earlier versions to the new ids, which makes the block outdated once; the values picked there are plain values and show as not available until they are picked again.
Conditions, control conditions, antigens and exported comparisons that are no longer available stay selected and are marked as not available instead of being removed silently; an error at the top of the settings lists the conditions and antigens missing from the data, and comparisons the current condition order does not produce are left out of the run.
The block shows links to the blocks it depends on and to blocks that depend on it, via the SDK dependencies plugin.
The checks that keep Run disabled (abundance, condition column, conditions, enrichment threshold, antigen and control settings) now report their messages as args issues instead of failing args derivation, so an incomplete configuration is still kept as a draft for dependency tracking.
