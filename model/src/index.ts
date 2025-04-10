import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnIdAndSpec, PFrameHandle, PlDataTableState, PlRef, PlTableFiltersModel } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, createPlDataTable, isPColumnSpec } from '@platforma-sdk/model';

export type UiState = {
  tableState: PlDataTableState;
  volcanoState: GraphMakerState;
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
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    roundOrder: [],
    enrichmentThreshold: 3,
  })

  .withUiState<UiState>({
    tableState: {
      gridState: {},
      pTableParams: {
        sorting: [],
        filters: [],
      },
    },
    volcanoState: {
      title: 'Clonotype enrichment',
      template: 'dots',
    },
    bubbleState: {
      title: 'Clonotype enrichment',
      template: 'bubble',
    },
    lineState: {
      title: 'Clonotype enrichment',
      template: 'line',
    },
    stackedState: {
      title: 'Top clonotype frequencies',
      template: 'stackedBar',
    },
    filterModel: {},
  })

  // User can only select as input UMI count matrices or read count matrices
  // for cases where we don't have UMI counts
  // includeNativeLabel and addLabelAsSuffix makes visible the data source dataset
  // Result: [dataID] / input
  .output('countsOptions', (ctx) => {
    // First get all UMI count dataset and their block IDs
    const validUmiOptions = ctx.resultPool.getOptions((spec) => isPColumnSpec(spec)
      && (spec.name === 'pl7.app/vdj/uniqueMoleculeCount')
      && (spec.annotations?.['pl7.app/abundance/normalized'] === 'false')
    , { includeNativeLabel: true, addLabelAsSuffix: true });
    const umiBlockIds: string[] = validUmiOptions.map((item) => item.ref.blockId);

    // Then get all read count datasets that don't match blockIDs from UMI counts
    let validCountOptions = ctx.resultPool.getOptions((spec) => isPColumnSpec(spec)
      && (spec.name === 'pl7.app/vdj/readCount')
      && (spec.annotations?.['pl7.app/abundance/normalized'] === 'false')
    , { includeNativeLabel: true, addLabelAsSuffix: true });
    validCountOptions = validCountOptions.filter((item) =>
      !umiBlockIds.includes(item.ref.blockId));

    // Add single cell da
    const validScOptions = ctx.resultPool.getOptions((spec) => isPColumnSpec(spec)
      && (spec.name === 'pl7.app/vdj/uniqueCellCount')
      && (spec.annotations?.['pl7.app/abundance/normalized'] === 'false')
    , { includeNativeLabel: true, addLabelAsSuffix: true });

    // Combine all valid options
    const validOptions = [...validUmiOptions, ...validCountOptions, ...validScOptions];
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

    return createPlDataTable(ctx, pCols, ctx.uiState.tableState, {
      filters: ctx.uiState.filterModel?.filters,
    });
  })

  // Returns a map of results for volcano plot
  .output('volcanoPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('volcanoPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof Pcols for volcano plot defaults
  .output('volcanoPcols', (ctx) => {
    const pCols = ctx.outputs?.resolve('volcanoPf')?.getPColumns();
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

  // Returns a map of results for plot
  .output('bubblePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const labelPCol = ctx.outputs?.resolve('clonotypeMapPf')?.getPColumns();
    if (labelPCol === undefined) {
      return undefined;
    }

    const pColsWithLabel = [...pCols, ...labelPCol];

    return ctx.createPFrame(pColsWithLabel);
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

    return ctx.createPFrame(pCols);
  })

  .output('linePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('linePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return ctx.createPFrame(pCols);
  })

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/buble', label: 'Enriched bubble plot' },
    { type: 'link', href: '/line', label: 'Frequency line plot' },
    { type: 'link', href: '/stacked', label: 'Frequency bar plot' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
