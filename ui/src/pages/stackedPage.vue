<script setup lang="ts">
// import type { GraphMakerProps, PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import { useApp } from '../app';
// import { computed } from 'vue';
// import type { PColumnIdAndSpec } from '@platforma-sdk/model';

const app = useApp();

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.stackedState" chartType="discrete"
    :p-frame="app.model.outputs.stackedPf"

  />
</template>
