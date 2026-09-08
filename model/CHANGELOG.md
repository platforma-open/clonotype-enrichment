# @platforma-open/milaboratories.clonotype-enrichment.model

## 4.2.1

### Patch Changes

- d4d80f0: Fix the main table erroring out when the abundance input is switched — clustered abundance to per-clonotype abundance, say — before the block is re-run.

  The table joins the enrichment results with sequence columns discovered from the result pool. The results are keyed on the element axis of the input the last run used, but discovery was anchored on `data` — the _currently selected_ input. `outputs` survive an input change, so between the change and the next Run those two disagree, and discovery returns columns that co-index with the new input alone (a cluster centroid sequence reached through a clonotype→cluster linker, for instance). A discovered column's own `axesSpec` still names the old axis, so the per-column axis filter let it through, and the table was asked to join disjoint axes sets: `some of axes sets are disjoint`.

  Discovery is now anchored on `activeArgs` — the input the displayed results were actually computed from — so the anchor and the results always come from the same run. The sequence columns reappear once the block is re-run on the new input.

## 4.2.0

### Minor Changes

- fba70c5: Add the mandatory block kind and upgrade the SDK

  The block now declares a `kind/` package carrying its identity and its
  init-params contract — the fields a project template supplies to seed a new
  instance. The model consumes them in `init` and projects the same set back out
  via `templateParams`, so export and apply are inverses. The analysis
  configuration shapes (`DownsamplingParameters`, `FilteringConfig`,
  `AntigenControlConfig`) move to the kind and are re-exported from the model, so
  the contract has one definition. Table state, the five graph states, the
  dismissed-alert key and the auto-discovered `clonotypeAbundanceRef` stay out of
  the contract: they are view state or derived from outputs, not user
  configuration a template reproduces.

  The SDK upgrade that comes with it replaces the removed `ColumnLazy` with
  `DataColumn` at the two table call sites, and pins the `@milaboratories/helpers`
  catalog entry to the version `@platforma-sdk/model` depends on so the model's
  exported type stays nameable.

### Patch Changes

- Updated dependencies [fba70c5]
  - @platforma-open/milaboratories.clonotype-enrichment.kind@1.1.0

## 4.1.3

### Patch Changes

- f7d8d43: Switch the Control Scatter page to the `scatterplot-umap` chart type and migrate the saved chart state to it (data model `v2`).

  The page's `chartType` changed from `scatterplot` to `scatterplot-umap`. GraphMaker discards a persisted `optionsState` whose `type` doesn't match the `chartType` prop, but keeps `usedDefaultOptions` — which then reads as "the user cleared these inputs on purpose" and permanently suppresses re-applying the defaults, so the page came up with no grouping, size or tooltip content and no way to recover from the UI.

  The migration retags `optionsState.type` and drops the `shape` input, which `scatterplot-umap` does not have. Everything else — the selected sources, filters, layer settings, palettes, title and zoom — is preserved, and `usedDefaultOptions` stays valid because the page's default options did not change with the chart type. The block is named explicitly so it gets a version bump and releases.

## 4.1.2

### Patch Changes

- 7b129c4: SDK Update

## 4.1.1

### Patch Changes

- bbd32b9: Adapt block to DMS datasets, SDK update

## 4.1.0

### Minor Changes

- bb094bd: Add per-clonotype Max Frequency export for cluster input. When the input is cluster abundance, the block identifies the upstream per-clonotype primary abundance (matched by the clonotype identity the cluster's `clusterId` axis carries) and computes each clonotype's maximum frequency across target rounds (library round and negative controls excluded), using the same downsampling and frequency definition as the cluster-level frequencies. Exported on the clonotype-key axis as a `pl7.app/maxFrequency` score for ranking in Lead Selection. No column is produced for clonotype/peptide input.

## 4.0.4

### Patch Changes

- 91a001a: Migrate block onto the structurer (block-tools 2.11.1) — full SDK upgrade through workflow-tengo 6, tengo-builder 4, model/ui-vue 1.79.15. Tooling/layout only; no behavior change.

## 4.0.3

### Patch Changes

- ede4434: update dependencies
- 5b9c1c3: New Changeset

## 4.0.2

### Patch Changes

- c7e0c1f: migrate to block model v3

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

## 4.0.0

### Major Changes

- d74e7e0: Support peptides

## 3.2.4

### Patch Changes

- 9ea6985: Add other VDJ region sequence columns (CDR1, CDR2, FR1, etc.) to the enrichment table as optional columns

## 3.2.3

### Patch Changes

- 8a37399: Add clone sequence column

## 3.2.2

### Patch Changes

- 870d494: Update default values

## 3.2.1

### Patch Changes

- bf55aca: Modify default pseudocount

## 3.2.0

### Minor Changes

- 8956099: Library selection by metadata and bug fixes

## 3.1.2

### Patch Changes

- 0605e4d: Fix logic showing negative control related options

## 3.1.1

### Patch Changes

- 16510b7: Adjust enrichment threshold

## 3.1.0

### Minor Changes

- b1ff4a5: Include library usage and enrichment based on a single negative control

### Patch Changes

- ca0ae15: Rename variable and improve conditions check
- 9e22a47: Filter out non-antigen-specific conditions from options

## 3.0.0

### Major Changes

- d76b735: Upgrade to include specific antigen selection, negative control usage, improved filters and pseudocount usage

## 2.11.5

### Patch Changes

- 70243e2: Support custom block title

## 2.11.4

### Patch Changes

- 69998c8: Show running state for tables and graphs, migrate to new project template

## 2.11.3

### Patch Changes

- 7b64916: Use "Shared Clonotypes" for clonotype filtering by default

## 2.11.2

### Patch Changes

- b7af80a: technical release
- c3cf16a: technical release
- 087861a: technical release
- df1d277: technical release
- e57c186: technical release

## 2.11.1

### Patch Changes

- 42f20a5: Switch from line plot to scatter plot

## 2.11.0

### Minor Changes

- 3548d8a: Export additional enrichment scores

### Patch Changes

- 090d6c8: Allow selection of specific enrichment comparisons to export

## 2.10.3

### Patch Changes

- b15e3d9: technical release

## 2.10.2

### Patch Changes

- 293fcf5: Update python

## 2.10.1

### Patch Changes

- 2aa0f2a: Full SDK update

## 2.10.0

### Minor Changes

- 78ab568: Custom clonotype definition for enrichment analysis

## 2.9.1

### Patch Changes

- 859d9d1: Updated SDK.

## 2.9.0

### Minor Changes

- 4270125: Stats work with an empty table (all filtered)

## 2.8.0

### Minor Changes

- eaffd65: Added clonotype filtering option.

## 2.7.0

### Minor Changes

- bc547f7: Show block defined cutoff in UI
- 076d9c6: Add stats window

## 2.6.1

### Patch Changes

- a0a4e02: Migrate to use new PlAgDataTableV2

## 2.6.0

### Minor Changes

- 9f96153: title bath and fix

## 2.5.0

### Minor Changes

- 3e10431: Add downsampling

## 2.4.1

### Patch Changes

- 0296ae9: Update exports

## 2.4.0

### Minor Changes

- be02daf: Added overall enrichment calculation

## 2.3.0

### Minor Changes

- 23c6345: FixExports
- 83e1670: Make it work with clonotype-clusters

## 2.2.0

### Minor Changes

- 919ae72: Updated clonotype labels

## 2.1.3

### Patch Changes

- a6123ff: Switched clonotype labels to CDR3 sequences

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
