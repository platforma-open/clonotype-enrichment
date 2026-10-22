import type { GraphMakerState } from "@milaboratories/graph-maker";
import type { PlDataTableStateV2, PlRef } from "@platforma-sdk/model";

/**
 * Data as stored at `v1`: the abundance column, its subset and the per-clonotype abundance as
 * refs to upstream outputs, the condition, antigen and clonotype-definition columns as ids
 * anchored against the abundance column, and the picked conditions, rounds and antigens as plain
 * values.
 */
export type BlockDataV1 = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  abundanceRef?: PlRef;
  filterRef?: PlRef;
  conditionColumnRef?: string;
  conditionOrder: string[];
  downsampling: DownsamplingParametersV1;
  FilteringConfig: FilteringConfigV1;
  clonotypeDefinition: string[];
  clonotypeAbundanceRef?: PlRef;
  additionalEnrichmentExports: string[];
  antigenControlConfig: AntigenControlConfigV1;
  enrichmentThreshold: number;
  pseudoCount: number;
  tableState: PlDataTableStateV2;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  scatterState: GraphMakerState;
  boxState: GraphMakerState;
  excludedAlertDismissedKey?: string;
};

/** Data as stored at `v2`: the same shape, with the scatter plot moved to the UMAP template. */
export type BlockDataV2 = BlockDataV1;

/** Read-depth normalization as stored up to `v2`. */
export type DownsamplingParametersV1 = {
  type?: "none" | "hypergeometric";
  valueChooser?: "min" | "fixed" | "auto";
  n?: number;
};

/** Clonotype filters as stored up to `v2`: the present-in-rounds conditions as plain values. */
export type FilteringConfigV1 = {
  baseFilter: "none" | "shared" | "single-sample";
  minAbundance: {
    enabled: boolean;
    threshold: number;
    metric: "count" | "frequency";
  };
  presentInRounds: {
    enabled: boolean;
    rounds: string[];
    logic: "OR" | "AND";
  };
  excludeSequencedLibrary: boolean;
};

/**
 * Antigen and control setup as stored up to `v2`: the antigen column as an id anchored against
 * the abundance column, the antigens and control conditions as plain values.
 */
export type AntigenControlConfigV1 = {
  antigenEnabled: boolean;
  controlEnabled: boolean;
  antigenColumnRef?: string;
  targetAntigen?: string;
  negativeAntigens: string[];
  controlThreshold: number;
  singleControlFrequencyThreshold: number;
  controlConditionsOrder: string[];
  sequencedLibraryEnabled: boolean;
  sequencedLibraryAntigen?: string;
  hasSingleConditionNegativeControl: boolean;
  hasMultiConditionNegativeControl: boolean;
};
