# @platforma-open/milaboratories.clonotype-enrichment

## 3.1.4

### Patch Changes

- 7b129c4: SDK Update

## 3.1.3

### Patch Changes

- eb76053: MILAB-6564: use the `bright` default palette on the Lines page. Also update graph-maker to 1.6.1 and refresh SDK dependencies via `upgrade-sdk` (includes the block structurer migration). The block is named explicitly so it gets a version bump and releases — the automatic cascade from sub-packages is no longer reliable.

## 3.1.2

### Patch Changes

- b7b2b71: Update SDK

## 3.1.1

### Patch Changes

- bbd32b9: Adapt block to DMS datasets, SDK update

## 3.1.0

### Minor Changes

- bb094bd: Add per-clonotype Max Frequency export for cluster input. When the input is cluster abundance, the block identifies the upstream per-clonotype primary abundance (matched by the clonotype identity the cluster's `clusterId` axis carries) and computes each clonotype's maximum frequency across target rounds (library round and negative controls excluded), using the same downsampling and frequency definition as the cluster-level frequencies. Exported on the clonotype-key axis as a `pl7.app/maxFrequency` score for ranking in Lead Selection. No column is produced for clonotype/peptide input.

### Patch Changes

- Updated dependencies [bb094bd]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@4.1.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.1.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.1.0

## 3.0.6

### Patch Changes

- Updated dependencies [91a001a]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@4.0.2
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.4
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.0.4

## 3.0.5

### Patch Changes

- 5b9c1c3: New Changeset
- Updated dependencies [ede4434]
- Updated dependencies [5b9c1c3]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.3
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.0.3

## 3.0.4

### Patch Changes

- Updated dependencies [c7e0c1f]
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.0.2

## 3.0.3

### Patch Changes

- fb62640: Universalize block

## 3.0.2

### Patch Changes

- ade5149: Fix `additionalEnrichments` per-comparison Log2FC columns colliding in the result pool. Each per-comparison column now carries `domain["pl7.app/enrichment/type"] = "comparison"` and `domain["pl7.app/enrichment/comparison"] = <X vs Y>`, mirroring the disambiguation pattern already used for the Overall Log2FC column. Per-comparison columns are now visible to downstream blocks (Clonotype Browser, Antibody Lead Selection).
- Updated dependencies [ade5149]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@4.0.1

## 3.0.1

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
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.0.1

## 3.0.0

### Major Changes

- d74e7e0: Support peptides

### Patch Changes

- Updated dependencies [d74e7e0]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@4.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@4.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@4.0.0

## 2.2.46

### Patch Changes

- a64dda5: Fix settings inconsistency when upstream selections change:
  - "Export specific comparisons" and "Present in rounds" now clear entries that no longer match the current condition order.
  - Target antigen, negative controls, and sequenced library antigen are cleared when the antigen column changes.
  - Switching condition or antigen columns no longer leaves the condition/control order empty (caused by the sync watchers acting on stale `useWatchFetch` data during the column transition).
- Updated dependencies [a64dda5]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.6

## 2.2.45

### Patch Changes

- 9ea6985: Add other VDJ region sequence columns (CDR1, CDR2, FR1, etc.) to the enrichment table as optional columns
- Updated dependencies [9ea6985]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.4
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.5

## 2.2.44

### Patch Changes

- Updated dependencies [8a37399]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.2.1
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.3
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.4

## 2.2.43

### Patch Changes

- Updated dependencies [1529eae]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.3

## 2.2.42

### Patch Changes

- 2925661: Downgrade @milaboratories/graph-maker to 1.1.224

## 2.2.41

### Patch Changes

- Updated dependencies [870d494]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.2

## 2.2.40

### Patch Changes

- Updated dependencies [bf55aca]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.1

## 2.2.39

### Patch Changes

- Updated dependencies [8956099]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.2.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.2.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.2.0

## 2.2.38

### Patch Changes

- Updated dependencies [0605e4d]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.1.2
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.1.2

## 2.2.37

### Patch Changes

- Updated dependencies [16510b7]
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.1.1

## 2.2.36

### Patch Changes

- Updated dependencies [77b02ac]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.1.1

## 2.2.35

### Patch Changes

- Updated dependencies [ca0ae15]
- Updated dependencies [9e22a47]
- Updated dependencies [b1ff4a5]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.1.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.1.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.1.0

## 2.2.34

### Patch Changes

- Updated dependencies [effba88]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.0.1

## 2.2.33

### Patch Changes

- c1e8eb9: SDK Update

## 2.2.32

### Patch Changes

- Updated dependencies [d76b735]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@3.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@3.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@3.0.0

## 2.2.31

### Patch Changes

- @platforma-open/milaboratories.clonotype-enrichment.workflow@2.22.4

## 2.2.30

### Patch Changes

- Updated dependencies [089279c]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.6

## 2.2.29

### Patch Changes

- efe36e8: Fix unnecessary table rerenders
- Updated dependencies [efe36e8]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.5

## 2.2.28

### Patch Changes

- Updated dependencies [70243e2]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.22.3
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.5
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.4

## 2.2.27

### Patch Changes

- 69998c8: Show running state for tables and graphs, migrate to new project template
- Updated dependencies [69998c8]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.22.2
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.4
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.3

## 2.2.26

### Patch Changes

- Updated dependencies [7b64916]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.3
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.2

## 2.2.25

### Patch Changes

- f34a79b: Block metadata updated

## 2.2.24

### Patch Changes

- cfc2a24: Update SDK

## 2.2.23

### Patch Changes

- Updated dependencies [03dd5a5]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.1

## 2.2.22

### Patch Changes

- Updated dependencies [4602121]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.22.1

## 2.2.21

### Patch Changes

- Updated dependencies [344bdb7]
- Updated dependencies [08c2cea]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.13.0
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.22.0

## 2.2.20

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
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.12.1
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.21.1

## 2.2.19

### Patch Changes

- Updated dependencies [30383bc]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.21.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.12.0

## 2.2.18

### Patch Changes

- Updated dependencies [42f20a5]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.11.1

## 2.2.17

### Patch Changes

- Updated dependencies [090d6c8]
- Updated dependencies [3548d8a]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.20.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.11.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.11.0

## 2.2.16

### Patch Changes

- b15e3d9: technical release
- Updated dependencies [b15e3d9]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.3
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.10.3
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.19.3

## 2.2.15

### Patch Changes

- Updated dependencies [293fcf5]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.2
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.19.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.10.2

## 2.2.14

### Patch Changes

- Updated dependencies [2aa0f2a]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.1
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.19.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.10.1

## 2.2.13

### Patch Changes

- Updated dependencies [78ab568]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.19.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.10.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.10.0

## 2.2.12

### Patch Changes

- Updated dependencies [89ff894]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.9.2

## 2.2.11

### Patch Changes

- 859d9d1: Updated SDK.
- Updated dependencies [859d9d1]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.9.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.9.1
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.18.2

## 2.2.10

### Patch Changes

- Updated dependencies [4270125]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.9.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.9.0
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.18.1

## 2.2.9

### Patch Changes

- Updated dependencies [eaffd65]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.18.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.8.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.8.0

## 2.2.8

### Patch Changes

- @platforma-open/milaboratories.clonotype-enrichment.workflow@2.17.1

## 2.2.7

### Patch Changes

- Updated dependencies [bc547f7]
- Updated dependencies [076d9c6]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.17.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.7.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.7.0

## 2.2.6

### Patch Changes

- Updated dependencies [9d43ceb]
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.6.1

## 2.2.5

### Patch Changes

- Updated dependencies [40fd37c]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.16.0

## 2.2.4

### Patch Changes

- @platforma-open/milaboratories.clonotype-enrichment.workflow@2.15.1

## 2.2.3

### Patch Changes

- Updated dependencies [5fed921]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.15.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.6.0

## 2.2.2

### Patch Changes

- Updated dependencies [adbe364]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.14.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.5.0

## 2.2.1

### Patch Changes

- 5ba1d70: allow prepare venv on Windows

## 2.2.0

### Minor Changes

- a531978: allow prepare venv on Windows

## 2.1.17

### Patch Changes

- Updated dependencies [a0a4e02]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.6.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.4.2

## 2.1.16

### Patch Changes

- Updated dependencies [43d0b54]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.13.2

## 2.1.15

### Patch Changes

- Updated dependencies [550da5a]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.13.1

## 2.1.14

### Patch Changes

- Updated dependencies [ba39f6b]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.13.0

## 2.1.13

### Patch Changes

- Updated dependencies [9f96153]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.12.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.6.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.4.1

## 2.1.12

### Patch Changes

- Updated dependencies [3e10431]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.11.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.5.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.4.0

## 2.1.11

### Patch Changes

- d86e8a9: chore fix version

## 2.1.10

### Patch Changes

- cdc9968: chore: revert for MSA

## 2.1.9

### Patch Changes

- Updated dependencies [b1f7a29]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.10.0

## 2.1.8

### Patch Changes

- Updated dependencies [0cfdc3f]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.9.0

## 2.1.7

### Patch Changes

- @platforma-open/milaboratories.clonotype-enrichment.workflow@2.8.2

## 2.1.6

### Patch Changes

- Updated dependencies [0296ae9]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.8.1
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.4.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.3.1

## 2.1.5

### Patch Changes

- Updated dependencies [6aa03bc]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.8.0

## 2.1.4

### Patch Changes

- Updated dependencies [be02daf]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.7.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.4.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.3.0

## 2.1.3

### Patch Changes

- Updated dependencies [2e7dbd6]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.6.0

## 2.1.2

### Patch Changes

- Updated dependencies [23c6345]
- Updated dependencies [83e1670]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.5.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.3.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.2.0

## 2.1.1

### Patch Changes

- Updated dependencies [75a9217]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.4.0

## 2.1.0

### Minor Changes

- d25d397: Update SDK

## 2.0.9

### Patch Changes

- Updated dependencies [919ae72]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.3.0
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.2.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.1.0

## 2.0.8

### Patch Changes

- Updated dependencies [a6123ff]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.2.4
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.3
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.6

## 2.0.7

### Patch Changes

- 011007d: Ordered categorical axis values
- Updated dependencies [011007d]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.5
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.2.3

## 2.0.6

### Patch Changes

- Updated dependencies [0914a49]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.2.2
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.4

## 2.0.5

### Patch Changes

- Updated dependencies [289344b]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.2.1
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.3

## 2.0.4

### Patch Changes

- Updated dependencies [70095f8]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.2.0

## 2.0.3

### Patch Changes

- Updated dependencies [8a8b908]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.1.0
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.1.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.2

## 2.0.2

### Patch Changes

- Updated dependencies [d9ba31f]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.1.0

## 2.0.1

### Patch Changes

- aa5e76e: Updated block metadata
- Updated dependencies [aa5e76e]
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.0.1
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.0.1
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.1

## 2.0.0

### Major Changes

- 32a9a57: First release

### Patch Changes

- Updated dependencies [32a9a57]
  - @platforma-open/milaboratories.clonotype-enrichment.model@2.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.ui@2.0.0
  - @platforma-open/milaboratories.clonotype-enrichment.workflow@2.0.0
