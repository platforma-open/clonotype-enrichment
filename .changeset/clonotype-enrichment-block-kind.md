---
'@platforma-open/milaboratories.clonotype-enrichment.kind': minor
'@platforma-open/milaboratories.clonotype-enrichment.model': minor
'@platforma-open/milaboratories.clonotype-enrichment': minor
---

Add the mandatory block kind and upgrade the SDK

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
