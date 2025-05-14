import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnIdAndSpec, PFrameHandle, PlDataTableState, PlRef, PlTableFiltersModel, SUniversalPColumnId, TreeNodeAccessor } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, createPlDataTable, PColumnCollection } from '@platforma-sdk/model';
import type { APColumnSelectorWithSplit } from '@platforma-sdk/model/dist/render/util/split_selectors';

export type UiState = {
  title?: string;
  tableState: PlDataTableState;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  filterModel: PlTableFiltersModel;
};

export type BlockArgs = {
  abundanceRef?: PlRef;
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder: string[];
  enrichmentThreshold: number;
  conditionExport?: string;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    conditionOrder: [],
    enrichmentThreshold: 3,
  })

  .withUiState<UiState>({
    title: 'Clonotype enrichment',
    tableState: {
      gridState: {},
      pTableParams: {
        sorting: [],
        filters: [],
      },
    },
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
      title: 'Clonotype enrichment',
      template: 'line',
      currentTab: null,
    },
    stackedState: {
      title: 'Top clonotype frequencies',
      template: 'stackedBar',
      currentTab: null,
    },
    filterModel: {},
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
    ]),
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

  // Returns a map of results for main table
  .output('pt', (ctx) => {
    const pCols = ctx.outputs?.resolve('enrichmentPf')?.getPColumns();

    if (pCols === undefined) {
      return undefined;
    }

    const splitByCondition = new PColumnCollection()
      .addAxisLabelProvider(ctx.resultPool)
      .addColumns(pCols)
      .getColumns({ axes: [{ split: true }, { }] });

    if (splitByCondition === undefined) {
      return undefined;
    }

    return createPlDataTable(ctx, splitByCondition, ctx.uiState.tableState, {
      filters: ctx.uiState.filterModel?.filters,
    });
  })

  // Returns a map of results for plot
  .output('bubblePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof Pcols for plot defaults
  .output('bubblePcols', (ctx) => {
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

  .output('stackedPcols', (ctx) => {
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

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/buble', label: 'Enriched bubble plot' },
    { type: 'link', href: '/line', label: 'Frequency line plot' },
    { type: 'link', href: '/stacked', label: 'Frequency bar plot' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
