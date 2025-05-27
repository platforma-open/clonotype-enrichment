<script setup lang="ts">
import { type PTableColumnSpec } from '@platforma-sdk/model';
import type {
  PlAgDataTableSettings,
} from '@platforma-sdk/ui-vue';
import {
  PlAgDataTableToolsPanel,
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlMaskIcon24,
  PlTableFilters,
} from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';
import SettingsModal from './SettingsModal.vue';

const app = useApp();

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

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};

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
    <PlAgDataTableV2
      ref="tableInstance"
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Block is not started"
      show-columns-panel
      show-export-button
      @columns-changed="(newColumns) => (columns = newColumns)"
    />
  </PlBlockPage>

  <SettingsModal v-model="settingsAreShown" />
</template>
