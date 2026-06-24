---
'@platforma-open/milaboratories.clonotype-enrichment.software': minor
'@platforma-open/milaboratories.clonotype-enrichment.workflow': minor
'@platforma-open/milaboratories.clonotype-enrichment.model': minor
'@platforma-open/milaboratories.clonotype-enrichment.ui': minor
'@platforma-open/milaboratories.clonotype-enrichment': minor
---

Add per-clonotype Max Frequency export for cluster input. When the input is cluster abundance, the block identifies the upstream per-clonotype primary abundance (matched by the clonotype identity the cluster's `clusterId` axis carries) and computes each clonotype's maximum frequency across target rounds (library round and negative controls excluded), using the same downsampling and frequency definition as the cluster-level frequencies. Exported on the clonotype-key axis as a `pl7.app/maxFrequency` score for ranking in Lead Selection. No column is produced for clonotype/peptide input.
