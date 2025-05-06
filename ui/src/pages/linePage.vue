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
    return pcols.findIndex((p) => (p.spec.name === name
      && p.spec.annotations?.['pl7.app/vdj/isScore'] === undefined
    ));
  }
  const defaults: PredefinedGraphOption<'discrete'>[] = [
    {
      inputName: 'y',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/frequency',
        bubblePcols)].spec,
    },
    // pl7.app/vdj/clonotypeKey
    {
      inputName: 'secondaryGrouping',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/frequency',
        bubblePcols)].spec.axesSpec[0],
    },
    // pl7.app/vdj/round
    {
      inputName: 'primaryGrouping',
      selectedSource: bubblePcols[getIndex('pl7.app/vdj/frequency',
        bubblePcols)].spec.axesSpec[1],
    },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.lineState" chartType="discrete"
    :p-frame="app.model.outputs.linePf"
    :default-options="defaultOptions"
  />
</template>
