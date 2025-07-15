import type { GraphMakerState } from '@milaboratories/graph-maker';
import type {
  InferOutputsType,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlRef,
  SUniversalPColumnId,
  TreeNodeAccessor,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPFrameForGraphs,
  createPlDataTableStateV2,
  createPlDataTableV2,
} from '@platforma-sdk/model';
import type { APColumnSelectorWithSplit } from '@platforma-sdk/model/dist/render/util/split_selectors';

export type DownsamplingParameters = {
  type?: 'none' | 'hypergeometric' ;
  valueChooser?: 'min' | 'fixed' | 'auto';
  n?: number;
};

export type UiState = {
  title?: string;
  tableState: PlDataTableStateV2;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
};

export type BlockArgs = {
  abundanceRef?: PlRef;
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder: string[];
  downsampling: DownsamplingParameters;
};

// Function to gets stats values output from the workflow
function getStatValue(statsObj: object | undefined, label: string): string | undefined {
  if (statsObj === undefined || statsObj === null) {
    return undefined;
  }
  // Check if the label exists and is a string
  const obj = statsObj as Record<string, number>;
  if (label in obj && typeof obj[label] === 'string') {
    const value = +obj[label];
    return String(value.toFixed(2));
  }
  return undefined;
}

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    conditionOrder: [],
    downsampling: {
      type: 'hypergeometric',
      valueChooser: 'auto',
    },
  })

  .withUiState<UiState>({
    title: 'Clonotype enrichment',
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
      title: 'Top 20 enriched clonotype frequencies',
      template: 'line',
      currentTab: null,
    },
    stackedState: {
      title: 'Top 5 enriched clonotype frequencies',
      template: 'stackedBar',
      currentTab: null,
    },
  })

  .argsValid((ctx) => ctx.args.abundanceRef !== undefined
    && ctx.args.conditionColumnRef !== undefined
    && ctx.args.conditionOrder.length > 0)

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
    if (ctx.args.abundanceRef) return ctx.resultPool.getSpecByRef(ctx.args.abundanceRef);
    else return undefined;
  })

  .output('conditionValues', (ctx) => {
    const conditionColumnRef = ctx.args.conditionColumnRef;
    if (!conditionColumnRef) return undefined;

    const anchor = ctx.args.abundanceRef;
    if (anchor === undefined) return undefined;

    const pCols = ctx.resultPool.getAnchoredPColumns({ main: anchor },
      JSON.parse(conditionColumnRef) as APColumnSelectorWithSplit,
    );
    const data = pCols?.[0]?.data as TreeNodeAccessor | undefined;

    // @TODO need a convenient method in API
    const values = data?.getDataAsJson<Record<string, string>>()?.['data'];
    if (!values) return undefined;

    return [...new Set(Object.values(values))];
  })

  // Get assigned cutoff value
  .output('cutoffValue', (ctx) => {
    return getStatValue(ctx.outputs?.resolve('outStats')?.getDataAsJson(), 'cutoff');
  })
  // Get enrichment data median value
  .output('medianValue', (ctx) => {
    return getStatValue(ctx.outputs?.resolve('outStats')?.getDataAsJson(), 'median');
  })
  // Get enrichment data min value
  .output('minValue', (ctx) => {
    return getStatValue(ctx.outputs?.resolve('outStats')?.getDataAsJson(), 'min');
  })
  // Get enrichment data max value
  .output('maxValue', (ctx) => {
    return getStatValue(ctx.outputs?.resolve('outStats')?.getDataAsJson(), 'max');
  })
  // Get enrichment data mean value
  .output('meanValue', (ctx) => {
    return getStatValue(ctx.outputs?.resolve('outStats')?.getDataAsJson(), 'mean');
  })

  // Returns a map of results for main table
  .output('pt', (ctx) => {
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
  .output('bubblePf', (ctx): PFrameHandle | undefined => {
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

  .output('stackedPf', (ctx): PFrameHandle | undefined => {
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

  .output('linePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('linePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('isRunning', (ctx) => ctx.outputs?.getIsReadyOrError() === false)

  .title((ctx) => ctx.uiState.title ?? 'Clonotype enrichment')

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/buble', label: 'Enriched bubble plot' },
    { type: 'link', href: '/line', label: 'Frequency line plot' },
    { type: 'link', href: '/stacked', label: 'Frequency bar plot' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
