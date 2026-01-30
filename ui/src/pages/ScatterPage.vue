<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnSpec } from '@platforma-sdk/model';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const defaultOptions = computed((): PredefinedGraphOption<'scatterplot'>[] | undefined => {
  if (!app.model.outputs.controlScatterPCols)
    return undefined;

  const controlScatterPCols = app.model.outputs.controlScatterPCols;
  const getColSpec = (name: string) => {
    const idx = controlScatterPCols.findIndex((p) => (p.spec.name === name));
    return idx !== -1 ? controlScatterPCols[idx].spec : undefined;
  };

  const maxEnrichmentSpec = getColSpec('pl7.app/vdj/maxEnrichment');
  const maxNegControlEnrichmentSpec = getColSpec('pl7.app/vdj/maxNegControlEnrichment');
  const bindingSpecificitySpec = getColSpec('pl7.app/vdj/bindingSpecificity');
  const frequencySpec = getColSpec('pl7.app/vdj/frequency');

  if (!maxEnrichmentSpec || !maxNegControlEnrichmentSpec || !bindingSpecificitySpec || !frequencySpec)
    return undefined;

  const defaults: PredefinedGraphOption<'scatterplot'>[] = [
    {
      inputName: 'x',
      selectedSource: maxNegControlEnrichmentSpec,
    },
    {
      inputName: 'y',
      selectedSource: maxEnrichmentSpec,
    },
    {
      inputName: 'grouping',
      selectedSource: bindingSpecificitySpec,
    },
    {
      inputName: 'size',
      selectedSource: frequencySpec,
    },
    {
      inputName: 'tooltipContent',
      selectedSource: frequencySpec.axesSpec[0],
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

const dataColumnPredicate = (spec: PColumnSpec) =>
  inputElementAxis.value !== undefined
  && spec.axesSpec.length === 1
  && spec.axesSpec[0].name === inputElementAxis.value
  && spec.annotations?.['pl7.app/toPlot'] === 'true';

const metaColumnPredicate = (spec: PColumnSpec) =>
  inputElementAxis.value !== undefined
  && spec.axesSpec[0]?.name === inputElementAxis.value
  && !spec.annotations?.['pl7.app/trace']?.includes('clonotype-enrichment');
</script>

<template>
  <GraphMaker
    v-model="app.model.ui.scatterState"
    chartType="scatterplot"
    :data-state-key="app.model.args.abundanceRef"
    :p-frame="app.model.outputs.controlScatterPf"
    :default-options="defaultOptions"
    :dataColumnPredicate="dataColumnPredicate"
    :meta-column-predicate="metaColumnPredicate"
  />
</template>
