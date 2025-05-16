<script setup lang="ts">
import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions = computed((): GraphMakerProps['defaultOptions'] => {
  if (!app.model.outputs.bubblePCols)
    return undefined;

  const bubblePCols = app.model.outputs.bubblePCols;

  const getColSpec = (name: string) =>
    bubblePCols[bubblePCols.findIndex((p) => (p.spec.name === name
      && p.spec.annotations?.['pl7.app/vdj/isScore'] === undefined
    ))].spec;

  const enrichmentCol = getColSpec('pl7.app/vdj/enrichment');
  const frequencyCol = getColSpec('pl7.app/vdj/numerator-frequency');

  const defaults: PredefinedGraphOption<'bubble'>[] = [
    {
      inputName: 'x',
      selectedSource: enrichmentCol.axesSpec[0],
    },
    {
      inputName: 'y',
      selectedSource: enrichmentCol.axesSpec[1],
    },
    {
      inputName: 'tabBy',
      selectedSource: enrichmentCol.axesSpec[2],
    },
    {
      inputName: 'valueColor',
      selectedSource: enrichmentCol,
    },
    {
      inputName: 'valueSize',
      selectedSource: frequencyCol,
    },
    {
      inputName: 'tooltipContent',
      selectedSource: enrichmentCol.axesSpec[0],
    },
  ];
  return defaults;
});

// @TODO: add data-state-key to GraphMaker once it's fixed
// :data-state-key="app.model.args.abundanceRef"
</script>

<template>
  <GraphMaker
    v-model="app.model.ui.bubbleState"
    chartType="bubble"
    :data-state-key="app.model.args.abundanceRef"
    :p-frame="app.model.outputs.bubblePf"
    :defaultOptions="defaultOptions"
  />
</template>
