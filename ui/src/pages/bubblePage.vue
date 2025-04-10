<script setup lang="ts">
import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { useApp } from '../app';
import { computed } from 'vue';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';

const app = useApp();

const defaultOptions = computed((): GraphMakerProps['defaultOptions'] => {
  if (!app.model.outputs.bubblePcols)
    return undefined;

  const bubblePcols = app.model.outputs.bubblePcols;
  function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
    return pcols.findIndex((p) => p.spec.name === name);
  }
  const defaults: PredefinedGraphOption<'bubble'>[] = [
    // first axis as x label (not possible yet)
    // {
    //   inputName: 'x',
    //   selectedSource: bubblePcols[getIndex('pl7.app/vdj/temporarylabel',
    //     bubblePcols)].spec,
    // },
    // second axis as x label (clonotype key)
    {
      inputName: 'x',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/temporarylabel',
        bubblePcols)].spec.axesSpec[0],
    },
    {
      inputName: 'y',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/temporarylabel',
        bubblePcols)].spec.axesSpec[1],
    },
    {
      inputName: 'valueColor',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/enrichment',
        bubblePcols)].spec,
    },
    {
      inputName: 'valueSize',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/frequency',
        bubblePcols)].spec,
    },
    {
      inputName: 'tooltipContent',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/temporarylabel',
        bubblePcols)].spec,
    },
    // Tab by axis containing groups
    // {
    //   inputName: 'tabBy',
    //   selectedSource: bubblePcols[getIndex('pl7.app/vdj/frequency',
    //     bubblePcols)].spec.axesSpec[0],
    // },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.bubbleState" chartType="bubble"
    :p-frame="app.model.outputs.bubblePf" :defaultOptions="defaultOptions"
  />
</template>
