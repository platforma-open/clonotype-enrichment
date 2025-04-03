<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { useApp } from '../app';

const app = useApp();

const defaultOptions: PredefinedGraphOption<'discrete'>[] = [
  // first axis as x label (not possible yet)
  {
    inputName: 'primaryGrouping',
    selectedSource: {
      type: 'String',
      name: 'pl7.app/vdj/round',
    },
  },
  {
    inputName: 'secondaryGrouping',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/temporarylabel',
      valueType: 'String',
      axesSpec: [
        {
          name: 'pl7.app/vdj/round',
          type: 'String',
        },
        {
          name: 'pl7.app/vdj/clonotypeKey',
          type: 'String',
        },
      ],
    },
  },
  {
    inputName: 'y',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/enrichment',
      valueType: 'Double',
      axesSpec: [
        {
          name: 'pl7.app/vdj/round',
          type: 'String',
        },
        {
          name: 'pl7.app/vdj/clonotypeKey',
          type: 'String',
        },
      ],
    },
  },
];

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.lineState" chartType="discrete"
    :p-frame="app.model.outputs.bubblePf"
    :default-options="defaultOptions"
  />
</template>
