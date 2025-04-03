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
  const defaults: PredefinedGraphOption<'discrete'>[] = [
    // first axis as x label (not possible yet)
    {
      inputName: 'primaryGrouping',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/round',
        bubblePcols)].spec,
    },
    {
      inputName: 'y',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/enrichment',
        bubblePcols)].spec,
    },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.lineState" chartType="discrete"
    :p-frame="app.model.outputs.bubblePf"

  />
</template>
