<script setup lang="ts">
import type { Metric } from '@platforma-open/milaboratories.clonotype-enrichment.model';
import type { ListOption } from '@platforma-sdk/ui-vue';
import { PlBtnGroup, PlDropdown, PlNumberField } from '@platforma-sdk/ui-vue';
import './metrics-manager.scss';
import { metricTypeOptions } from './util';

const downsamplingOptions: ListOption<string | undefined>[] = [
  { label: 'None', value: 'none' },
  { label: 'Top N', value: 'top' },
  { label: 'Cumulative Top', value: 'cumtop' },
  { label: 'Random Sampling', value: 'hypergeometric' },
];

const props = defineModel<Metric>({ default: {
  type: undefined,
  downsampling: {
    type: 'none',
  },
} });

</script>

<template>
  <div class="d-flex flex-column gap-24">
    <PlDropdown
      v-model="props.type" :options="metricTypeOptions"
      label="Type"
      required
    />

    <PlDropdown
      v-model="props.downsampling.type" :options="downsamplingOptions"
      label="Downsampling"
      required
    />

    <PlNumberField
      v-if="props.downsampling.type === 'cumtop'"
      v-model="props.downsampling.n"
      label="Select % of the repertoire to include"
      :minValue="0"
      :maxValue="100"
      :step="1"
      required
    />

    <PlNumberField
      v-if="props.downsampling.type === 'top'"
      v-model="props.downsampling.n"
      label="Select Top N"
      :minValue="0"
      required
    />

    <PlBtnGroup
      v-if="props.downsampling.type === 'hypergeometric'"
      v-model="props.downsampling.valueChooser"
      :options="[
        { value: 'fixed', label: 'Fixed' },
        { value: 'min', label: 'Min', },
        { value: 'auto', label: 'Auto', },
      ]"
    />

    <PlNumberField
      v-if="props.downsampling.valueChooser === 'fixed'"
      v-model="props.downsampling.n"
      label="Select N"
      :minValue="0"
      required
    />
  </div>
</template>

<!-- @click="removeMetric(index)" -->
