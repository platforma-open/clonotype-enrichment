<script setup lang="ts">
import { plRefsEqual, type PlRef } from '@platforma-sdk/model';
import { PlDropdown, PlDropdownMulti, PlDropdownRef, PlMaskIcon16, PlSlideModal } from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';
import { useApp } from '../app';
import DownsamplingCard from './DownsamplingCard.vue';
import './metrics-manager.scss';

const app = useApp();

function setInput(inputRef?: PlRef) {
  app.model.args.abundanceRef = inputRef;
  if (inputRef) {
    const abundanceLabel = app.model.outputs.abundanceOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (abundanceLabel)
      app.model.ui.title = 'Clonotype enrichment - ' + abundanceLabel;
  }
}

// Get list of available values within round column
// we will select them in list, being the first one denominator and rest numerators
const conditionValues = computed(() => {
  return app.model.outputs.conditionValues?.map((v) => ({
    value: v,
    label: v,
  }));
});

const settingsAreShown = defineModel<boolean>({ required: true });

const openState = reactive<Record<number, boolean>>({});

const toggleExpandMetric = () => {
  if (!openState[0]) openState[0] = true;
  else delete openState[0];
};

</script>

<template>
  <PlSlideModal v-model="settingsAreShown">
    <template #title>Settings</template>
    <PlDropdownRef
      v-model="app.model.args.abundanceRef" :options="app.model.outputs.abundanceOptions"
      label="Select abundance" clearable
      @update:model-value="setInput"
    />
    <PlDropdown v-model="app.model.args.conditionColumnRef" :options="app.model.outputs.metadataOptions" label="Condition column" />
    <PlDropdownMulti v-model="app.model.args.conditionOrder" :options="conditionValues" label="Condition order" >
      <template #tooltip>
        Order aware selection. Calculate contrast between an element (numerator) and each of its preceding elements (denominators).
        Example: if you select "Cond 1", "Cond 2" and "Cond 3" as order, the contrasts will be "Cond 2 vs Cond 1", "Cond 3 vs Cond 1" and "Cond 3 vs Cond 2".
        The block will export the highest Enrichment value from all comparisons
      </template>
    </PlDropdownMulti>

    <div class="metrics-manager d-flex flex-column gap-6">
      <div
        v-for="(entry, index) in app.model.args.metric"
        :key="index"
        :class="{ open: openState[index] ?? false }"
        class="metrics-manager__metric"
      >
        <div
          class="metrics-manager__header d-flex align-center gap-8"
          @click="toggleExpandMetric()"
        >
          <div class="metrics-manager__expand-icon">
            <PlMaskIcon16 name="chevron-right" />
          </div>

          <div class="metrics-manager__title flex-grow-1 text-s-btn">
            {{ 'Downsampling strategy' }}
          </div>
        </div>

        <div class="metrics-manager__content d-flex gap-24 p-24 flex-column">
          <DownsamplingCard
            v-model="app.model.args.metric[0]"
          />
        </div>
      </div>
    </div>
  </PlSlideModal>
</template>
