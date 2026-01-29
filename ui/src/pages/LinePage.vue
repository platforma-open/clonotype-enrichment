<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnSpec } from '@platforma-sdk/model';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions = computed((): PredefinedGraphOption<'scatterplot'>[] | undefined => {
  if (!app.model.outputs.stackedPCols)
    return undefined;

  const stackedPCols = app.model.outputs.stackedPCols;
  const getColSpec = (name: string) =>
    stackedPCols[stackedPCols.findIndex((p) => (p.spec.name === name
      && p.spec.annotations?.['pl7.app/vdj/isScore'] === undefined
    ))].spec;

  const frequencyColSpec = getColSpec('pl7.app/vdj/frequency');
  const defaults: PredefinedGraphOption<'scatterplot'>[] = [
    {
      inputName: 'y',
      selectedSource: frequencyColSpec,
    },
    // pl7.app/vdj/condition
    {
      inputName: 'x',
      selectedSource: frequencyColSpec.axesSpec[1],
    },
    // pl7.app/vdj/clonotypeKey
    {
      inputName: 'grouping',
      selectedSource: frequencyColSpec.axesSpec[0],
    },
    {
      inputName: 'tooltipContent',
      selectedSource: frequencyColSpec.axesSpec[0],
    },
    {
      inputName: 'size',
      selectedSource: frequencyColSpec,
    },
  ];
  return defaults;
});

const isClustered = computed(() => {
  const spec = app.model.outputs.datasetSpec;
  return spec?.axesSpec !== undefined
    && spec.axesSpec.length >= 2
    && spec.axesSpec[1].name === 'pl7.app/vdj/clusterId';
});

const primaryAxis = computed(() => isClustered.value ? 'pl7.app/vdj/clusterId' : 'pl7.app/vdj/clonotypeKey');

const dataColumnPredicate = (spec: PColumnSpec) =>
  spec.axesSpec.length === 2
  && spec.axesSpec[0].name === primaryAxis.value
  && spec.axesSpec[1].name === 'pl7.app/vdj/condition';

const metaColumnPredicate = (spec: PColumnSpec) => spec.axesSpec[0]?.name === primaryAxis.value
  && !spec.annotations?.['pl7.app/trace']?.includes('clonotype-enrichment');
</script>

<template>
  <GraphMaker
    v-model="app.model.ui.lineState"
    chartType="scatterplot"
    :data-state-key="app.model.args.abundanceRef"
    :p-frame="app.model.outputs.linePf"
    :default-options="defaultOptions"
    :dataColumnPredicate="dataColumnPredicate"
    :meta-column-predicate="metaColumnPredicate"
  />
</template>
