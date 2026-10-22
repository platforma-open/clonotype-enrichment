import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  AntigenControlConfig,
  DownsamplingParameters,
  FilteringConfig,
} from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import { kind } from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import type {
  ColumnUniversalId,
  ColumnValueId,
  DatasetOption,
  PFrameHandle,
  PlDataTableStateV2,
  PlRef,
  PObjectSpec,
  ArgsIssue,
} from "@platforma-sdk/model";
import {
  Annotation,
  BlockModelV3,
  ColumnsCollection,
  DataModelBuilder,
  buildDatasetOptions,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  deriveColumnOptions,
  isColumnUniversalId,
  isColumnValueId,
  isPColumnSpec,
  readAnnotationJson,
} from "@platforma-sdk/model";
import { PRIMARY_ABUNDANCE, toColumnId } from "./abundance";
import { getClonotypeDefinitionOptions } from "./clonotype_definition";
import {
  exact,
  findColumn,
  getOutputColumns,
  resultPool,
  toIdsAndSpecs,
  toPColumns,
} from "./columns";
import { getMetadataOptions } from "./metadata_columns";
import {
  getAbundanceSamples,
  getAntigenValuesSource,
  getComparisonOptions,
  getConditionValuesSource,
  listPickedComparisons,
} from "./metadata_values";
import type {
  AntigenControlConfigV1,
  BlockDataV1,
  BlockDataV2,
  DownsamplingParametersV1,
  FilteringConfigV1,
} from "./stored_data";
import type { ParentNormalization, ParentRunSummary } from "./parentNormalization";
import { MUTATION_COUNT, PARENT_LINK, halfMatchedParentInput } from "./parentNormalization";
export type * from "@milaboratories/helpers";
export { fromDatasetSelection, toDatasetSelection } from "./abundance";
export type { AbundancePick } from "./abundance";
export type { ClonotypeColumnOption } from "./clonotype_definition";
export type { MetadataOption } from "./metadata_columns";
export { buildMetadataValuePickers, deriveMetadataValues } from "./metadata_values";
export type {
  AntigenConditions,
  MetadataColumnFrame,
  MetadataValuePickers,
  MetadataValues,
  PickedValueOption,
  SampleValue,
  SampleValues,
} from "./metadata_values";
export type { ParentNormalization, ParentRunSummary } from "./parentNormalization";

// The analysis-configuration shapes are the block's init-params contract, so
// they are declared by the kind and re-exported here: the model depends on the
// kind, never the other way round, and every existing `from "...model"` import
// keeps resolving.
export type {
  AntigenControlConfig,
  DownsamplingParameters,
  FilteringConfig,
} from "@platforma-open/milaboratories.clonotype-enrichment.kind";

type OldArgs = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  abundanceRef?: PlRef;
  conditionColumnRef?: string;
  conditionOrder: string[];
  downsampling: DownsamplingParametersV1;
  FilteringConfig: FilteringConfigV1;
  clonotypeDefinition: string[];
  additionalEnrichmentExports: string[];
  antigenControlConfig: AntigenControlConfigV1;
  enrichmentThreshold: number;
  pseudoCount: number;
};

type OldUiState = {
  tableState: PlDataTableStateV2;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  scatterState: GraphMakerState;
  boxState: GraphMakerState;
  /** When set, the "conditions excluded by target" alert is hidden until the excluded list changes (key = sorted excluded conditions). */
  excludedAlertDismissedKey?: string;
};

export type BlockData = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  abundanceRef?: ColumnUniversalId;
  /** Subset column picked with the abundance in PlDatasetSelector (e.g. a Repertoire Labeling label). */
  filterRef?: ColumnUniversalId;
  conditionColumnRef?: ColumnUniversalId;
  conditionOrder: ColumnValueId[];
  downsampling: DownsamplingParameters;
  FilteringConfig: FilteringConfig;
  clonotypeDefinition: ColumnUniversalId[];
  /**
   * Cluster-mode only: column id of the upstream per-element primary abundance the
   * input cluster abundance was built from (per clonotype for VDJ clusters, per
   * variant for peptide clusters).
   */
  clonotypeAbundanceRef?: ColumnUniversalId;
  additionalEnrichmentExports: string[];
  antigenControlConfig: AntigenControlConfig;
  enrichmentThreshold: number; // Default: 2.0 log2 FC
  pseudoCount: number; // Default: 1
  tableState: PlDataTableStateV2;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  scatterState: GraphMakerState;
  boxState: GraphMakerState;
  excludedAlertDismissedKey?: string;
};

function migrateScatterStateToUmap(state: GraphMakerState): GraphMakerState {
  const optionsState = state?.optionsState;
  if (optionsState?.type !== "scatterplot" || optionsState.components === undefined) return state;

  // "scatterplot-umap" has no shape input, this is the only difference from "scatterplot"
  const { shape: _shape, ...components } = optionsState.components;
  return {
    ...state,
    optionsState: {
      ...optionsState,
      type: "scatterplot-umap",
      components,
    },
  };
}

/**
 * Moves stored data to column ids. A ref to an upstream output becomes the result-pool id of
 * that output, which names the same block and column. The condition and antigen columns were
 * picked by ids anchored against the abundance column and their values stored plain; neither
 * names the block that produced the metadata, so they cannot become column ids and column value
 * ids and are dropped, to be picked again. So are clonotype-definition columns picked by
 * anchored ids; without them a clonotype is the abundance column's element.
 */
function toColumnIds(data: BlockDataV2): BlockData {
  const ref = (stored: PlRef | undefined) =>
    stored === undefined ? undefined : toColumnId(stored);
  const column = (stored: string | undefined) => (isColumnUniversalId(stored) ? stored : undefined);
  const value = (picked: string | undefined) => (isColumnValueId(picked) ? picked : undefined);
  const values = (picked: string[]) => picked.filter(isColumnValueId);

  const config = data.antigenControlConfig;
  return {
    ...data,
    abundanceRef: ref(data.abundanceRef),
    filterRef: ref(data.filterRef),
    clonotypeAbundanceRef: ref(data.clonotypeAbundanceRef),
    conditionColumnRef: column(data.conditionColumnRef),
    conditionOrder: values(data.conditionOrder),
    clonotypeDefinition: data.clonotypeDefinition.filter(isColumnUniversalId),
    FilteringConfig: {
      ...data.FilteringConfig,
      presentInRounds: {
        ...data.FilteringConfig.presentInRounds,
        rounds: values(data.FilteringConfig.presentInRounds.rounds),
      },
    },
    antigenControlConfig: {
      ...config,
      antigenColumnRef: column(config.antigenColumnRef),
      targetAntigen: value(config.targetAntigen),
      negativeAntigens: values(config.negativeAntigens),
      controlConditionsOrder: values(config.controlConditionsOrder),
      sequencedLibraryAntigen: value(config.sequencedLibraryAntigen),
    },
  };
}

const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
    ...args,
    tableState: uiState.tableState,
    bubbleState: uiState.bubbleState,
    lineState: uiState.lineState,
    stackedState: uiState.stackedState,
    scatterState: uiState.scatterState,
    boxState: uiState.boxState,
    excludedAlertDismissedKey: uiState.excludedAlertDismissedKey,
  }))
  .migrate<BlockDataV2>("v2", (data) => ({
    ...data,
    scatterState: migrateScatterStateToUmap(data.scatterState),
  }))
  .migrate<BlockData>("v3", toColumnIds)
  // `params` is absent when a block is created by hand rather than from a
  // template, so every field the contract carries keeps its own default.
  .init(({ params }) => ({
    ...params,
    defaultBlockLabel: params?.defaultBlockLabel ?? "",
    customBlockLabel: params?.customBlockLabel ?? "",
    conditionOrder: params?.conditionOrder ?? [],
    downsampling: params?.downsampling ?? {
      type: "none",
      valueChooser: "auto",
    },
    clonotypeDefinition: params?.clonotypeDefinition ?? [],
    FilteringConfig: params?.FilteringConfig ?? {
      baseFilter: "single-sample",
      minAbundance: {
        enabled: false,
        threshold: 100,
        metric: "count",
      },
      presentInRounds: {
        enabled: false,
        rounds: [],
        logic: "OR",
      },
      excludeSequencedLibrary: true,
    },
    additionalEnrichmentExports: params?.additionalEnrichmentExports ?? [],
    antigenControlConfig: params?.antigenControlConfig ?? {
      antigenEnabled: false,
      controlEnabled: false,
      negativeAntigens: [],
      controlThreshold: 1.0,
      // singleControlFoldChangeThreshold: 10.0,
      singleControlFrequencyThreshold: 0.01,
      controlConditionsOrder: [],
      sequencedLibraryEnabled: false,
      sequencedLibraryAntigen: undefined,
      hasSingleConditionNegativeControl: false,
      hasMultiConditionNegativeControl: false,
    },
    enrichmentThreshold: params?.enrichmentThreshold ?? 2.0,
    pseudoCount: params?.pseudoCount ?? 1,
    tableState: createPlDataTableStateV2(),
    bubbleState: {
      title: "Enrichment",
      template: "bubble",
      layersSettings: {
        bubble: {
          normalizationDirection: null,
        },
      },
      currentTab: null,
    },
    lineState: {
      title: "Top enriched sequences",
      template: "curve_dots",
      currentTab: null,
      layersSettings: {
        curve: {
          smoothing: false,
        },
      },
    },
    stackedState: {
      title: "Top enriched sequences",
      template: "stackedArea",
      currentTab: null,
    },
    scatterState: {
      title: "Binding specificity",
      template: "dots",
      currentTab: null,
    },
    boxState: {
      title: "Control Box Plot",
      template: "box",
      currentTab: null,
    },
    excludedAlertDismissedKey: undefined,
  }));

// Key axes of the datasets this block filters: bulk and single-cell clonotypes, and variants.
const DATASET_KEY_AXES: ReadonlySet<string> = new Set([
  "pl7.app/vdj/clonotypeKey",
  "pl7.app/vdj/scClonotypeKey",
  "pl7.app/variantKey",
]);

export const platforma = BlockModelV3.create({ dataModel, kind })

  // Built even from an incomplete configuration; `argsIssues` decides whether it may run.
  .args((data) => {
    // A comparison picked for export stays in the data after the condition order changes, but
    // the analysis only computes comparisons of the current order; one it does not compute
    // would fail the run.
    const producedComparisons = new Set(listPickedComparisons(data));

    return {
      defaultBlockLabel: data.defaultBlockLabel,
      customBlockLabel: data.customBlockLabel,
      abundanceRef: data.abundanceRef,
      conditionColumnRef: data.conditionColumnRef,
      conditionOrder: data.conditionOrder,
      downsampling: data.downsampling,
      FilteringConfig: data.FilteringConfig,
      clonotypeDefinition: data.clonotypeDefinition,
      clonotypeAbundanceRef: data.clonotypeAbundanceRef,
      additionalEnrichmentExports: data.additionalEnrichmentExports.filter((comparison) =>
        producedComparisons.has(comparison),
      ),
      antigenControlConfig: data.antigenControlConfig,
      enrichmentThreshold: data.enrichmentThreshold,
      pseudoCount: data.pseudoCount,
      // The subset's canonical column id, which the workflow stamps as the outputs'
      // `pl7.app/inputSubset`. Absent without a filter, so unfiltered args are unchanged.
      ...(data.filterRef !== undefined && { inputFilter: data.filterRef }),
    };
  })

  .argsIssues(({ args }) => {
    const { abundanceRef, conditionColumnRef, conditionOrder, antigenControlConfig } = args;
    const issues: ArgsIssue[] = [];
    const error = (message: string) => {
      issues.push({ severity: "error", message });
    };

    if (!abundanceRef) error("Abundance is required");
    if (!conditionColumnRef) error("Condition column is required");
    if (!conditionOrder.length) error("Conditions are required");
    if (args.enrichmentThreshold < 0.6) error("Enrichment threshold must be ≥ 0.6");

    if (antigenControlConfig.antigenEnabled || antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenColumnRef) error("Antigen column is required");
    }

    if (antigenControlConfig.antigenEnabled) {
      if (!antigenControlConfig.targetAntigen) error("Target antigen is required");
    }

    if (antigenControlConfig.controlEnabled) {
      if (
        !antigenControlConfig.antigenEnabled ||
        !antigenControlConfig.negativeAntigens.length ||
        antigenControlConfig.controlConditionsOrder.length < 1 ||
        antigenControlConfig.singleControlFrequencyThreshold === undefined
      )
        error("Control configuration is incomplete");
    }

    if (antigenControlConfig.sequencedLibraryEnabled) {
      if (!antigenControlConfig.sequencedLibraryAntigen) error("Library antigen is required");
    } else {
      if (conditionOrder.length <= 1) error("At least 2 conditions are required");
    }

    return issues;
  })

  // Inverse of `init` — the same fields, projected back out for template export.
  // Table state, the five graph states and the dismissed-alert key are view
  // state and never cross the boundary. `clonotypeAbundanceRef` is left out too:
  // it is not picked by the user but written from the `discoveredClonotypeAbundance`
  // output, and the UI re-derives it against whatever input the template lands on.
  .templateParams((data) => ({
    abundanceRef: data.abundanceRef,
    filterRef: data.filterRef,

    conditionColumnRef: data.conditionColumnRef,
    conditionOrder: data.conditionOrder,
    clonotypeDefinition: data.clonotypeDefinition,
    downsampling: data.downsampling,
    FilteringConfig: data.FilteringConfig,
    antigenControlConfig: data.antigenControlConfig,
    enrichmentThreshold: data.enrichmentThreshold,
    pseudoCount: data.pseudoCount,
    additionalEnrichmentExports: data.additionalEnrichmentExports,

    defaultBlockLabel: data.defaultBlockLabel,
    customBlockLabel: data.customBlockLabel,
  }))

  // Primary raw abundances, each with its subset columns (e.g. Repertoire Labeling labels) as filters.
  .output("abundanceOptions", (ctx): DatasetOption[] => {
    const isPrimaryAbundance = (spec: PObjectSpec) =>
      isPColumnSpec(spec) &&
      spec.axesSpec.length === 2 &&
      spec.axesSpec[0].name === "pl7.app/sampleId" &&
      spec.annotations?.["pl7.app/isAbundance"] === "true" &&
      spec.annotations?.["pl7.app/abundance/normalized"] === "false" &&
      spec.annotations?.["pl7.app/abundance/isPrimary"] === "true";

    // Labels as before, with the column's own label (e.g. "Number of Reads"): buildDatasetOptions
    // derives them without it and takes no label options for the datasets.
    const labeled = deriveColumnOptions(
      ColumnsCollection(["result_pool"]).filter({ include: PRIMARY_ABUNDANCE }),
      { includeNativeLabel: true },
    );

    const options =
      buildDatasetOptions(ctx, {
        primary: isPrimaryAbundance,
        // Only subsets keyed by the element axis alone. Cluster abundances get none: the
        // cluster-mode per-clonotype table could not apply a cluster subset.
        filter: (spec) =>
          isPColumnSpec(spec) &&
          spec.axesSpec.length === 1 &&
          DATASET_KEY_AXES.has(spec.axesSpec[0].name),
        requireEnrichments: false,
      }) ?? [];

    return options.map((option) => {
      const label = labeled.find((o) => o.id === toColumnId(option.primary.ref))?.label;
      return label === undefined ? option : { ...option, primary: { ...option.primary, label } };
    });
  })

  .output("sequenceColumnOptions", (ctx) => {
    const abundanceRef = ctx.data.abundanceRef;
    if (abundanceRef === undefined) return undefined;
    return getClonotypeDefinitionOptions(abundanceRef);
  })

  .output("metadataOptions", (ctx) => {
    const abundanceRef = ctx.data.abundanceRef;
    if (abundanceRef === undefined) return undefined;
    return getMetadataOptions(abundanceRef);
  })

  .output("datasetSpec", (ctx) => {
    if (ctx.data.abundanceRef) return findColumn(ctx.data.abundanceRef)?.getSpec();
    else return undefined;
  })

  /**
   * Cluster-mode only: identify the upstream per-element primary abundance (per
   * clonotype for VDJ clusters, per variant for peptide clusters) that the input
   * cluster abundance was built from. Returns undefined for clonotype/peptide
   * input or when no unique match exists.
   */
  .output("discoveredClonotypeAbundance", (ctx) => {
    const abundanceRef = ctx.data.abundanceRef;
    if (!abundanceRef) return undefined;
    const abundanceSpec = findColumn(abundanceRef)?.getSpec();
    if (!abundanceSpec) return undefined;

    // Only when the input is cluster abundance (row axis = clusterId).
    const clusterAxis = abundanceSpec.axesSpec[1];
    if (clusterAxis?.name !== "pl7.app/clusterId") return undefined;

    // Clonotype identity = clusterId axis domain minus clustering-specific keys.
    const identityKey = JSON.stringify(
      Object.entries(clusterAxis.domain ?? {})
        .filter(([k]) => !k.startsWith("pl7.app/clustering/"))
        .sort(([a], [b]) => a.localeCompare(b)),
    );

    // The per-element row axis can be a clonotype key (VDJ clusters) or a
    // variant key (peptide clusters).
    const isElementAxis = (name: string) =>
      name === "pl7.app/vdj/clonotypeKey" ||
      name === "pl7.app/vdj/scClonotypeKey" ||
      name === "pl7.app/variantKey";

    // Candidate primary, raw-count abundances keyed by sampleId × <row axis>.
    const candidates = ColumnsCollection(["result_pool"])
      .filter({ include: PRIMARY_ABUNDANCE })
      .getColumns();

    // Keep those whose row axis is a clonotype key carrying the matching identity.
    const matches = candidates.filter((column) => {
      const rowAxis = column.getSpec().axesSpec[1];
      if (!rowAxis || !isElementAxis(rowAxis.name)) return false;
      const candidateKey = JSON.stringify(
        Object.entries(rowAxis.domain ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      );
      return candidateKey === identityKey;
    });

    // Exactly one is expected; anything else → no column (don't guess).
    return matches.length === 1 ? matches[0].id : undefined;
  })

  // Where the UI reads the values of the picked condition column, and of the antigen column while
  // target selection is on, for the value pickers. The values are read in the UI, through a frame
  // of each column, so a column of any storage format can be picked from.
  .output("conditionValues", (ctx) => getConditionValuesSource(ctx, ctx.data))
  .output("antigenValues", (ctx) => getAntigenValuesSource(ctx, ctx.data))

  // Samples of the abundance input: the value pickers offer only the values of these samples.
  .output("abundanceSamples", (ctx) => getAbundanceSamples(ctx.data))

  // Comparisons the condition order produces, offered for export.
  .output("comparisonOptions", (ctx) => getComparisonOptions(ctx.data))

  // Get all enrichment statistics
  .output("enrichmentStats", (ctx) => {
    const statsObj = ctx.outputs?.resolve("outStats")?.getDataAsJson();
    if (!statsObj) return undefined;

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(statsObj)) {
      if (typeof value === "string") {
        result[key + "Value"] = value;
      }
    }
    return result;
  })

  // Returns a map of results for main table
  .outputWithStatus("pt", (ctx) => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("enrichmentPf"))?.getColumns();

    if (!pCols?.length) {
      return undefined;
    }

    // Pull sequence columns from result pool to show in the table
    const abundanceRef = ctx.activeArgs?.abundanceRef;
    const abundanceSpec =
      abundanceRef === undefined ? undefined : findColumn(abundanceRef)?.getSpec();
    const enrichmentAxisName = pCols[0]?.getSpec().axesSpec[0]?.name;
    const allSeqCols = abundanceSpec
      ? ColumnsCollection(["result_pool"])
          .discover({
            anchors: { main: abundanceSpec },
            include: [
              { name: [{ type: "exact", value: "pl7.app/vdj/sequence" }] },
              { name: [{ type: "exact", value: "pl7.app/sequence" }] },
            ],
            mode: "enrichment",
          })
          .getColumns()
          .filter(
            // Skip if axis doesn't match enrichment (e.g. stale results after switching input)
            (col) => col.getSpec().axesSpec[0]?.name === enrichmentAxisName,
          )
      : [];

    // Assembling feature (or centroid) amino acid sequences — visible by default
    const mainSeqCols = allSeqCols
      .filter((col) => {
        const spec = col.getSpec();
        const alphabet = spec.domain?.["pl7.app/alphabet"];
        // !== false (not === true) to also match cluster centroid sequences,
        // where clonotype-clustering deletes the isAssemblingFeature annotation
        return (
          alphabet === "aminoacid" &&
          readAnnotationJson(spec, Annotation.VDJ.IsAssemblingFeature) !== false
        );
      })
      .map((col) =>
        col.withSpecs({
          annotations: {
            "pl7.app/table/visibility": "default",
            "pl7.app/table/orderPriority": "1",
          },
        }),
      );

    // Other region sequences (CDR1, CDR2, FR1, etc.) — not shown by default, available in column picker
    const otherRegionCols = allSeqCols
      .filter(
        (col) => readAnnotationJson(col.getSpec(), Annotation.VDJ.IsAssemblingFeature) === false,
      )
      .map((col) =>
        col.withSpecs({
          annotations: { "pl7.app/table/visibility": "optional" },
        }),
      );

    // Not a parent-enrichment column as primary: those can be empty for some rows, and rows the
    // primary lacks are not shown.
    const primary =
      pCols.find((c) => !c.getSpec().name.startsWith("pl7.app/enrichment/")) ?? pCols[0];

    return createPlDataTableV3(ctx, {
      // Single primary: V3 anchors label discovery per primary column, and several
      // same-axis enrichment columns collide. They share one PFrame, so joining
      // the rest as secondary is equivalent to the old inner join among core columns.
      primaryColumns: [primary],
      columns: [...pCols.filter((c) => c !== primary), ...mainSeqCols, ...otherRegionCols],
      tableState: ctx.data.tableState,
    });
  })

  // Returns a map of results for plot
  .outputWithStatus("bubblePf", (ctx): PFrameHandle | undefined => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("bubblePf"))?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, toPColumns(pCols));
  })

  // Returns a list pof PCols for plot defaults
  .output("bubblePCols", (ctx) => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("bubblePf"))?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return toIdsAndSpecs(pCols);
  })

  .outputWithStatus("stackedPf", (ctx): PFrameHandle | undefined => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("stackedPf"))?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, toPColumns(pCols));
  })

  .output("stackedPCols", (ctx) => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("stackedPf"))?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return toIdsAndSpecs(pCols);
  })

  .outputWithStatus("linePf", (ctx): PFrameHandle | undefined => {
    const pCols = getOutputColumns(ctx.outputs?.resolve("linePf"))?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, toPColumns(pCols));
  })

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .outputWithStatus("controlScatterPf", (ctx): PFrameHandle | undefined => {
    const pCols = getOutputColumns(
      ctx.outputs?.resolve({ field: "controlScatterPf", allowPermanentAbsence: true }),
    )?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, toPColumns(pCols));
  })

  .output("controlScatterPCols", (ctx) => {
    const pCols = getOutputColumns(
      ctx.outputs?.resolve({ field: "controlScatterPf", allowPermanentAbsence: true }),
    )?.getColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return toIdsAndSpecs(pCols);
  })

  .output("filteredTooMuch", (ctx) => {
    const filteredTooMuch = ctx.outputs?.resolve("filteredTooMuch")?.getDataAsJson() as object;
    if (typeof filteredTooMuch === "boolean") {
      return filteredTooMuch;
    }
    return undefined;
  })

  .output(
    "modality",
    (ctx) => {
      const spec = ctx.data.abundanceRef ? findColumn(ctx.data.abundanceRef)?.getSpec() : undefined;
      if (!spec) return undefined;
      for (const ax of spec.axesSpec) {
        if (ax.name === "pl7.app/variantKey") {
          // synthetic-repertoire-profiler amplicon variants stamp
          // pl7.app/repertoire/extractionRunId on the axis; peptide-discovery
          // peptides stamp pl7.app/peptide/extractionRunId. Both share the
          // variantKey axis, so the domain is what tells them apart.
          return ax.domain?.["pl7.app/repertoire/extractionRunId"] !== undefined
            ? "amplicon"
            : "peptide";
        }
        if (ax.name === "pl7.app/vdj/clonotypeKey" || ax.name === "pl7.app/vdj/scClonotypeKey")
          return "antibody_tcr";
        // clustered abundances
        for (const key of Object.keys(ax.domain ?? {})) {
          if (key.startsWith("pl7.app/repertoire/")) return "amplicon";
          if (key.startsWith("pl7.app/peptide/")) return "peptide";
          if (key.startsWith("pl7.app/vdj/")) return "antibody_tcr";
        }
      }
      // Fallback when the input is resolved but unrecognized.
      return "antibody_tcr";
    },
    { retentive: true },
  )

  .output("parentNormalization", (ctx): ParentNormalization | undefined => {
    const anchor = ctx.data.abundanceRef;
    if (!anchor) return undefined;
    const variantAxis = findColumn(anchor)?.getSpec().axesSpec[1];
    if (!variantAxis) return undefined;
    const parentColumns = resultPool()
      .filter({ include: [{ name: [exact(MUTATION_COUNT)] }, { name: [exact(PARENT_LINK)] }] })
      .getColumns()
      .map((column) => column.getSpec());
    const halfMatched = halfMatchedParentInput(parentColumns, variantAxis);

    // A summary from a run on another dataset says nothing about this one.
    if (ctx.activeArgs?.abundanceRef !== anchor) return { halfMatched };
    const summary = (field: string) =>
      ctx.outputs
        ?.resolve({ field, allowPermanentAbsence: true })
        ?.getDataAsJson<ParentRunSummary>();
    return {
      halfMatched,
      summary: summary("parentSummary"),
      proteinSummary: summary("proteinSummary"),
    };
  })

  .title(() => "Enrichment Analysis")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel)

  .sections((ctx) => {
    const sections: Array<{ type: "link"; href: `/${string}`; label: string }> = [
      { type: "link", href: "/", label: "Main" },
      { type: "link", href: "/bubble", label: "Enriched Bubble Plot" },
      { type: "link", href: "/line", label: "Frequency Line Plot" },
      { type: "link", href: "/stacked", label: "Frequency Bar Plot" },
    ];

    if (ctx.data.antigenControlConfig.controlEnabled) {
      if (
        ctx.data.antigenControlConfig.controlConditionsOrder.length > 1 ||
        (ctx.data.antigenControlConfig.sequencedLibraryEnabled === true &&
          ctx.data.antigenControlConfig.controlConditionsOrder.length === 1)
      ) {
        sections.push({
          type: "link",
          href: "/scatter",
          label: "Control Scatter Plot",
        });
      }
      if (
        ctx.data.antigenControlConfig.sequencedLibraryEnabled === false &&
        ctx.data.antigenControlConfig.controlConditionsOrder.length === 1
      ) {
        sections.push({
          type: "link",
          href: "/box",
          label: "Control Box Plot",
        });
      }
    }

    return sections;
  })

  .done();
