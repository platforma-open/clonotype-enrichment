---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.workflow": patch
---

MILAB-6626: add the `condition-order` trace step (block label) to the per-element "Max Frequency" column, mirroring the enrichment columns. Previously the column carried only a single generic trace step, so when several enrichment analyses ran over the same clonotype library their "<Element> Max Frequency" columns were labelled identically and `deriveDistinctLabels` could not tell them apart downstream (e.g. duplicate "Clonotype Max Frequency" entries in the antibody-tcr-lead-selection ranking/filter lists). With the block-label step present, each column now disambiguates per block, exactly as the Log2FC columns already do. The block is named explicitly so it gets a version bump and releases — the automatic cascade from sub-packages is no longer reliable.
