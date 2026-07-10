# @platforma-open/milaboratories.clonotype-enrichment.software

## 3.3.1

### Patch Changes

- eb76053: MILAB-6564: use the `bright` default palette on the Lines page. Also update graph-maker to 1.6.1 and refresh SDK dependencies via `upgrade-sdk` (includes the block structurer migration). The block is named explicitly so it gets a version bump and releases — the automatic cascade from sub-packages is no longer reliable.

## 3.3.0

### Minor Changes

- bb094bd: Add per-clonotype Max Frequency export for cluster input. When the input is cluster abundance, the block identifies the upstream per-clonotype primary abundance (matched by the clonotype identity the cluster's `clusterId` axis carries) and computes each clonotype's maximum frequency across target rounds (library round and negative controls excluded), using the same downsampling and frequency definition as the cluster-level frequencies. Exported on the clonotype-key axis as a `pl7.app/maxFrequency` score for ranking in Lead Selection. No column is produced for clonotype/peptide input.

## 3.2.1

### Patch Changes

- 91a001a: Migrate block onto the structurer (block-tools 2.11.1) — full SDK upgrade through workflow-tengo 6, tengo-builder 4, model/ui-vue 1.79.15. Tooling/layout only; no behavior change.

## 3.2.0

### Minor Changes

- 8956099: Library selection by metadata and bug fixes

## 3.1.0

### Minor Changes

- b1ff4a5: Include library usage and enrichment based on a single negative control

### Patch Changes

- ca0ae15: Rename variable and improve conditions check

## 3.0.0

### Major Changes

- d76b735: Upgrade to include specific antigen selection, negative control usage, improved filters and pseudocount usage

## 2.17.3

### Patch Changes

- f02f9f7: Fix block with multiple datasets in project

## 2.17.2

### Patch Changes

- 69998c8: Show running state for tables and graphs, migrate to new project template

## 2.17.1

### Patch Changes

- b7af80a: technical release
- c3cf16a: technical release
- 087861a: technical release
- df1d277: technical release
- e57c186: technical release

## 2.17.0

### Minor Changes

- 30383bc: Support empty inputs

## 2.16.0

### Minor Changes

- 3548d8a: Export additional enrichment scores

## 2.15.3

### Patch Changes

- b15e3d9: technical release

## 2.15.2

### Patch Changes

- 293fcf5: Update python

## 2.15.1

### Patch Changes

- 2aa0f2a: Full SDK update

## 2.15.0

### Minor Changes

- 78ab568: Custom clonotype definition for enrichment analysis

## 2.14.1

### Patch Changes

- 859d9d1: Updated SDK.

## 2.14.0

### Minor Changes

- 4270125: Stats work with an empty table (all filtered)

## 2.13.0

### Minor Changes

- eaffd65: Added clonotype filtering option.

## 2.12.1

### Patch Changes

- 52844c2: Fix python versions

## 2.12.0

### Minor Changes

- 076d9c6: Add stats window

## 2.11.0

### Minor Changes

- 56e442d: Small fix to ensure condition labels are always treated as strings

## 2.10.0

### Minor Changes

- 5fed921: Switch to polars

## 2.9.0

### Minor Changes

- adbe364: Switch to polars

## 2.8.0

### Minor Changes

- 9f96153: title bath and fix

## 2.7.0

### Minor Changes

- 3e10431: Add downsampling

## 2.6.0

### Minor Changes

- 6672438: Fixed bug showing in results pseudocounts instead of zeroes for frequency values.

## 2.5.0

### Minor Changes

- 6aa03bc: Label and threshold changes

## 2.4.0

### Minor Changes

- be02daf: Added overall enrichment calculation

## 2.3.0

### Minor Changes

- 2e7dbd6: Fixes for single-cell

## 2.2.0

### Minor Changes

- 23c6345: FixExports
- 83e1670: Make it work with clonotype-clusters

## 2.1.2

### Patch Changes

- 011007d: Ordered categorical axis values

## 2.1.1

### Patch Changes

- 289344b: Updated line plot to show clonotype frequency

## 2.1.0

### Minor Changes

- 8a8b908: Make it work with single-cell

## 2.0.1

### Patch Changes

- aa5e76e: Updated block metadata

## 2.0.0

### Major Changes

- 32a9a57: First release
