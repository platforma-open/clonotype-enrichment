import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnIdAndSpec, PColumnSpec, PFrameHandle, PlDataTableState, PlRef, PlTableFiltersModel } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, createPlDataTable, isPColumnSpec, PColumnCollection } from '@platforma-sdk/model';

export type UiState = {
  title?: string;
  tableState: PlDataTableState;
  bubbleState: GraphMakerState;
  lineState: GraphMakerState;
  stackedState: GraphMakerState;
  filterModel: PlTableFiltersModel;
};

export type BlockArgs = {
  countsRef?: PlRef;
  roundColumn?: PlRef;
  roundOrder: string[];
  enrichmentThreshold: number;
  roundExport?: string;
};

function isNumericType(c: PColumnSpec): boolean {
  return c.valueType === 'Double' || c.valueType === 'Int' || c.valueType === 'Float' || c.valueType === 'Long';
}

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    roundOrder: [],
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

  // User can only select as input UMI/cell count matrices or read count matrices
  // for cases where we don't have UMI counts
  // includeNativeLabel and addLabelAsSuffix makes visible the data source dataset
  // Result: [dataID] / input
  .output('countsOptions', (ctx) => {
    // First get all molecule/cell count datasets and their block IDs
    const mainOptions = ctx.resultPool.getOptions((c) =>
      isPColumnSpec(c) && isNumericType(c)
      && c.annotations?.['pl7.app/isAbundance'] === 'true'
      && c.annotations?.['pl7.app/abundance/normalized'] === 'false'
      && ['molecules', 'cells'].includes(c.annotations?.['pl7.app/abundance/unit']),
    { includeNativeLabel: true, addLabelAsSuffix: true });
    const umiBlockIds: string[] = mainOptions.map((item) => item.ref.blockId);

    // Then get all read count datasets that don't match blockIDs from molecule/cell counts
    let extraOptions = ctx.resultPool.getOptions((c) =>
      isPColumnSpec(c) && isNumericType(c)
      && c.annotations?.['pl7.app/isAbundance'] === 'true'
      && c.annotations?.['pl7.app/abundance/normalized'] === 'false'
      && c.annotations?.['pl7.app/abundance/unit'] === 'reads',
    { includeNativeLabel: true, addLabelAsSuffix: true });
    extraOptions = extraOptions.filter((item) =>
      !umiBlockIds.includes(item.ref.blockId));

    // Combine all valid options
    const validOptions = [...mainOptions, ...extraOptions];
    return validOptions;
  })

  .output('metadataOptions', (ctx) =>
    ctx.resultPool.getOptions((spec) => isPColumnSpec(spec) && spec.name === 'pl7.app/metadata'),
  )

  .output('datasetSpec', (ctx) => {
    if (ctx.args.countsRef) return ctx.resultPool.getSpecByRef(ctx.args.countsRef);
    else return undefined;
  })

  .output('roundOptions', (ctx) => {
    if (!ctx.args.roundColumn) return undefined;

    const data = ctx.resultPool.getDataByRef(ctx.args.roundColumn)?.data;

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

    // const labelPCol = ctx.outputs?.resolve('clonotypeMapPf')?.getPColumns();
    // if (labelPCol === undefined) {
    //   return undefined;
    // }

    // const pColsWithLabel = [...pCols, ...labelPCol];

    // return ctx.createPFrame(pColsWithLabel);

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
