<script setup lang="ts">
import type { PlRef, PTableColumnSpec } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import type {
  ListOption,
  PlAgDataTableSettings,
} from '@platforma-sdk/ui-vue';
import {
  PlAgDataTableToolsPanel,
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlSlideModal,
  PlTableFilters,
} from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};

const columns = ref<PTableColumnSpec[]>([]);

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.args.abundanceRef = inputRef;
  if (inputRef) {
    const abundanceLabel = app.model.outputs.abundanceOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (abundanceLabel)
      app.model.ui.title = 'Clonotype enrichment - ' + abundanceLabel;
  }
}

const tableSettings = computed<PlAgDataTableSettings>(() => {
  const pTable = app.model.outputs.pt;
  if (pTable === undefined && !app.model.outputs.isRunning) {
    // special case: when block is not yet started at all (no table calculated)
    return undefined;
  }
  return {
    sourceType: 'ptable',
    model: pTable,
  };
});

const tableLoadingText = computed(() => {
  if (app.model.outputs.isRunning) {
    return 'Running';
  }
  return 'Loading';
});

// Get list of available values within round column
// we will select them in list, being the first one denominator and rest numerators
const conditionValues = computed(() => {
  return app.model.outputs.conditionValues?.map((v) => ({
    value: v,
    label: v,
  }));
});

// Downsampling options
const downsamplingOptions: ListOption<string | undefined>[] = [
  { label: 'None', value: 'none' },
  { label: 'Top N', value: 'top' },
  { label: 'Cumulative Top', value: 'cumtop' },
  { label: 'Random Sampling', value: 'hypergeometric' },
];

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
    <template #append>
      <!-- PlAgDataTableToolsPanel controls showing  Export column and filter-->
      <PlAgDataTableToolsPanel>
        <PlTableFilters v-model="app.model.ui.filterModel" :columns="columns" />
      </PlAgDataTableToolsPanel>
      <PlBtnGhost @click.stop="showSettings">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Block is not started"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    />
  </PlBlockPage>

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

    <PlDropdown
      v-model="app.model.args.downsampling.type" :options="downsamplingOptions"
      label="Downsampling"
      required
    >
      <template #tooltip>
        Select Downsampling strategy
      </template>
    </PlDropdown>

    <PlNumberField
      v-if="app.model.args.downsampling.type === 'cumtop'"
      v-model="app.model.args.downsampling.n"
      label="Select % of the repertoire to include"
      :minValue="0"
      :maxValue="100"
      :step="1"
      required
    />

    <PlNumberField
      v-if="app.model.args.downsampling.type === 'top'"
      v-model="app.model.args.downsampling.n"
      label="Select Top N"
      :minValue="0"
      required
    />

    <PlBtnGroup
      v-if="app.model.args.downsampling.type === 'hypergeometric'"
      v-model="app.model.args.downsampling.valueChooser"
      :options="[
        { value: 'fixed', label: 'Fixed' },
        { value: 'min', label: 'Min', },
        { value: 'auto', label: 'Auto', },
      ]"
    />

    <PlNumberField
      v-if="app.model.args.downsampling.valueChooser === 'fixed'
        && app.model.args.downsampling.type === 'hypergeometric'"
      v-model="app.model.args.downsampling.n"
      label="Select N"
      :minValue="0"
      required
    />
  </PlSlideModal>
</template>
