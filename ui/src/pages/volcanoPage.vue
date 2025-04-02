<script setup lang="ts">
import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { useApp } from '../app';
import { computed } from 'vue';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';

const app = useApp();

const defaultOptions = computed((): GraphMakerProps['defaultOptions'] => {
  if (!app.model.outputs.volcanoPcols)
    return undefined;

  const volcanoPcols = app.model.outputs.volcanoPcols;
  function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
    return pcols.findIndex((p) => p.spec.name === name);
  }
  const defaults: PredefinedGraphOption<'scatterplot-umap'>[] = [
    {
      inputName: 'x',
      selectedSource: volcanoPcols[getIndex('pl7.app/vdj/enrichment',
        volcanoPcols)].spec,
    },
    {
      inputName: 'y',
      selectedSource: volcanoPcols[getIndex('pl7.app/vdj/frequency',
        volcanoPcols)].spec,
    },
    {
      inputName: 'grouping',
      selectedSource: volcanoPcols[getIndex('pl7.app/vdj/frequency',
        volcanoPcols)].spec.axesSpec[0],
    },
    {
      inputName: 'tooltipContent',
      selectedSource: volcanoPcols[getIndex('pl7.app/vdj/temporarylabel',
        volcanoPcols)].spec,
    },
  ];
  return defaults;
});

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.volcanoState" chartType="scatterplot-umap"
    :p-frame="app.model.outputs.volcanoPf" :defaultOptions="defaultOptions"
  />
</template>
