<script setup lang="ts">
import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions = computed((): PredefinedGraphOption<'discrete'>[] | undefined => {
  if (!app.model.outputs.stackedPCols)
    return undefined;

  const stackedPCols = app.model.outputs.stackedPCols;
  const getColSpec = (name: string) =>
    stackedPCols[stackedPCols.findIndex((p) => (p.spec.name === name
      && p.spec.annotations?.['pl7.app/vdj/isScore'] === undefined
    ))].spec;

  const frequencyColSpec = getColSpec('pl7.app/vdj/frequency');
  const defaults: PredefinedGraphOption<'discrete'>[] = [
    {
      inputName: 'y',
      selectedSource: frequencyColSpec,
    },
    // pl7.app/vdj/clonotypeKey
    {
      inputName: 'secondaryGrouping',
      selectedSource: frequencyColSpec.axesSpec[0],
    },
    // pl7.app/vdj/round
    {
      inputName: 'primaryGrouping',
      selectedSource: frequencyColSpec.axesSpec[1],
    },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.stackedState"
    chartType="discrete"
    :data-state-key="app.model.args.abundanceRef"
    :p-frame="app.model.outputs.stackedPf"
    :default-options="defaultOptions"
  />
</template>
