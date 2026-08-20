import type { PlRef, SUniversalPColumnId } from "@platforma-sdk/model";

/** Read-depth normalization applied before abundances are compared. */
export type DownsamplingParameters = {
  type?: "none" | "hypergeometric";
  valueChooser?: "min" | "fixed" | "auto";
  n?: number;
};

/**
 * Which clonotypes enter the analysis. `baseFilter` is the single exclusive
 * choice; the remaining filters stack on top of it.
 */
export type FilteringConfig = {
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
 * Target-antigen and negative-control setup: which metadata column names the
 * antigen, which of its values is the target, which are controls, and the
 * thresholds a clonotype must clear to count as control-specific.
 */
export type AntigenControlConfig = {
  antigenEnabled: boolean;
  controlEnabled: boolean;
  antigenColumnRef?: SUniversalPColumnId;
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

/**
 * This block's init-params contract — the shape a block of this kind receives
 * at creation, and exactly what a project template serializes for it.
 *
 * Every field is optional. A block with no abundance picked and no condition
 * column chosen is an ordinary state the UI reaches, so export has to be able to
 * write it and apply has to be able to take it back; a contract that demanded
 * `abundanceRef` would make export and apply stop being inverses. Whether a
 * configuration is runnable is settled by the model's `args` lambda, not here.
 *
 * The column ids carried here (`conditionColumnRef`, `clonotypeDefinition`, the
 * antigen column inside `antigenControlConfig`) are anchored against
 * `abundanceRef` and so mean something only relative to it. They travel because
 * they are ordinary user configuration — the recipe a template exists to
 * reproduce — and whether a given id still resolves after the template lands is
 * settled by the block's own outputs and `args`, the same as after any upstream
 * change.
 */
export type BlockParams = {
  // Input wiring — a PlRef a template engine fills from an earlier entry's output.
  abundanceRef?: PlRef;

  // Analysis configuration — the recipe a template exists to reproduce.
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder?: string[];
  clonotypeDefinition?: SUniversalPColumnId[];
  downsampling?: DownsamplingParameters;
  FilteringConfig?: FilteringConfig;
  antigenControlConfig?: AntigenControlConfig;
  enrichmentThreshold?: number;
  pseudoCount?: number;
  additionalEnrichmentExports?: string[];

  // Display naming.
  defaultBlockLabel?: string;
  customBlockLabel?: string;
};
