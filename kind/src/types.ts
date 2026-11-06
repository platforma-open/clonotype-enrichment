import type { ColumnUniversalId, ColumnValueId } from "@platforma-sdk/model";

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
    rounds: ColumnValueId[];
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
  antigenColumnRef?: ColumnUniversalId;
  targetAntigen?: ColumnValueId;
  negativeAntigens: ColumnValueId[];
  controlThreshold: number;
  singleControlFrequencyThreshold: number;
  controlConditionsOrder: ColumnValueId[];
  sequencedLibraryEnabled: boolean;
  sequencedLibraryAntigen?: ColumnValueId;
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
 * configuration is runnable is settled by the model's `argsIssues`, not here.
 *
 * The abundance (`abundanceRef`) and its subset (`filterRef`), the condition
 * column (`conditionColumnRef`), the `clonotypeDefinition` columns and the
 * antigen column inside `antigenControlConfig` are result-pool column ids, which
 * name the block that produced the column. The picked condition and antigen
 * values (`conditionOrder`, the present-in-rounds rounds, and the target, control
 * and library antigens with the control conditions) are column value ids of those
 * columns, which name the block that produced each value.
 * All of them travel because they are ordinary user configuration — the recipe
 * a template exists to reproduce — and whether a given id still resolves after
 * the template lands is settled by the block's own outputs and `argsIssues`,
 * the same as after any upstream change.
 */
export type BlockParams = {
  // Input wiring — column ids a template engine points at an earlier entry's outputs.
  abundanceRef?: ColumnUniversalId;
  /** A subset column (`pl7.app/isSubset`) the input is restricted to before the analysis. */
  filterRef?: ColumnUniversalId;

  // Analysis configuration — the recipe a template exists to reproduce.
  conditionColumnRef?: ColumnUniversalId;
  conditionOrder?: ColumnValueId[];
  clonotypeDefinition?: ColumnUniversalId[];
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
