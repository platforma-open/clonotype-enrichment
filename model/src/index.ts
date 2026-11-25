import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  AntigenControlConfig,
  DownsamplingParameters,
  FilteringConfig,
} from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import { kind } from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import type {
  AnchoredPColumnSelector,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlRef,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  Annotation,
  BlockModelV3,
  ColumnsCollection,
  DataColumn,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV3,
  getUniquePartitionKeys,
  readAnnotationJson,
} from "@platforma-sdk/model";
import {
  TENSOR_COLUMN_NAME,
  TENSOR_SAMPLE_AXIS_ANNOTATION,
  buildPlan,
  comparisonOptions,
  designSamples,
  readDesigns,
  sameAxisId,
  type Design,
  type JsonColumnData,
  type Plan,
} from "./design";
export * from "./design";
export type * from "@milaboratories/helpers";

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
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder: string[];
  downsampling: DownsamplingParameters;
  FilteringConfig: FilteringConfig;
  clonotypeDefinition: SUniversalPColumnId[];
  additionalEnrichmentExports: string[];
  antigenControlConfig: AntigenControlConfig;
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

/** Whether an experiment's control end points are judged against, or left out of, the scores. */
export type DesignControlMode = "none" | "pooled";

/** Whether one cutoff covers the whole run, or each end point carries its own. */
export type DesignThresholdMode = "global" | "endpoint";

/** The mode in force. Drafts saved before the switch existed keep the controls they had picked. */
export function designControlMode(data: {
  designControlMode?: DesignControlMode;
  designControlEnds?: string[];
}): DesignControlMode {
  return data.designControlMode ?? (data.designControlEnds?.length ? "pooled" : "none");
}

export type BlockData = {
  defaultBlockLabel: string;
  customBlockLabel: string;
  abundanceRef?: PlRef;
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder: string[];
  downsampling: DownsamplingParameters;
  FilteringConfig: FilteringConfig;
  clonotypeDefinition: SUniversalPColumnId[];
  /**
   * Cluster-mode only: PlRef of the upstream per-element primary abundance the
   * input cluster abundance was built from (per clonotype for VDJ clusters, per
   * variant for peptide clusters).
   */
  clonotypeAbundanceRef?: PlRef;
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

  // ---- Experiment design (draft) ----
  // Set when the user picks a design in the abundance dropdown. When
  // `designId` is set, the condition column, condition order and antigen /
  // control settings are not used: the comparisons come from the design.
  /** The `pl7.app/design/tensors` column the design came from. */
  designTensorsRef?: PlRef;
  designId?: string;
  /** Tensor id of the chosen comparison (a panel or a trajectory). */
  designComparison?: string;
  /** Whether the end points marked as controls are used at all. */
  designControlMode?: DesignControlMode;
  /** End point keys marked as controls (see `posKey`). */
  designControlEnds?: string[];
  /** Partition tensor id -> chosen target piece (see `posKey`). */
  designTargetPieces?: Record<string, string>;
  /** Whether the enrichment cutoff is one value for the run or one per end point. */
  designThresholdMode?: DesignThresholdMode;
  /** End point -> its own enrichment cutoff; read only in "endpoint" mode. */
  designThresholds?: Record<string, number>;
  /** The plan built from the choices above; written by the UI from `designView.plan`. */
  designPlan?: Plan;
};

/** Value of one entry in the combined abundance / design dropdown. */
export type InputChoice = { abundanceRef: PlRef; designTensorsRef?: PlRef; designId?: string };

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

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
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
  .migrate<BlockData>("v2", (data) => ({
    ...data,
    scatterState: migrateScatterStateToUmap(data.scatterState),
  }))
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

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args((data) => {
    const { abundanceRef, conditionColumnRef, conditionOrder, antigenControlConfig } = data;

    if (!abundanceRef) throw new Error("Abundance is required");
    if (data.enrichmentThreshold < 0.6) throw new Error("Enrichment threshold must be ≥ 0.6");

    // With a design, the comparisons come from the plan, not from metadata.
    if (data.designId !== undefined) {
      const plan = data.designPlan;
      if (!plan || plan.designId !== data.designId || plan.comparison !== data.designComparison)
        throw new Error("Finish the design settings");
      if (plan.comparisons.length === 0) throw new Error("The design gives no comparisons");
      return {
        defaultBlockLabel: data.defaultBlockLabel,
        customBlockLabel: data.customBlockLabel,
        abundanceRef,
        downsampling: data.downsampling,
        FilteringConfig: data.FilteringConfig,
        clonotypeDefinition: data.clonotypeDefinition,
        enrichmentThreshold: data.enrichmentThreshold,
        controlThreshold: data.antigenControlConfig.controlThreshold,
        pseudoCount: data.pseudoCount,
        design: plan,
      };
    }

    if (!conditionColumnRef) throw new Error("Condition column is required");
    if (!conditionOrder.length) throw new Error("Conditions are required");
    if (data.enrichmentThreshold < 0.6) throw new Error("Enrichment threshold must be ≥ 0.6");

    if (antigenControlConfig.antigenEnabled || antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenColumnRef) throw new Error("Antigen column is required");
    }

    if (antigenControlConfig.antigenEnabled) {
      if (!antigenControlConfig.targetAntigen) throw new Error("Target antigen is required");
    }

    if (antigenControlConfig.controlEnabled) {
      if (
        !antigenControlConfig.antigenEnabled ||
        !antigenControlConfig.negativeAntigens.length ||
        antigenControlConfig.controlConditionsOrder.length < 1 ||
        antigenControlConfig.singleControlFrequencyThreshold === undefined
      )
        throw new Error("Control configuration is incomplete");
    }

    if (antigenControlConfig.sequencedLibraryEnabled) {
      if (!antigenControlConfig.sequencedLibraryAntigen)
        throw new Error("Library antigen is required");
    } else {
      if (conditionOrder.length <= 1) throw new Error("At least 2 conditions are required");
    }

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
      additionalEnrichmentExports: data.additionalEnrichmentExports,
      antigenControlConfig: data.antigenControlConfig,
      enrichmentThreshold: data.enrichmentThreshold,
      pseudoCount: data.pseudoCount,
    };
  })

  // Inverse of `init` — the same fields, projected back out for template export.
  // Table state, the five graph states and the dismissed-alert key are view
  // state and never cross the boundary. `clonotypeAbundanceRef` is left out too:
  // it is not picked by the user but written from the `discoveredClonotypeAbundance`
  // output, and the UI re-derives it against whatever input the template lands on.
  .templateParams((data) => ({
    abundanceRef: data.abundanceRef,

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

  .output("abundanceOptions", (ctx) =>
    ctx.resultPool.getOptions(
      [
        {
          axes: [{ name: "pl7.app/sampleId" }, {}],
          annotations: {
            "pl7.app/isAbundance": "true",
            "pl7.app/abundance/normalized": "false",
            "pl7.app/abundance/isPrimary": "true",
          },
        },
      ],
      { includeNativeLabel: true },
    ),
  )

  // Abundances plus, under each, the designs whose sample axis matches it.
  // Values are JSON-encoded InputChoice objects.
  .output("inputOptions", (ctx) => {
    const abundances = ctx.resultPool.getOptions(
      [
        {
          axes: [{ name: "pl7.app/sampleId" }, {}],
          annotations: {
            "pl7.app/isAbundance": "true",
            "pl7.app/abundance/normalized": "false",
            "pl7.app/abundance/isPrimary": "true",
          },
        },
      ],
      { includeNativeLabel: true },
    );
    const tensorColumns = ctx.resultPool
      .getOptions((spec) => spec.kind === "PColumn" && spec.name === TENSOR_COLUMN_NAME)
      .map((opt) => {
        const spec = ctx.resultPool.getPColumnSpecByRef(opt.ref);
        let axis;
        try {
          axis = JSON.parse(spec?.annotations?.[TENSOR_SAMPLE_AXIS_ANNOTATION] ?? "null");
        } catch {
          axis = undefined;
        }
        const content = ctx.resultPool
          .getPColumnByRef(opt.ref)
          ?.data?.getDataAsJsonOrUndefined<JsonColumnData>();
        return { ref: opt.ref, axis, designs: readDesigns(content) };
      });

    // Sample ids behind an abundance column: its partition keys on the sample axis, the same
    // notion of "this sample has data" the rest of the block uses.
    const samplesOf = (ref: PlRef): Set<string> | undefined => {
      const pCol = ctx.resultPool.getPColumnByRef(ref);
      const idx = pCol?.spec.axesSpec.findIndex((a) => a.name === "pl7.app/sampleId") ?? -1;
      if (!pCol || idx < 0) return undefined;
      const keys = getUniquePartitionKeys(pCol.data);
      return keys && idx < keys.length ? new Set(keys[idx].map((v) => String(v))) : undefined;
    };

    const withDesign: { value: string; label: string }[] = [];
    const plain: { value: string; label: string }[] = [];
    // The one design the user picked, where this abundance does not cover it: a design is chosen
    // one at a time, so the note speaks about that one and says nothing about the rest.
    let uncovered: { missing: number; total: number } | undefined;
    const chosen = ctx.data.abundanceRef;
    for (const a of abundances) {
      plain.push({ value: JSON.stringify({ abundanceRef: a.ref }), label: a.label });
      const sampleAxis = ctx.resultPool.getPColumnSpecByRef(a.ref)?.axesSpec?.[0];
      const samples = samplesOf(a.ref);
      for (const t of tensorColumns) {
        if (!sameAxisId(t.axis, sampleAxis)) continue;
        for (const d of t.designs) {
          // Strict containment: every sample the design names must carry abundance here, so a
          // plan never reaches the workflow with a position that has no data behind it.
          const want = designSamples(d);
          const missing = samples ? want.filter((s) => !samples.has(s)).length : 0;
          if (missing > 0) {
            const mine =
              a.ref.blockId === chosen?.blockId &&
              a.ref.name === chosen?.name &&
              d.designId === ctx.data.designId;
            if (mine) uncovered = { missing, total: want.length };
            continue;
          }
          withDesign.push({
            value: JSON.stringify({
              abundanceRef: a.ref,
              designTensorsRef: t.ref,
              designId: d.designId,
            } satisfies InputChoice),
            label: `${a.label} / ${d.name}`,
          });
        }
      }
    }
    return { withDesign, plain, uncovered };
  })

  // Comparison options, questions and the plan for the selected design.
  .output("designView", (ctx) => {
    const { designTensorsRef, designId, abundanceRef } = ctx.data;
    if (!designTensorsRef || designId === undefined || !abundanceRef) return undefined;
    const content = ctx.resultPool
      .getPColumnByRef(designTensorsRef)
      ?.data?.getDataAsJsonOrUndefined<JsonColumnData>();
    const design: Design | undefined = readDesigns(content).find((d) => d.designId === designId);
    if (!design) return { error: "The design is not available" };

    const sampleAxis = ctx.resultPool.getPColumnSpecByRef(abundanceRef)?.axesSpec?.[0];
    const labels = sampleAxis ? (ctx.resultPool.findLabels(sampleAxis) ?? {}) : {};
    const label = (ids: string[]) => ids.map((id) => labels[id] ?? id).join(" + ");

    const comparisons = comparisonOptions(design, label);
    const chosen = ctx.data.designComparison;
    const result = buildPlan(
      design,
      {
        comparison: chosen,
        controlEnds:
          designControlMode(ctx.data) === "pooled" ? (ctx.data.designControlEnds ?? []) : [],
        targetPieces: ctx.data.designTargetPieces ?? {},
        thresholds:
          ctx.data.designThresholdMode === "endpoint" ? (ctx.data.designThresholds ?? {}) : {},
      },
      label,
    );
    return {
      designName: design.name,
      comparisons,
      questions: result.questions,
      plan: result.plan,
      error: result.error,
    };
  })

  .output("sequenceColumnOptions", (ctx) => {
    const anchor = ctx.data.abundanceRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor }, [
      {
        axes: [{ anchor: "main", idx: 1 }],
        name: "pl7.app/vdj/sequence",
      },
      {
        axes: [{ anchor: "main", idx: 1 }],
        name: "pl7.app/sequence",
      },
    ]);
  })

  .output("metadataOptions", (ctx) => {
    const anchor = ctx.data.abundanceRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor }, [
      {
        axes: [{ anchor: "main", idx: 0 }],
        name: "pl7.app/metadata",
      },
    ]);
  })

  .output("datasetSpec", (ctx) => {
    if (ctx.data.abundanceRef) return ctx.resultPool.getPColumnSpecByRef(ctx.data.abundanceRef);
    else return undefined;
  })

  /**
   * Cluster-mode only: identify the upstream per-element primary abundance (per
   * clonotype for VDJ clusters, per variant for peptide clusters) that the input
   * cluster abundance was built from. Returns undefined for clonotype/peptide
   * input or when no unique match exists.
   */
  .output("discoveredClonotypeAbundance", (ctx) => {
    const anchor = ctx.data.abundanceRef;
    if (!anchor) return undefined;
    const anchorSpec = ctx.resultPool.getPColumnSpecByRef(anchor);
    if (!anchorSpec) return undefined;

    // Only when the input is cluster abundance (row axis = clusterId).
    const clusterAxis = anchorSpec.axesSpec[1];
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
    const candidates = ctx.resultPool.getOptions([
      {
        axes: [{ name: "pl7.app/sampleId" }, {}],
        annotations: {
          "pl7.app/isAbundance": "true",
          "pl7.app/abundance/isPrimary": "true",
          "pl7.app/abundance/normalized": "false",
        },
      },
    ]);

    // Keep those whose row axis is a clonotype key carrying the matching identity.
    const matches = candidates.filter((opt) => {
      const spec = ctx.resultPool.getPColumnSpecByRef(opt.ref);
      const rowAxis = spec?.axesSpec?.[1];
      if (!rowAxis || !isElementAxis(rowAxis.name)) return false;
      const candidateKey = JSON.stringify(
        Object.entries(rowAxis.domain ?? {}).sort(([a], [b]) => a.localeCompare(b)),
      );
      return candidateKey === identityKey;
    });

    // Exactly one is expected; anything else → no column (don't guess).
    return matches.length === 1 ? matches[0].ref : undefined;
  })

  /** PFrame with condition column and (when antigen enabled) antigen column for UI to fetch metadata values. */
  .output("metadataColumnsPframe", (ctx) => {
    const { conditionColumnRef, abundanceRef: anchor, antigenControlConfig: config } = ctx.data;
    if (!conditionColumnRef || !anchor) return undefined;

    // Resolve condition column from anchor + selector
    const conditionCols = ctx.resultPool.getAnchoredPColumns(
      { main: anchor },
      JSON.parse(conditionColumnRef) as AnchoredPColumnSelector,
    );
    const conditionCol = conditionCols?.[0];
    if (!conditionCol) return undefined;

    const columns = [conditionCol];
    // Add antigen column when target/control selection is enabled
    if (config?.antigenEnabled && config.antigenColumnRef) {
      const antigenCols = ctx.resultPool.getAnchoredPColumns(
        { main: anchor },
        JSON.parse(config.antigenColumnRef) as AnchoredPColumnSelector,
      );
      const antigenCol = antigenCols?.[0];
      if (antigenCol) columns.push(antigenCol);
    }

    return ctx.createPFrame(columns);
  })

  // Returns the IDs for the condition column (conditionColId) and the antigen column (antigenColId) by resolving them from the block arguments.
  .output("metadataColumnIds", (ctx) => {
    const { conditionColumnRef, abundanceRef: anchor, antigenControlConfig: config } = ctx.data;
    if (!conditionColumnRef || !anchor) return undefined;

    const conditionCols = ctx.resultPool.getAnchoredPColumns(
      { main: anchor },
      JSON.parse(conditionColumnRef) as AnchoredPColumnSelector,
    );
    const conditionColId = conditionCols?.[0]?.id;

    let antigenColId: string | undefined;
    if (config?.antigenEnabled && config.antigenColumnRef) {
      const antigenCols = ctx.resultPool.getAnchoredPColumns(
        { main: anchor },
        JSON.parse(config.antigenColumnRef) as AnchoredPColumnSelector,
      );
      antigenColId = antigenCols?.[0]?.id;
    }

    return { conditionColId, antigenColId };
  })

  // Sample IDs that participate in the abundance column. Read partition keys
  // from the abundance column data: it is partitioned on `pl7.app/sampleId`
  // (axis 0), so the partition keys at that index are the sample IDs.
  // Avoids relying on the upstream dataset's `pl7.app/axisKeys/0` annotation,
  // which carries `sampleGroupId` (not `sampleId`) for `MultiplexedFastq`.
  .output("sampleIds", (ctx) => {
    const { abundanceRef } = ctx.data;
    if (!abundanceRef) return undefined;
    const pCol = ctx.resultPool.getPColumnByRef(abundanceRef);
    if (!pCol) return undefined;
    const sampleAxisIdx = pCol.spec.axesSpec.findIndex((a) => a.name === "pl7.app/sampleId");
    if (sampleAxisIdx < 0) return undefined;
    const keysPerAxis = getUniquePartitionKeys(pCol.data);
    if (!keysPerAxis || sampleAxisIdx >= keysPerAxis.length) return undefined;
    return keysPerAxis[sampleAxisIdx].map((v) => String(v));
  })

  // Get all enrichment statistics
  .output("enrichmentStats", (ctx) => {
    const statsObj = ctx.outputs
      ?.resolve({ field: "outStats", allowPermanentAbsence: true })
      ?.getDataAsJson();
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
    const pCols = ctx.outputs?.resolve("enrichmentPf")?.getPColumns();

    if (!pCols?.length) {
      return undefined;
    }

    // Pull sequence columns from result pool to show in the table
    const anchor = ctx.activeArgs?.abundanceRef;
    const enrichmentAxisName = pCols[0]?.spec.axesSpec[0]?.name;
    const allSeqCols = anchor
      ? ColumnsCollection(["result_pool"], { ctx: ctx.ctx })
          .discover({
            anchors: { main: anchor },
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
          // The enrichment results are one row per clonotype. A sequence column carrying a second
          // axis would split each clonotype across that axis' values, fill the top N with copies
          // and put a "Show for" above the table (alpaca gets one holding only R1_A).
          .filter((col) => col.getSpec().axesSpec.length === 1)
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
      .map((col) => col.withSpecs({ annotations: { "pl7.app/table/visibility": "optional" } }));

    return createPlDataTableV3(ctx, {
      // Single primary: V3 anchors label discovery per primary column, and several
      // same-axis enrichment columns collide. They share one PFrame, so joining
      // the rest as secondary is equivalent to the old inner join among core columns.
      primaryColumns: [DataColumn.fromColumn(pCols[0])],
      columns: [
        ...pCols.slice(1).map((c) => DataColumn.fromColumn(c)),
        ...mainSeqCols,
        ...otherRegionCols,
      ],
      tableState: ctx.data.tableState,
    });
  })

  // Returns a map of results for plot
  .outputWithStatus("bubblePf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs
      ?.resolve({ field: "bubblePf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof PCols for plot defaults
  .output("bubblePCols", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "bubblePf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  .outputWithStatus("stackedPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs
      ?.resolve({ field: "stackedPf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("stackedPCols", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "stackedPf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  .outputWithStatus("linePf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs
      ?.resolve({ field: "linePf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("isRunning", (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .outputWithStatus("controlScatterPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs
      ?.resolve({ field: "controlScatterPf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("controlScatterPCols", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "controlScatterPf", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  .output("filteredTooMuch", (ctx) => {
    const filteredTooMuch = ctx.outputs
      ?.resolve({ field: "filteredTooMuch", allowPermanentAbsence: true })
      ?.getDataAsJson() as object;
    if (typeof filteredTooMuch === "boolean") {
      return filteredTooMuch;
    }
    return undefined;
  })

  .output(
    "modality",
    (ctx) => {
      const spec = ctx.data.abundanceRef
        ? ctx.resultPool.getPColumnSpecByRef(ctx.data.abundanceRef)
        : undefined;
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

  .title(() => "Enrichment Analysis")

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel)

  .sections((ctx) => {
    const sections: Array<{ type: "link"; href: `/${string}`; label: string }> = [
      { type: "link", href: "/", label: "Main" },
      { type: "link", href: "/bubble", label: "Enriched Bubble Plot" },
      { type: "link", href: "/line", label: "Frequency Line Plot" },
      { type: "link", href: "/stacked", label: "Frequency Bar Plot" },
    ];

    // Design mode: a control scatter when some score has controls (control arms or sibling pieces)
    if (ctx.data.designId !== undefined) {
      if (ctx.data.designPlan?.scores.some((s) => s.controls.length > 0))
        sections.push({ type: "link", href: "/scatter", label: "Control Scatter Plot" });
    } else if (ctx.data.antigenControlConfig.controlEnabled) {
      if (
        ctx.data.antigenControlConfig.controlConditionsOrder.length > 1 ||
        (ctx.data.antigenControlConfig.sequencedLibraryEnabled === true &&
          ctx.data.antigenControlConfig.controlConditionsOrder.length === 1)
      ) {
        sections.push({ type: "link", href: "/scatter", label: "Control Scatter Plot" });
      }
      if (
        ctx.data.antigenControlConfig.sequencedLibraryEnabled === false &&
        ctx.data.antigenControlConfig.controlConditionsOrder.length === 1
      ) {
        sections.push({ type: "link", href: "/box", label: "Control Box Plot" });
      }
    }

    return sections;
  })

  .done();
