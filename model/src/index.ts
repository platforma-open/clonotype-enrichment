import type { GraphMakerState } from "@milaboratories/graph-maker";
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
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  readAnnotationJson,
} from "@platforma-sdk/model";
export type * from "@milaboratories/helpers";

export type DownsamplingParameters = {
  type?: "none" | "hypergeometric";
  valueChooser?: "min" | "fixed" | "auto";
  n?: number;
};

type FilteringConfig = {
  // Mutually exclusive base filter
  baseFilter: "none" | "shared" | "single-sample";

  // Combinatory filters (apply on top of base)
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

type AntigenControlConfig = {
  antigenEnabled: boolean;
  controlEnabled: boolean;
  antigenColumnRef?: SUniversalPColumnId; // Metadata column for antigen/control
  targetAntigen?: string; // e.g., "Target-Antigen"
  negativeAntigens: string[]; // e.g., ["BSA", "Plastic"]
  controlThreshold: number; // Default: 1.0 log2 FC
  // singleControlFoldChangeThreshold: number; // Default: 10.0
  singleControlFrequencyThreshold: number; // Default: 0.01
  controlConditionsOrder: string[]; // e.g., ["BSA", "Plastic"]
  sequencedLibraryEnabled: boolean;
  sequencedLibraryAntigen?: string;
  hasSingleConditionNegativeControl: boolean;
  hasMultiConditionNegativeControl: boolean;
};

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
   * Cluster-mode only: PlRef of the upstream per-clonotype primary abundance the
   * input cluster abundance was built from.
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
};

const dataModel = new DataModelBuilder()
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
  .init(() => ({
    defaultBlockLabel: "",
    customBlockLabel: "",
    conditionOrder: [],
    downsampling: {
      type: "none",
      valueChooser: "auto",
    },
    clonotypeDefinition: [],
    FilteringConfig: {
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
    additionalEnrichmentExports: [],
    antigenControlConfig: {
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
    enrichmentThreshold: 2.0,
    pseudoCount: 1,
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

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    const { abundanceRef, conditionColumnRef, conditionOrder, antigenControlConfig } = data;

    if (!abundanceRef) throw new Error("Abundance is required");
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
   * Cluster-mode only: identify the upstream per-clonotype primary abundance that
   * the input cluster abundance was built from. Returns undefined for
   * clonotype/peptide input or when no unique match exists.
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

    const isClonotypeAxis = (name: string) =>
      name === "pl7.app/vdj/clonotypeKey" || name === "pl7.app/vdj/scClonotypeKey";

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
      if (!rowAxis || !isClonotypeAxis(rowAxis.name)) return false;
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
    const pCols = ctx.outputs?.resolve("enrichmentPf")?.getPColumns();

    if (pCols === undefined) {
      return undefined;
    }

    // Pull sequence columns from result pool to show in the table
    const anchor = ctx.data.abundanceRef;
    const enrichmentAxisName = pCols[0]?.spec.axesSpec[0]?.name;
    const allSeqCols = anchor
      ? (
          ctx.resultPool.getAnchoredPColumns(
            { main: anchor },
            [
              { axes: [{ anchor: "main", idx: 1 }], name: "pl7.app/vdj/sequence" },
              { axes: [{ anchor: "main", idx: 1 }], name: "pl7.app/sequence" },
            ],
            { dontWaitAllData: true },
          ) ?? []
        ).filter(
          (col) =>
            // Skip if axis doesn't match enrichment (e.g. stale results after switching input)
            col.spec.axesSpec[0]?.name === enrichmentAxisName,
        )
      : [];

    // Assembling feature (or centroid) amino acid sequences — visible by default
    const mainSeqCols = allSeqCols
      .filter((col) => {
        const alphabet = col.spec.domain?.["pl7.app/alphabet"];
        // !== false (not === true) to also match cluster centroid sequences,
        // where clonotype-clustering deletes the isAssemblingFeature annotation
        return (
          alphabet === "aminoacid" &&
          readAnnotationJson(col.spec, Annotation.VDJ.IsAssemblingFeature) !== false
        );
      })
      .map((col) => ({
        ...col,
        spec: {
          ...col.spec,
          annotations: {
            ...col.spec.annotations,
            "pl7.app/table/visibility": "default",
            "pl7.app/table/orderPriority": "1",
          },
        },
      }));

    // Other region sequences (CDR1, CDR2, FR1, etc.) — not shown by default, available in column picker
    const otherRegionCols = allSeqCols
      .filter((col) => readAnnotationJson(col.spec, Annotation.VDJ.IsAssemblingFeature) === false)
      .map((col) => ({
        ...col,
        spec: {
          ...col.spec,
          annotations: { ...col.spec.annotations, "pl7.app/table/visibility": "optional" },
        },
      }));

    return createPlDataTableV2(
      ctx,
      [...pCols, ...mainSeqCols, ...otherRegionCols],
      ctx.data.tableState,
      {
        // Sequence columns are non-core so they are left-joined: they won't
        // bring back clonotypes that were filtered out during enrichment
        coreColumnPredicate: ({ spec }) =>
          spec.name !== "pl7.app/vdj/sequence" && spec.name !== "pl7.app/sequence",
        coreJoinType: "inner",
      },
    );
  })

  // Returns a map of results for plot
  .outputWithStatus("bubblePf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve("bubblePf")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof PCols for plot defaults
  .output("bubblePCols", (ctx) => {
    const pCols = ctx.outputs?.resolve("bubblePf")?.getPColumns();
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
    const pCols = ctx.outputs?.resolve("stackedPf")?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("stackedPCols", (ctx) => {
    const pCols = ctx.outputs?.resolve("stackedPf")?.getPColumns();
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
    const pCols = ctx.outputs?.resolve("linePf")?.getPColumns();
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
    const filteredTooMuch = ctx.outputs?.resolve("filteredTooMuch")?.getDataAsJson() as object;
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
        if (ax.name === "pl7.app/variantKey") return "peptide";
        if (ax.name === "pl7.app/vdj/clonotypeKey" || ax.name === "pl7.app/vdj/scClonotypeKey")
          return "antibody_tcr";
        // clustered abundances
        for (const key of Object.keys(ax.domain ?? {})) {
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

    if (ctx.data.antigenControlConfig.controlEnabled) {
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
