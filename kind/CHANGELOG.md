# @platforma-open/milaboratories.clonotype-enrichment.kind

## 2.1.0

### Minor Changes

- 79ab046: Compute the block label without the UI

  The trace label is now built by the workflow from the native labels of the
  clonotype-definition columns plus the conditions, target antigen and filtering mode,
  named after the block ("Enrichment Analysis (...)"). Opening the block no longer changes
  its arguments, and a block that was never opened still gets a meaningful label. The
  subtitle shows the result-pool labels of the clonotype-definition columns. Existing blocks
  show as stale once after the update. The
  init-params contract no longer carries `defaultBlockLabel`; templates that still contain
  it keep loading.

## 2.0.0

### Major Changes

- 2a47627: Columns are stored by their result-pool column ids: the abundance and its subset, the condition and antigen columns, the clonotype-definition columns and, in cluster mode, the per-clonotype abundance. The picked conditions, rounds, control conditions and antigens are stored as column value references of the condition and antigen columns, so the block that produced the metadata knows which of its values this block uses. The model finds columns and builds the options of every column picker through the column collection API instead of the deprecated result pool API, and the workflow takes every column through a column bundle. The condition and antigen value pickers read the values of the picked columns in the UI, through a frame of each column, so a metadata column stored in any format can be picked from.
  Opening a project created before this change keeps its abundance and subset, and clears its condition and antigen columns and the values picked in them — conditions, rounds, target, negative controls, control conditions and library — since they were stored by ids anchored to the abundance column and as plain values, which name no producing block; they have to be picked again before the block runs. Clonotype-definition columns, stored by anchored ids too, are cleared as well: until they are picked again, each clonotype of the input is its own clonotype, as when none were picked. The initialization params of the kind carry the same ids and references, so templates made for an earlier version of the kind cannot be applied.
  A block whose configuration is incomplete still derives its args, and its run is blocked with the reasons listed (abundance, condition column, conditions, enrichment threshold, antigen column, target, control setup, library antigen); a desktop app that does not support such run checks refuses to open the block.
  Conditions, control conditions, antigens and exported comparisons that are no longer available stay selected and are marked as not available instead of being removed silently, with a tooltip naming the block that was to provide them, as a link to it, and what went wrong, and comparisons the current condition order does not produce are left out of the run.

## 1.2.0

### Minor Changes

- 4675981: Update the SDK and accept a subset filter (e.g. a Repertoire Labeling label or Lead Selection picks) with the input abundance. The dataset list is built with buildDatasetOptions (requireEnrichments: false). The subset restricts the input before the analysis, so frequencies and enrichment are computed within the subset and differ from a full-data run. Outputs of a subset run carry pl7.app/inputSubset in their domain and a trace rooted in the subset, so their labels name it. Unfiltered runs are unchanged.

## 1.1.0

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
