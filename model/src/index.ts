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
  BlockModel,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
} from '@platforma-sdk/model';

export type DownsamplingParameters = {
  type?: 'none' | 'hypergeometric' ;
  valueChooser?: 'min' | 'fixed' | 'auto';
  n?: number;
};

type FilteringConfig = {
  // Mutually exclusive base filter
  baseFilter: 'none' | 'shared' | 'single-sample';

  // Combinatory filters (apply on top of base)
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
};

type AntigenControlConfig = {
  antigenEnabled: boolean;
  controlEnabled: boolean;
  antigenColumnRef?: SUniversalPColumnId; // Metadata column for antigen/control
  targetAntigen?: string; // e.g., "Target-Antigen"
  negativeAntigens: string[]; // e.g., ["BSA", "Plastic"]
  targetThreshold: number; // Default: 2.0 log2 FC
  controlThreshold: number; // Default: 1.0 log2 FC
  controlConditionsOrder: string[]; // e.g., ["BSA", "Plastic"]
};

export type UiState = {
  tableState: PlDataTableStateV2;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  scatterState: GraphMakerState;
  /** When set, the "conditions excluded by target" alert is hidden until the excluded list changes (key = sorted excluded conditions). */
  excludedAlertDismissedKey?: string;
};

export type BlockArgs = {
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
  pseudoCount: number; // Default: 100
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    defaultBlockLabel: '',
    customBlockLabel: '',
    conditionOrder: [],
    downsampling: {
      type: 'hypergeometric',
      valueChooser: 'auto',
    },
    clonotypeDefinition: [],
    FilteringConfig: {
      baseFilter: 'none',
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
    },
    additionalEnrichmentExports: [],
    antigenControlConfig: {
      antigenEnabled: false,
      controlEnabled: false,
      negativeAntigens: [],
      targetThreshold: 2.0,
      controlThreshold: 1.0,
      controlConditionsOrder: [],
    },
    pseudoCount: 100,
  })

  .withUiState<UiState>({
    tableState: createPlDataTableStateV2(),
    bubbleState: {
      title: 'Clonotype enrichment',
      template: 'bubble',
      layersSettings: {
        bubble: {
          normalizationDirection: null,
        },
      },
      currentTab: null,
    },
    lineState: {
      title: 'Top 10 enriched clonotype frequencies',
      template: 'curve_dots',
      currentTab: null,
      layersSettings: {
        curve: {
          smoothing: false,
        },
      },
    },
    stackedState: {
      title: 'Top 10 enriched clonotype frequencies',
      template: 'stackedArea',
      currentTab: null,
    },
    scatterState: {
      title: 'Binding specificity',
      template: 'dots',
      currentTab: null,
    },
    excludedAlertDismissedKey: undefined,
  })

  .argsValid((ctx) => {
    const { abundanceRef, conditionColumnRef, conditionOrder, antigenControlConfig } = ctx.args;
    const basicValid = abundanceRef !== undefined
      && conditionColumnRef !== undefined
      && conditionOrder.length > 0;

    if (!basicValid) return false;

    if (antigenControlConfig.antigenEnabled || antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenColumnRef) return false;
    }

    if (antigenControlConfig.antigenEnabled) {
      if (!antigenControlConfig.targetAntigen) return false;
    }

    if (antigenControlConfig.controlEnabled) {
      if (!antigenControlConfig.antigenEnabled
        || !antigenControlConfig.negativeAntigens.length
        || antigenControlConfig.controlConditionsOrder.length < 2) return false;
    }

    return true;
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
    const anchor = ctx.args.abundanceRef;
    if (anchor === undefined) return undefined;
    return ctx.resultPool.getCanonicalOptions({ main: anchor },
      [{
        axes: [
          { anchor: 'main', idx: 1 },
        ],
        name: 'pl7.app/vdj/sequence',
      }],
    );
  })

  .output('metadataOptions', (ctx) => {
    const anchor = ctx.args.abundanceRef;
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
    if (ctx.args.abundanceRef) return ctx.resultPool.getPColumnSpecByRef(ctx.args.abundanceRef);
    else return undefined;
  })

  /** PFrame with condition column and (when antigen enabled) antigen column for UI to fetch metadata values. */
  .output('metadataColumnsPframe', (ctx) => {
    const { conditionColumnRef, abundanceRef: anchor, antigenControlConfig: config } = ctx.args;
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

  // Get all enrichment statistics
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

  // Returns a map of results for main table
  .outputWithStatus('pt', (ctx) => {
    const pCols = ctx.outputs?.resolve('enrichmentPf')?.getPColumns();

    if (pCols === undefined) {
      return undefined;
    }

    // const maxEnrichPcol = pCols.filter((col) => (
    //   col.spec.name === 'pl7.app/vdj/maxEnrichment'),
    // );

    return createPlDataTableV2(
      ctx,
      pCols,
      ctx.uiState.tableState,
    );
  })

  // Returns a map of results for plot
  .outputWithStatus('bubblePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof PCols for plot defaults
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

  .title(() => 'Clonotype enrichment')

  .subtitle((ctx) => ctx.args.customBlockLabel || ctx.args.defaultBlockLabel)

  .sections((ctx) => {
    const sections: Array<{ type: 'link'; href: `/${string}`; label: string }> = [
      { type: 'link', href: '/', label: 'Main' },
      { type: 'link', href: '/bubble', label: 'Enriched Bubble Plot' },
      { type: 'link', href: '/line', label: 'Frequency Line Plot' },
      { type: 'link', href: '/stacked', label: 'Frequency Bar Plot' },
    ];

    if (ctx.args.antigenControlConfig.controlEnabled) {
      sections.push({ type: 'link', href: '/scatter', label: 'Control Scatter Plot' });
    }
    return sections;
  })

  .done(2);
