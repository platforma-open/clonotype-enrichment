# @platforma-open/milaboratories.clonotype-enrichment.ui

## 4.1.1

### Patch Changes

- bbd32b9: Adapt block to DMS datasets, SDK update
- Updated dependencies [bbd32b9]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.1.1

## 4.1.0

### Minor Changes

- bb094bd: Add per-clonotype Max Frequency export for cluster input. When the input is cluster abundance, the block identifies the upstream per-clonotype primary abundance (matched by the clonotype identity the cluster's `clusterId` axis carries) and computes each clonotype's maximum frequency across target rounds (library round and negative controls excluded), using the same downsampling and frequency definition as the cluster-level frequencies. Exported on the clonotype-key axis as a `pl7.app/maxFrequency` score for ranking in Lead Selection. No column is produced for clonotype/peptide input.

### Patch Changes

- Updated dependencies [bb094bd]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.1.0

## 4.0.4

### Patch Changes

- 91a001a: Migrate block onto the structurer (block-tools 2.11.1) — full SDK upgrade through workflow-tengo 6, tengo-builder 4, model/ui-vue 1.79.15. Tooling/layout only; no behavior change.
- Updated dependencies [91a001a]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.4

## 4.0.3

### Patch Changes

- ede4434: update dependencies
- 5b9c1c3: New Changeset
- Updated dependencies [ede4434]
- Updated dependencies [5b9c1c3]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.3

## 4.0.2

### Patch Changes

- c7e0c1f: migrate to block model v3
- Updated dependencies [c7e0c1f]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.2

## 4.0.1

### Patch Changes

- 6b6613c: Derive sampleIds from the abundance column's partition keys instead of walking
  the trace to the upstream Samples & Data dataset PColumn and reading its
  `pl7.app/axisKeys/0` annotation. For `MultiplexedFastq` datasets that
  annotation carries `sampleGroupId` values, not `sampleId`, which broke the
  metadata filter in `MainPage.vue` and left the Condition Order panel empty.

  Sort condition values with natural (numeric-aware) ordering so condition lists
  like `1, 2, ..., 10, 11` appear in numeric order instead of lexicographic
  `1, 10, 11, ..., 2, 20`. Uses `String.localeCompare` with `{ numeric: true,
sensitivity: 'base' }` — handles mixed letter/digit labels (e.g. `Round1 <
Round2 < Round10`).

- Updated dependencies [6b6613c]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.1

## 4.0.0

### Major Changes

- d74e7e0: Support peptides

### Patch Changes

- Updated dependencies [d74e7e0]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.0

## 3.2.6

### Patch Changes

- a64dda5: Fix settings inconsistency when upstream selections change:
  - "Export specific comparisons" and "Present in rounds" now clear entries that no longer match the current condition order.
  - Target antigen, negative controls, and sequenced library antigen are cleared when the antigen column changes.
  - Switching condition or antigen columns no longer leaves the condition/control order empty (caused by the sync watchers acting on stale `useWatchFetch` data during the column transition).

## 3.2.5

### Patch Changes

- Updated dependencies [9ea6985]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.4

## 3.2.4

### Patch Changes

- Updated dependencies [8a37399]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.3

## 3.2.3

### Patch Changes

- 1529eae: update graph-maker version

## 3.2.2

### Patch Changes

- 870d494: Update default values
- Updated dependencies [870d494]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.2

## 3.2.1

### Patch Changes

- bf55aca: Modify default pseudocount
- Updated dependencies [bf55aca]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.1

## 3.2.0

### Minor Changes

- 8956099: Library selection by metadata and bug fixes

### Patch Changes

- Updated dependencies [8956099]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.0

## 3.1.2

### Patch Changes

- 0605e4d: Fix logic showing negative control related options
- Updated dependencies [0605e4d]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.2

## 3.1.1

### Patch Changes

- 16510b7: Adjust enrichment threshold
- Updated dependencies [16510b7]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.1

## 3.1.0

### Minor Changes

- b1ff4a5: Include library usage and enrichment based on a single negative control

### Patch Changes

- ca0ae15: Rename variable and improve conditions check
- 9e22a47: Filter out non-antigen-specific conditions from options
- Updated dependencies [ca0ae15]
- Updated dependencies [9e22a47]
- Updated dependencies [b1ff4a5]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.0

## 3.0.1

### Patch Changes

- effba88: update dependencies

## 3.0.0

### Major Changes

- d76b735: Upgrade to include specific antigen selection, negative control usage, improved filters and pseudocount usage

### Patch Changes

- Updated dependencies [d76b735]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.0.0

## 2.13.6

### Patch Changes

- 089279c: Labels migration

## 2.13.5

### Patch Changes

- efe36e8: Fix unnecessary table rerenders

## 2.13.4

### Patch Changes

- 70243e2: Support custom block title
- Updated dependencies [70243e2]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.5

## 2.13.3

### Patch Changes

- 69998c8: Show running state for tables and graphs, migrate to new project template
- Updated dependencies [69998c8]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.4

## 2.13.2

### Patch Changes

- Updated dependencies [7b64916]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.3

## 2.13.1

### Patch Changes

- 03dd5a5: update graph-maker version

## 2.13.0

### Minor Changes

- 08c2cea: Fix MILAB-4422 bug

### Patch Changes

- 344bdb7: Reset conditionOrder after changing conditionColumnRef

## 2.12.1

### Patch Changes

- b7af80a: technical release
- c3cf16a: technical release
- 087861a: technical release
- df1d277: technical release
- e57c186: technical release
- Updated dependencies [b7af80a]
- Updated dependencies [c3cf16a]
- Updated dependencies [087861a]
- Updated dependencies [df1d277]
- Updated dependencies [e57c186]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.2

## 2.12.0

### Minor Changes

- 30383bc: Support empty inputs

## 2.11.1

### Patch Changes

- 42f20a5: Switch from line plot to scatter plot
- Updated dependencies [42f20a5]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.1

## 2.11.0

### Minor Changes

- 3548d8a: Export additional enrichment scores

### Patch Changes

- 090d6c8: Allow selection of specific enrichment comparisons to export
- Updated dependencies [090d6c8]
- Updated dependencies [3548d8a]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.0

## 2.10.3

### Patch Changes

- b15e3d9: technical release
- Updated dependencies [b15e3d9]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.3

## 2.10.2

### Patch Changes

- Updated dependencies [293fcf5]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.2

## 2.10.1

### Patch Changes

- Updated dependencies [2aa0f2a]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.1

## 2.10.0

### Minor Changes

- 78ab568: Custom clonotype definition for enrichment analysis

### Patch Changes

- Updated dependencies [78ab568]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.0

## 2.9.2

### Patch Changes

- 89ff894: update graph-maker version

## 2.9.1

### Patch Changes

- 859d9d1: Updated SDK.
- Updated dependencies [859d9d1]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.9.1

## 2.9.0

### Minor Changes

- 4270125: Stats work with an empty table (all filtered)

### Patch Changes

- Updated dependencies [4270125]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.9.0

## 2.8.0

### Minor Changes

- eaffd65: Added clonotype filtering option.

### Patch Changes

- Updated dependencies [eaffd65]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.8.0

## 2.7.0

### Minor Changes

- bc547f7: Show block defined cutoff in UI
- 076d9c6: Add stats window

### Patch Changes

- Updated dependencies [bc547f7]
- Updated dependencies [076d9c6]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.7.0

## 2.6.1

### Patch Changes

- 9d43ceb: fix graph-maker version

## 2.6.0

### Minor Changes

- 5fed921: Switch to polars

## 2.5.0

### Minor Changes

- adbe364: Switch to polars

## 2.4.2

### Patch Changes

- a0a4e02: Migrate to use new PlAgDataTableV2
- Updated dependencies [a0a4e02]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.6.1

## 2.4.1

### Patch Changes

- Updated dependencies [9f96153]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.6.0

## 2.4.0

### Minor Changes

- 3e10431: Add downsampling

### Patch Changes

- Updated dependencies [3e10431]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.5.0

## 2.3.1

### Patch Changes

- 0296ae9: Update exports
- Updated dependencies [0296ae9]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.4.1

## 2.3.0

### Minor Changes

- be02daf: Added overall enrichment calculation

### Patch Changes

- Updated dependencies [be02daf]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.4.0

## 2.2.0

### Minor Changes

- 23c6345: FixExports
- 83e1670: Make it work with clonotype-clusters

### Patch Changes

- Updated dependencies [23c6345]
- Updated dependencies [83e1670]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.3.0

## 2.1.0

### Minor Changes

- 919ae72: Updated clonotype labels

### Patch Changes

- Updated dependencies [919ae72]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.2.0

## 2.0.6

### Patch Changes

- Updated dependencies [a6123ff]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.3

## 2.0.5

### Patch Changes

- 011007d: Ordered categorical axis values
- Updated dependencies [011007d]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.2

## 2.0.4

### Patch Changes

- 0914a49: Updated export specifications

## 2.0.3

### Patch Changes

- 289344b: Updated line plot to show clonotype frequency
- Updated dependencies [289344b]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.1

## 2.0.2

### Patch Changes

- Updated dependencies [8a8b908]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.0

## 2.0.1

### Patch Changes

- aa5e76e: Updated block metadata
- Updated dependencies [aa5e76e]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.0.1

## 2.0.0

### Major Changes

- 32a9a57: First release

### Patch Changes

- Updated dependencies [32a9a57]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.0.0
