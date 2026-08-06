---
"@platforma-open/milaboratories.clonotype-enrichment": patch
"@platforma-open/milaboratories.clonotype-enrichment.model": patch
"@platforma-open/milaboratories.clonotype-enrichment.ui": patch
---

Switch the Control Scatter page to the `scatterplot-umap` chart type and migrate the saved chart state to it (data model `v2`).

The page's `chartType` changed from `scatterplot` to `scatterplot-umap`. GraphMaker discards a persisted `optionsState` whose `type` doesn't match the `chartType` prop, but keeps `usedDefaultOptions` — which then reads as "the user cleared these inputs on purpose" and permanently suppresses re-applying the defaults, so the page came up with no grouping, size or tooltip content and no way to recover from the UI.

The migration retags `optionsState.type` and drops the `shape` input, which `scatterplot-umap` does not have. Everything else — the selected sources, filters, layer settings, palettes, title and zoom — is preserved, and `usedDefaultOptions` stays valid because the page's default options did not change with the chart type. The block is named explicitly so it gets a version bump and releases.
