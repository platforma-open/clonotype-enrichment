<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import type {
  ListOption,
} from '@platforma-sdk/ui-vue';
import {
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlDialogModal,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};
const statsOpen = ref(false);

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.args.abundanceRef = inputRef;
  if (inputRef) {
    const abundanceLabel = app.model.outputs.abundanceOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (abundanceLabel)
      app.model.ui.title = 'Clonotype enrichment - ' + abundanceLabel;
  }
}

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pt,
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
  { label: 'Random Sampling', value: 'hypergeometric' },
];

// Function to create statistics table HTML
const createStatsTable = () => {
  const stats = [
    { label: 'Minimum enrichment', value: app.model.outputs.enrichmentStats?.minValue || '' },
    { label: 'Maximum enrichment', value: app.model.outputs.enrichmentStats?.maxValue || '' },
    { label: 'Mean enrichment', value: app.model.outputs.enrichmentStats?.meanValue || '' },
    { label: 'Median enrichment', value: app.model.outputs.enrichmentStats?.medianValue || '' },
    { label: 'Enrichment score cutoff', value: app.model.outputs.enrichmentStats?.cutoffValue || '' },
  ];

  const rows = stats.map((stat) =>
    `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111;">${stat.label}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${stat.value}</td>
    </tr>`,
  ).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 0;">
      <thead>
        <tr style="background-color: #f9fafb;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; color: #111; font-weight: 600;">Statistic</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb; color: #111; font-weight: 600;">Value</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="() => (statsOpen = true)">
        Stats
        <template #append>
          <PlMaskIcon24 name="statistics" />
        </template>
      </PlBtnGhost>
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
      not-ready-text="Data is not computed"
    />
  </PlBlockPage>

  <PlSlideModal v-model="settingsAreShown">
    <template #title>Settings</template>
    <PlDropdownRef
      v-model="app.model.args.abundanceRef" :options="app.model.outputs.abundanceOptions"
      label="Select abundance" clearable required
      @update:model-value="setInput"
    />
    <PlDropdown v-model="app.model.args.conditionColumnRef" :options="app.model.outputs.metadataOptions" label="Condition column" required />
    <PlDropdownMulti v-model="app.model.args.conditionOrder" :options="conditionValues" label="Condition order" required >
      <template #tooltip>
        Order aware selection. Calculate contrast between an element (numerator) and each of its preceding elements (denominators).
        Example: if you select "Cond 1", "Cond 2" and "Cond 3" as order, the contrasts will be "Cond 2 vs Cond 1", "Cond 3 vs Cond 1" and "Cond 3 vs Cond 2".
        The block will export the highest Enrichment value from all comparisons
      </template>
    </PlDropdownMulti>

    <PlBtnGroup
      v-model="app.model.args.downsampling.type" :options="downsamplingOptions"
      label="Downsampling" :compact="true"
    >
      <template #tooltip>
        Select Downsampling strategy (count-based)
      </template>
    </PlBtnGroup>

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
      v-if="app.model.args.downsampling.type === 'hypergeometric'
        && app.model.args.downsampling.valueChooser === 'fixed'"
      v-model="app.model.args.downsampling.n"
      label="Select N"
      :minValue="0"
      required
    />

    <PlBtnGroup
      v-model="app.model.args.filteringMode"
      :options="[
        { value: 'none', label: 'All clonotypes' },
        { value: 'single-sample', label: 'Shared clonotypes' },
      ]"
      label="Clonotype filtering"
    >
      <template #tooltip>
        <div>
          <strong>Clonotype filtering strategy:</strong><br/>
          <strong>All clonotypes:</strong> Analyze all clonotypes, including those specific to individual conditions (may include rare or condition-specific responses)<br/>
          <strong>Shared clonotypes:</strong> Focus on clonotypes present in multiple conditions (excludes condition-specific clonotypes that may represent noise or rare events)
        </div>
      </template>
    </PlBtnGroup>
  </PlSlideModal>
  <!-- Slide window with computed variables -->
  <PlDialogModal
    v-model="statsOpen"
    :width="`448px`"
    :close-on-outside-click="true"
    :actions-has-top-border="true"
  >
    <template #title>
      <div>
        <div>Enrichment statistics</div>
        <div style="color: #6b7280; font-size: 14px; margin-top: 4px; line-height: 1.2; margin-bottom: 0;">
          Derived from each clonotype's highest enrichment value among all comparisons
        </div>
      </div>
    </template>
    <div style="margin-top: 0px;" v-html="createStatsTable()"/>
  </PlDialogModal>
</template>
