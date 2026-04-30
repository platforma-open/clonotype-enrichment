---
'@platforma-open/milaboratories.clonotype-enrichment.model': patch
'@platforma-open/milaboratories.clonotype-enrichment.ui': patch
'@platforma-open/milaboratories.clonotype-enrichment': patch
---

Derive sampleIds from the abundance column's partition keys instead of walking
the trace to the upstream Samples & Data dataset PColumn and reading its
`pl7.app/axisKeys/0` annotation. For `MultiplexedFastq` datasets that
annotation carries `sampleGroupId` values, not `sampleId`, which broke the
metadata filter in `MainPage.vue` and left the Condition Order panel empty.

Sort condition values with natural (numeric-aware) ordering so condition lists
like `1, 2, ..., 10, 11` appear in numeric order instead of lexicographic
`1, 10, 11, ..., 2, 20`. Uses `String.localeCompare` with `{ numeric: true,
sensitivity: 'base' }` — handles mixed letter/digit labels (e.g. `Round1 <
Round2 < Round10`).
