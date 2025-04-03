<script setup lang="ts">
import type {
  PlDataTableSettings } from '@platforma-sdk/ui-vue';
import {
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
import { useApp } from '../app';
import { computed, ref } from 'vue';
import type { PTableColumnSpec } from '@platforma-sdk/model';

const app = useApp();

/** UI state upgrader */ (() => {
  if ('filtersOpen' in app.model.ui) delete app.model.ui.filtersOpen;
  if (app.model.ui.filterModel === undefined) app.model.ui.filterModel = {};
})();

const tableSettings = computed<PlDataTableSettings>(() => ({
  sourceType: 'ptable',
  pTable: app.model.outputs.pt,
}));

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};

// Allowed options for contrast Factor (metadata columns)
const roundColumnOptions = computed(() => {
  return app.model.outputs.metadataOptions?.map((v) => ({
    value: v.ref,
    label: v.label,
  })) ?? [];
});

// Get list of availables values within round column
// we will select them in list, being the first one denominator and rest numerators
const roundOptions = computed(() => {
  return app.model.outputs.roundOptions?.map((v) => ({
    value: v,
    label: v,
  }));
});

const columns = ref<PTableColumnSpec[]>([]);
</script>

<template>
  <PlBlockPage>
    <template #title>Clonotype Enrichment</template>
    <template #append>
      <!-- {{ app.model.args.roundOrder }} -->
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
        v-model="app.model.args.countsRef" :options="app.model.outputs.countsOptions"
        label="Select dataset"
      />
      <PlDropdown v-model="app.model.args.roundColumn" :options="roundColumnOptions" label="Round column" />
      <PlDropdownMulti v-model="app.model.args.roundOrder" :options="roundOptions" label="Round order" >
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
    </PlSlideModal>
  </PlBlockPage>
</template>
