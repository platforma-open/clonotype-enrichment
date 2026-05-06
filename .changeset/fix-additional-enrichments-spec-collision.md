---
'@platforma-open/milaboratories.clonotype-enrichment.workflow': patch
'@platforma-open/milaboratories.clonotype-enrichment': patch
---

Fix `additionalEnrichments` per-comparison Log2FC columns colliding in the result pool. Each per-comparison column now carries `domain["pl7.app/enrichment/type"] = "comparison"` and `domain["pl7.app/enrichment/comparison"] = <X vs Y>`, mirroring the disambiguation pattern already used for the Overall Log2FC column. Per-comparison columns are now visible to downstream blocks (Clonotype Browser, Antibody Lead Selection).
