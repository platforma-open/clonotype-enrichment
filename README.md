# Enrichment Analysis

Find which sequences were actually selected for. This Platforma block compares clonotype or peptide frequencies across the conditions of a selection experiment — phage display rounds, yeast display sorts, in vivo timepoints — scores how strongly each sequence enriched, and ranks the candidates that came up.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

> **Naming:** this block appears as **Enrichment Analysis** in the Platforma app; the repository is named `clonotype-enrichment`. They are the same block.

## What it does

In a selection campaign the interesting signal is not abundance but change in abundance. A clone that is common in every round was probably always common; a clone that climbs from background to dominant across rounds was selected. This block computes that difference and turns it into a score you can rank on.

You declare the experimental design — which column identifies the condition, what order the conditions run in, and which conditions are negative controls. Enrichment is then computed per sequence against that design, so a sequence rising through the selection arm while staying flat in the control reads as genuinely enriched rather than merely abundant.

Several controls keep the result honest. Optional downsampling by random (hypergeometric) sampling puts unevenly sequenced conditions on the same footing, so a deeper-sequenced round does not look enriched by depth alone. A minimum abundance filter removes sequences too rare to score reliably; a pseudo-count keeps ratios finite when a sequence is absent from one condition; a control frequency threshold sets how much presence in the negative control disqualifies a hit. Sequence filtering can restrict the analysis to sequences shared across all conditions, or to those seen in multiple conditions, rather than everything observed once.

Results come with plots built for reading a campaign: a bubble plot of the most enriched sequences, and frequency line and bar plots tracing how individual sequences move across conditions. Specific comparisons can be exported when you want just one contrast rather than the whole design.

Enrichment scores become columns, so [Lead Selection](https://github.com/platforma-open/antibody-tcr-lead-selection) can rank on them — and its In Vitro preset does exactly that.

## Inputs & outputs

* **Input:** per-sequence count data across conditions — clonotypes from any Platforma clonotyping or import block, or peptides from [Peptide Profiling](https://github.com/platforma-open/peptide-extraction) — plus a condition column defining the design and, optionally, negative controls and an antigen column.
* **Output:** an enrichment score per sequence, with the most enriched candidates ranked, plus bubble, line, and bar plots and exportable per-comparison results.

## Specifications

| | |
|---|---|
| Block title in app | Enrichment Analysis |
| Modalities | Clonotypes (antibody, TCR) and peptides |
| Design inputs | Condition column, condition order, negative controls, negative condition order, optional antigen column |
| Downsampling | None, or random (hypergeometric) sampling to equalize depth |
| Filters | Minimum abundance, control frequency threshold, enrichment threshold, pseudo-count |
| Sequence filtering | No filtering, shared across all conditions, or present in multiple conditions |
| Plots | Enriched bubble plot, frequency line plot, frequency bar plot |
| Export | Specific pairwise comparisons |

## Use cases

* **Phage and yeast display:** rank clones by how strongly they enriched across panning or sorting rounds.
* **Negative-control-aware selection:** discount sequences that also rise in a control arm, which raw round-over-round ratios would flag as hits.
* **Peptide selection campaigns:** score peptide libraries across selection conditions the same way.
* **In vivo timepoints:** track how clonotype frequencies shift after immunization or treatment.
* **Depth correction:** downsample unevenly sequenced conditions so enrichment reflects biology rather than sequencing effort.
* **Cluster-level enrichment:** run on clustered data from [Sequence Clustering](https://github.com/platforma-open/clonotype-clustering) to see which families were selected, not just which individual clones.
* **Feeding lead selection:** supply enrichment scores to Lead Selection, whose In Vitro preset ranks on them directly.

## FAQ

### What does the enrichment score measure?

How much a sequence's frequency changes across the conditions you defined, relative to the design — including any negative controls. It is a measure of selection, not of abundance: a rare clone that climbs steeply can outrank a common one that stays flat.

### Why should I set negative controls?

Without them, anything that rises across rounds looks selected — including clones amplifying for reasons unrelated to target binding. Declaring the control arm lets the score discount sequences that rise there too.

### What does downsampling do, and when do I need it?

It randomly subsamples conditions to a common depth before comparison. Use it whenever sequencing depth differs materially between conditions, since a more deeply sequenced round otherwise shows spurious enrichment simply because more of its diversity was observed.

### What is the pseudo-count for?

A sequence absent from one condition would make a frequency ratio infinite or undefined. A small pseudo-count keeps those comparisons finite so the sequence can still be scored and ranked.

### What is the difference between the sequence filtering options?

*No filtering* scores everything observed. *Shared (all conditions)* restricts to sequences present in every condition, giving the most reliable comparisons but discarding sequences that appeared only after selection. *Multiple conditions* is the middle ground — present in more than one condition, so singletons are excluded without requiring presence everywhere.

### Can I use it for peptides?

Yes. Peptide datasets are supported alongside clonotypes, which makes the block usable for peptide display and selection campaigns.

## Documentation

Step-by-step guide: [Enrichment Analysis](https://docs.platforma.bio/guides/antibody-discovery/enrichment-analysis/)

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [docs.platforma.bio/biology-guides/antibody-discovery](https://docs.platforma.bio/biology-guides/antibody-discovery/).
