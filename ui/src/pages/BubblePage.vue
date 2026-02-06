<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnSpec } from '@platforma-sdk/model';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions = computed((): PredefinedGraphOption<'bubble'>[] | undefined => {
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

const inputElementAxis = computed(() => {
  const spec = app.model.outputs.datasetSpec;
  if (spec?.axesSpec !== undefined && spec.axesSpec.length >= 2) {
    return spec.axesSpec[1].name;
  }
  return undefined;
});

const metaColumnPredicate = (spec: PColumnSpec) =>
  inputElementAxis.value !== undefined
  && spec.axesSpec[0]?.name === inputElementAxis.value;

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.bubbleState"
    chartType="bubble"
    :p-frame="app.model.outputs.bubblePf"
    :defaultOptions="defaultOptions"
    :dataColumnPredicate="(spec: PColumnSpec) => spec.axesSpec.length === 3 && spec.axesSpec[2].name === 'pl7.app/vdj/Baseline-condition'"
    :meta-column-predicate="metaColumnPredicate"
  />
</template>
