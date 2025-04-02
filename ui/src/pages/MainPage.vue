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
  PlSlideModal,
} from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import { computed, ref } from 'vue';

const app = useApp();

const tableSettings = computed<PlDataTableSettings>(() => ({
  sourceType: 'ptable',
  pTable: app.model.outputs.pt,
}));

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};

// Allowed options for contrast Factor (metadata columns)
const contrastFactorOptions = computed(() => {
  return app.model.outputs.metadataOptions?.map((v) => ({
    value: v.ref,
    label: v.label,
  })) ?? [];
});

// Get list of availables values within contras Factor
// we will select them in list, being the first one denominator and rest numerators
const numeratorOptions = computed(() => {
  return app.model.outputs.numeratorOptions?.map((v) => ({
    value: v,
    label: v,
  }));
});

</script>

<template>
  <PlBlockPage>
    <template #title>Clonotype Enrichment</template>
    <template #append>
      {{ app.model.args.numerators }}
      <!-- PlAgDataTableToolsPanel controls showing  Export column and filter-->
      <PlAgDataTableToolsPanel/>
      <PlBtnGhost @click.stop="showSettings">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>
    <PlAgDataTable
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      show-columns-panel
      show-export-button
    />
    <PlSlideModal v-model="settingsAreShown">
      <template #title>Settings</template>
      <PlDropdownRef
        v-model="app.model.args.countsRef" :options="app.model.outputs.countsOptions"
        label="Select dataset"
      />
      <PlDropdown v-model="app.model.args.contrastFactor" :options="contrastFactorOptions" label="Contrast factor" />
      <PlDropdownMulti v-model="app.model.args.numerators" :options="numeratorOptions" label="Numerator" >
        <template #tooltip>
          Order aware selection. Calculate a contrast between first element (denominator) and each of the other selected options (numerators).
        </template>
      </PlDropdownMulti>
    </PlSlideModal>
  </PlBlockPage>
</template>
