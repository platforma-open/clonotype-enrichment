<script setup lang="ts">
import { plRefsEqual, type PlRef, type PTableColumnSpec } from '@platforma-sdk/model';
import type {
  PlDataTableSettings,
} from '@platforma-sdk/ui-vue';
import {
  PlAccordionSection,
  PlAgDataTable,
  PlAgDataTableToolsPanel,
  PlBlockPage,
  PlBtnGhost,
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

function setInput(inputRef?: PlRef) {
  app.model.args.abundanceRef = inputRef;
  if (inputRef) {
    const abundanceLabel = app.model.outputs.abundanceOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (abundanceLabel)
      app.model.ui.title = 'Clonotype enrichment - ' + abundanceLabel;
  }
}

const tableSettings = computed<PlDataTableSettings | undefined>(() => {
  const pTable = app.model.outputs.pt;
  if (pTable === undefined) {
    // when table is not yet calculated
    if (app.model.outputs.isRunning) {
      // @TODO: proper "running" message
      return undefined;
    } else {
      // @TODO: proper "not calculated" message
      return undefined;
    }
  }
  return {
    sourceType: 'ptable',
    pTable: app.model.outputs.pt,
  };
});

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};

// Get list of availables values within round column
// we will select them in list, being the first one denominator and rest numerators
const conditionValues = computed(() => {
  return app.model.outputs.conditionValues?.map((v) => ({
    value: v,
    label: v,
  }));
});

const columns = ref<PTableColumnSpec[]>([]);
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
    <PlAgDataTable
      ref="tableInstance"
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    />
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
          Order aware selection. Calculate a contrast between first element (denominator) and each of the other selected options (numerators).
        </template>
      </PlDropdownMulti>
      <PlNumberField
        v-model="app.model.args.enrichmentThreshold"
        label="Enrichment threshold" :minValue="1" :step="0.1"
      >
        <template #tooltip>
          Select enrichment threshold to consider a clonotype enriched.
        </template>
      </PlNumberField>
      <!-- Content hidden until you click -->
      <PlAccordionSection label="ADVANCED SETTINGS">
        <PlDropdown v-model="app.model.args.conditionExport" :options="conditionValues" label="Stored condition column" >
          <template #tooltip>
            Select the round for exporting clonotype enrichment or frequency values. The last round is selected by default.
          </template>
        </PlDropdown>
      </PlAccordionSection>
    </PlSlideModal>
  </PlBlockPage>
</template>
