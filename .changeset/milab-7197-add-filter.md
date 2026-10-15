---
"@platforma-open/milaboratories.clonotype-enrichment": minor
"@platforma-open/milaboratories.clonotype-enrichment.kind": minor
"@platforma-open/milaboratories.clonotype-enrichment.model": minor
"@platforma-open/milaboratories.clonotype-enrichment.ui": minor
"@platforma-open/milaboratories.clonotype-enrichment.workflow": minor
---

Update the SDK and accept a subset filter (e.g. a Repertoire Labeling label or Lead Selection picks) with the input abundance. The dataset list is built with buildDatasetOptions (requireEnrichments: false). The subset restricts the input before the analysis, so frequencies and enrichment are computed within the subset and differ from a full-data run. Outputs of a subset run carry pl7.app/inputSubset in their domain and a trace rooted in the subset, so their labels name it. Unfiltered runs are unchanged.
