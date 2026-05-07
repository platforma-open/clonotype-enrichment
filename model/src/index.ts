import type { GraphMakerState } from '@milaboratories/graph-maker';
import type {
  AnchoredPColumnSelector,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlRef,
  SUniversalPColumnId,
} from '@platforma-sdk/model';
import {
  Annotation,
  BlockModelV3,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  readAnnotationJson,
} from '@platforma-sdk/model';
export type * from '@milaboratories/helpers';

export type DownsamplingParameters = {
  type?: 'none' | 'hypergeometric' ;
  valueChooser?: 'min' | 'fixed' | 'auto';
  n?: number;
};

type FilteringConfig = {
  baseFilter: 'none' | 'shared' | 'single-sample';
  minAbundance: {
    enabled: boolean;
    threshold: number;
    metric: 'count' | 'frequency';
  };
  presentInRounds: {
    enabled: boolean;
    rounds: string[];
    logic: 'OR' | 'AND';
  };
  excludeSequencedLibrary: boolean;
};

type AntigenControlConfig = {
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
  additionalEnrichmentExports: string[];
  antigenControlConfig: AntigenControlConfig;
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

const dataModel = new DataModelBuilder()
  .from<BlockData>('v1')
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
    defaultBlockLabel: '',
    customBlockLabel: '',
    conditionOrder: [],
    downsampling: {
      type: 'none',
      valueChooser: 'auto',
    },
    clonotypeDefinition: [],
    FilteringConfig: {
      baseFilter: 'single-sample',
      minAbundance: {
        enabled: false,
        threshold: 100,
        metric: 'count',
      },
      presentInRounds: {
        enabled: false,
        rounds: [],
        logic: 'OR',
      },
      excludeSequencedLibrary: true,
    },
    additionalEnrichmentExports: [],
    antigenControlConfig: {
      antigenEnabled: false,
      controlEnabled: false,
      negativeAntigens: [],
      controlThreshold: 1.0,
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
      title: 'Enrichment',
      template: 'bubble',
      layersSettings: {
        bubble: {
          normalizationDirection: null,
        },
      },
      currentTab: null,
    },
    lineState: {
      title: 'Top enriched sequences',
      template: 'curve_dots',
      currentTab: null,
      layersSettings: {
        curve: {
          smoothing: false,
        },
      },
    },
    stackedState: {
      title: 'Top enriched sequences',
      template: 'stackedArea',
      currentTab: null,
    },
    scatterState: {
      title: 'Binding specificity',
      template: 'dots',
      currentTab: null,
    },
    boxState: {
      title: 'Control Box Plot',
      template: 'box',
      currentTab: null,
    },
    excludedAlertDismissedKey: undefined,
  }));

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    const { abundanceRef, conditionColumnRef, conditionOrder, antigenControlConfig } = data;

    if (!abundanceRef) throw new Error('Abundance is required');
    if (!conditionColumnRef) throw new Error('Condition column is required');
    if (!conditionOrder.length) throw new Error('Conditions are required');
    if (data.enrichmentThreshold < 0.6) throw new Error('Enrichment threshold must be ≥ 0.6');

    if (antigenControlConfig.antigenEnabled || antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenColumnRef) throw new Error('Antigen column is required');
    }

    if (antigenControlConfig.antigenEnabled) {
      if (!antigenControlConfig.targetAntigen) throw new Error('Target antigen is required');
    }

    if (antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenEnabled
        || !antigenControlConfig.negativeAntigens.length
        || antigenControlConfig.controlConditionsOrder.length < 1
        || antigenControlConfig.singleControlFrequencyThreshold === undefined)
        throw new Error('Control configuration is incomplete');
    }

    if (antigenControlConfig.sequencedLibraryEnabled) {
      if (!antigenControlConfig.sequencedLibraryAntigen) throw new Error('Library antigen is required');
    } else {
      if (conditionOrder.length <= 1) throw new Error('At least 2 conditions are required');
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
      additionalEnrichmentExports: data.additionalEnrichmentExports,
      antigenControlConfig: data.antigenControlConfig,
      enrichmentThreshold: data.enrichmentThreshold,
      pseudoCount: data.pseudoCount,
    };
  })

  .output('abundanceOptions', (ctx) =>
    ctx.resultPool.getOptions([{
      axes: [
        { name: 'pl7.app/sampleId' },
        { },
      ],
      annotations: {
        'pl7.app/isAbundance': 'true',
        'pl7.app/abundance/normalized': 'false',
        'pl7.app/abundance/isPrimary': 'true',
      },
    },
    ], { includeNativeLabel: true }),
  )

  .output('sequenceColumnOptions', (ctx) => {
    const anchor = ctx.data.abundanceRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor },
      [
        {
          axes: [
            { anchor: 'main', idx: 1 },
          ],
          name: 'pl7.app/vdj/sequence',
        },
        {
          axes: [
            { anchor: 'main', idx: 1 },
          ],
          name: 'pl7.app/sequence',
        },
      ],
    );
  })

  .output('metadataOptions', (ctx) => {
    const anchor = ctx.data.abundanceRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor },
      [{
        axes: [
          { anchor: 'main', idx: 0 },
        ],
        name: 'pl7.app/metadata',
      }],
    );
  })

  .output('datasetSpec', (ctx) => {
    if (ctx.data.abundanceRef) return ctx.resultPool.getPColumnSpecByRef(ctx.data.abundanceRef);
    else return undefined;
  })

  /** PFrame with condition column and (when antigen enabled) antigen column for UI to fetch metadata values. */
  .output('metadataColumnsPframe', (ctx) => {
    const { conditionColumnRef, abundanceRef: anchor, antigenControlConfig: config } = ctx.data;
    if (!conditionColumnRef || !anchor) return undefined;

    const conditionCols = ctx.resultPool.getAnchoredPColumns(
      { main: anchor },
      JSON.parse(conditionColumnRef) as AnchoredPColumnSelector,
    );
    const conditionCol = conditionCols?.[0];
    if (!conditionCol) return undefined;

    const columns = [conditionCol];
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

  .output('metadataColumnIds', (ctx) => {
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

  .output('sampleIds', (ctx) => {
    const { abundanceRef } = ctx.data;
    if (!abundanceRef) return undefined;
    const pCol = ctx.resultPool.getPColumnByRef(abundanceRef);
    if (!pCol) return undefined;
    const sampleAxisIdx = pCol.spec.axesSpec.findIndex((a) => a.name === 'pl7.app/sampleId');
    if (sampleAxisIdx < 0) return undefined;
    const keysPerAxis = getUniquePartitionKeys(pCol.data);
    if (!keysPerAxis || sampleAxisIdx >= keysPerAxis.length) return undefined;
    return keysPerAxis[sampleAxisIdx].map((v) => String(v));
  })

  .output('enrichmentStats', (ctx) => {
    const statsObj = ctx.outputs?.resolve('outStats')?.getDataAsJson();
    if (!statsObj) return undefined;

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(statsObj)) {
      if (typeof value === 'string') {
        result[key + 'Value'] = value;
      }
    }
    return result;
  })

  .outputWithStatus('pt', (ctx) => {
    const pCols = ctx.outputs?.resolve('enrichmentPf')?.getPColumns();

    if (pCols === undefined) {
      return undefined;
    }

    const anchor = ctx.data.abundanceRef;
    const enrichmentAxisName = pCols[0]?.spec.axesSpec[0]?.name;
    const allSeqCols = anchor
      ? (ctx.resultPool.getAnchoredPColumns(
          { main: anchor },
          [
            { axes: [{ anchor: 'main', idx: 1 }], name: 'pl7.app/vdj/sequence' },
            { axes: [{ anchor: 'main', idx: 1 }], name: 'pl7.app/sequence' },
          ],
          { dontWaitAllData: true },
        ) ?? []).filter((col) =>
          col.spec.axesSpec[0]?.name === enrichmentAxisName,
        )
      : [];

    const mainSeqCols = allSeqCols
      .filter((col) => {
        const alphabet = col.spec.domain?.['pl7.app/alphabet'];
        return (alphabet === 'aminoacid')
          && readAnnotationJson(col.spec, Annotation.VDJ.IsAssemblingFeature) !== false;
      })
      .map((col) => ({
        ...col,
        spec: {
          ...col.spec,
          annotations: { ...col.spec.annotations, 'pl7.app/table/visibility': 'default', 'pl7.app/table/orderPriority': '1' },
        },
      }));

    const otherRegionCols = allSeqCols
      .filter((col) =>
        readAnnotationJson(col.spec, Annotation.VDJ.IsAssemblingFeature) === false,
      )
      .map((col) => ({
        ...col,
        spec: {
          ...col.spec,
          annotations: { ...col.spec.annotations, 'pl7.app/table/visibility': 'optional' },
        },
      }));

    return createPlDataTableV2(
      ctx,
      [...pCols, ...mainSeqCols, ...otherRegionCols],
      ctx.data.tableState,
      {
        coreColumnPredicate: ({ spec }) =>
          spec.name !== 'pl7.app/vdj/sequence' && spec.name !== 'pl7.app/sequence',
        coreJoinType: 'inner',
      },
    );
  })

  .outputWithStatus('bubblePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('bubblePCols', (ctx) => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .outputWithStatus('stackedPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('stackedPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('stackedPCols', (ctx) => {
    const pCols = ctx.outputs?.resolve('stackedPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .outputWithStatus('linePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('linePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .outputWithStatus('controlScatterPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve({ field: 'controlScatterPf', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('controlScatterPCols', (ctx) => {
    const pCols = ctx.outputs?.resolve({ field: 'controlScatterPf', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('filteredTooMuch', (ctx) => {
    const filteredTooMuch = ctx.outputs?.resolve('filteredTooMuch')?.getDataAsJson() as object;
    if (typeof filteredTooMuch === 'boolean') {
      return filteredTooMuch;
    }
    return undefined;
  })

  .output('modality', (ctx) => {
    const spec = ctx.data.abundanceRef
      ? ctx.resultPool.getPColumnSpecByRef(ctx.data.abundanceRef)
      : undefined;
    if (!spec) return undefined;
    for (const ax of spec.axesSpec) {
      if (ax.name === 'pl7.app/variantKey') return 'peptide';
      if (ax.name === 'pl7.app/vdj/clonotypeKey' || ax.name === 'pl7.app/vdj/scClonotypeKey') return 'antibody_tcr';
      for (const key of Object.keys(ax.domain ?? {})) {
        if (key.startsWith('pl7.app/peptide/')) return 'peptide';
        if (key.startsWith('pl7.app/vdj/')) return 'antibody_tcr';
      }
    }
    return 'antibody_tcr';
  }, { retentive: true })

  .title(() => 'Enrichment Analysis')

  .subtitle((ctx) => ctx.data.customBlockLabel || ctx.data.defaultBlockLabel)

  .sections((ctx) => {
    const sections: Array<{ type: 'link'; href: `/${string}`; label: string }> = [
      { type: 'link', href: '/', label: 'Main' },
      { type: 'link', href: '/bubble', label: 'Enriched Bubble Plot' },
      { type: 'link', href: '/line', label: 'Frequency Line Plot' },
      { type: 'link', href: '/stacked', label: 'Frequency Bar Plot' },
    ];

    if (ctx.data.antigenControlConfig.controlEnabled) {
      if (ctx.data.antigenControlConfig.controlConditionsOrder.length > 1
        || (ctx.data.antigenControlConfig.sequencedLibraryEnabled === true
          && ctx.data.antigenControlConfig.controlConditionsOrder.length === 1)
      ) {
        sections.push({ type: 'link', href: '/scatter', label: 'Control Scatter Plot' });
      }
      if (ctx.data.antigenControlConfig.sequencedLibraryEnabled === false
        && ctx.data.antigenControlConfig.controlConditionsOrder.length === 1
      ) {
        sections.push({ type: 'link', href: '/box', label: 'Control Box Plot' });
      }
    }

    return sections;
  })

  .done();
