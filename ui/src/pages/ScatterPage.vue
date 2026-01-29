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
  ];
  return defaults;
});

const metaColumnPredicate = (spec: PColumnSpec) => {
  const isClustered = app.model.outputs.datasetSpec?.axesSpec !== undefined
    && app.model.outputs.datasetSpec.axesSpec.length >= 2
    && app.model.outputs.datasetSpec.axesSpec[1].name === 'pl7.app/vdj/clusterId';
  if (isClustered) {
    return spec.axesSpec[0]?.name !== 'pl7.app/vdj/clonotypeKey';
  } else {
    return spec.axesSpec[0]?.name === 'pl7.app/vdj/clonotypeKey';
  }
};

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.scatterState"
    chartType="scatterplot"
    :data-state-key="app.model.args.abundanceRef"
    :p-frame="app.model.outputs.controlScatterPf"
    :default-options="defaultOptions"
    :dataColumnPredicate="(spec: PColumnSpec) => spec.axesSpec.length === 1 && spec.axesSpec[0].name === 'pl7.app/vdj/clonotypeKey' && spec.annotations?.['pl7.app/toPlot'] === 'true'"
    :meta-column-predicate="metaColumnPredicate"
  />
</template>
