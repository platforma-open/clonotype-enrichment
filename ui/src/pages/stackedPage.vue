<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { useApp } from '../app';
// import { computed } from 'vue';
// import type { PColumnIdAndSpec } from '@platforma-sdk/model';

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
      name: 'pl7.app/vdj/clonotypeKey',
      type: 'String',
    },
  },
  {
    inputName: 'y',
    selectedSource: {
      kind: 'PColumn',
      name: 'pl7.app/vdj/frequency',
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
    v-model="app.model.ui.stackedState" chartType="discrete"
    :p-frame="app.model.outputs.stackedPf"
    :default-options="defaultOptions"
  />
</template>
