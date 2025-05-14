<script setup lang="ts">
import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';
import { computed } from 'vue';
import { useApp } from '../app';
// import { computed } from 'vue';
// import type { PColumnIdAndSpec } from '@platforma-sdk/model';

const app = useApp();

const defaultOptions = computed((): GraphMakerProps['defaultOptions'] => {
  if (!app.model.outputs.stackedPcols)
    return undefined;

  const stackedPcols = app.model.outputs.stackedPcols;
  function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
    return pcols.findIndex((p) => (p.spec.name === name
      && p.spec.annotations?.['pl7.app/vdj/isScore'] === undefined
    ));
  }
  const defaults: PredefinedGraphOption<'discrete'>[] = [
    {
      inputName: 'y',
      selectedSource: stackedPcols[getIndex('pl7.app/vdj/frequency',
        stackedPcols)].spec,
    },
    // pl7.app/vdj/clonotypeKey
    {
      inputName: 'secondaryGrouping',
      selectedSource: stackedPcols[getIndex('pl7.app/vdj/frequency',
        stackedPcols)].spec.axesSpec[0],
    },
    // pl7.app/vdj/round
    {
      inputName: 'primaryGrouping',
      selectedSource: stackedPcols[getIndex('pl7.app/vdj/frequency',
        stackedPcols)].spec.axesSpec[1],
    },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.stackedState" chartType="discrete"
    :p-frame="app.model.outputs.stackedPf"
    :default-options="defaultOptions"
  />
</template>
