import type { GraphMakerState } from '@milaboratories/graph-maker';
import type { InferOutputsType, PColumnIdAndSpec, PFrameHandle, PlDataTableState, PlRef } from '@platforma-sdk/model';
import { BlockModel, createPFrameForGraphs, createPlDataTable, isPColumnSpec } from '@platforma-sdk/model';

export type UiState = {
  tableState: PlDataTableState;
  volcanoState: GraphMakerState;
  bubbleState: GraphMakerState;
  // lineState: GraphMakerState;
};

export type BlockArgs = {
  countsRef?: PlRef;
  roundColumn?: PlRef;
  roundOrder: string[];
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    roundOrder: [],
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
      title: 'Differential clonotype enrichment',
      template: 'dots',
      currentTab: null,
    },
    bubbleState: {
      title: 'Differential clonotype enrichment',
      template: 'bubble',
      currentTab: null,
    },
    // lineState: {
    //   title: 'Differential clonotype enrichment',
    //   template: 'line',
    //   currentTab: null,
    // },
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

    // Combine all valid options
    const validOptions = [...validUmiOptions, ...validCountOptions];
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

  // Returns a map of results
  .output('pt', (ctx) => {
    const pCols = ctx.outputs?.resolve('enrichmentPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTable(ctx, pCols, ctx.uiState?.tableState);
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

  // Returns a map of results for volcano plot
  .output('bubblePf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve('bubblePf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPFrameForGraphs(ctx, pCols);
  })

  // Returns a list pof Pcols for volcano plot defaults
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

  .sections((_ctx) => ([
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/volcano', label: 'Volcano plot' },
    { type: 'link', href: '/buble', label: 'Bubble plot' },
    { type: 'link', href: '/line', label: 'Line plot' },
  ]))

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
