<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { getRawPlatformaInstance } from '@platforma-sdk/model';
import type {
  ListOption,
} from '@platforma-sdk/ui-vue';
import {
  computedCached,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlCheckbox,
  PlDialogModal,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlElementList,
  PlMaskIcon24,
  PlNumberField,
  PlRadioGroup,
  PlRow,
  PlSlideModal,
  PlTooltip,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { asyncComputed } from '@vueuse/core';
import { computed, ref, watch, watchEffect } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};
const statsOpen = ref(false);

const mapToOptions = (values?: string[]) => values?.map((v) => ({ value: v, label: v })) ?? [];

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.args.abundanceRef = inputRef;
}

// updating defaultBlockLabel
watchEffect(() => {
  const conditionOrder = app.model.args.conditionOrder;
  const clonotypeDefinition = app.model.args.clonotypeDefinition;
  const sequenceColumnOptions = app.model.outputs.sequenceColumnOptions;
  const baseFilter = app.model.args.FilteringConfig.baseFilter;

  let label = '';

  // Add clonotype definition prefix if selected
  if (clonotypeDefinition && clonotypeDefinition.length > 0 && sequenceColumnOptions) {
    const clonotypeLabels = clonotypeDefinition
      .map((colId) => {
        const option = sequenceColumnOptions.find((opt) => opt.value === colId);
        return option?.label;
      })
      .filter((label) => label !== undefined);

    if (clonotypeLabels.length > 0) {
      label = clonotypeLabels.join('-');
    }
  }

  // Add condition order
  if (conditionOrder && conditionOrder.length > 0) {
    const conditionLabel = conditionOrder.join('-');
    label = label ? `${label}, ${conditionLabel}` : conditionLabel;
  }

  // Add filtering mode at the end
  if (baseFilter) {
    const filteringLabel = baseFilter === 'none' ? 'No filtering' : (baseFilter === 'shared' ? 'Shared (all rounds)' : 'Multiple rounds');
    label = label ? `${label}, ${filteringLabel}` : filteringLabel;
  }

  app.model.args.defaultBlockLabel = label;
});

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
const conditionValues = computed(() => mapToOptions(app.model.outputs.conditionValues));

const conditionOrderOptions = computed(() => mapToOptions(app.model.args.conditionOrder));

// Get list of available values within antigen column for target selection
const antigenValues = computed(() => mapToOptions(app.model.outputs.antigenValues));

// Get list of available values within antigen column (no selected as target) for negative control selection
const negativeAntigenValues = computed(() => {
  const targetCondition = new Set(app.model.args.controlConfig.targetCondition);
  const filtered = app.model.outputs.antigenValues?.filter((v) => !targetCondition.has(v));
  return mapToOptions(filtered);
});

// Check if there are condition values for negative control samples that are not in the main condition order
// const hasExtraNegativeControlConditions = computed(() => {
//   const negValues = app.model.outputs.negativeControlConditionValues;
//   const order = app.model.args.conditionOrder;
//   if (!negValues?.length || !order) return false;

//   // Check if any negative control condition is NOT in the main condition order
//   const orderSet = new Set(order);
//   return negValues.some((v) => !orderSet.has(v));
// });

// Get condition values from samples that have negative antigen values
const negativeControlConditionOptions = computed(() => mapToOptions(app.model.outputs.negativeControlConditionValues));

// Generate comparison options based on condition order
// Creates all possible numerator-denominator pairs where numerator comes after denominator
const comparisonOptions = computed(() => {
  const conditionOrder = app.model.args.conditionOrder;
  if (!conditionOrder || conditionOrder.length < 2) return [];

  const comparisons = [];
  for (let num_i = 1; num_i < conditionOrder.length; num_i++) {
    for (let den_j = 0; den_j < num_i; den_j++) {
      const numerator = conditionOrder[num_i];
      const denominator = conditionOrder[den_j];
      const comparisonName = `${numerator} vs ${denominator}`;
      comparisons.push({
        value: comparisonName,
        label: comparisonName,
      });
    }
  }
  return comparisons;
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

// Check if the output enrichment file is empty
const isEmpty = asyncComputed(async () => {
  if (!app.model.outputs.pt.ok || !app.model.outputs.pt.value) return undefined;
  return (await getRawPlatformaInstance().pFrameDriver.getShape(app.model.outputs.pt.value.fullTableHandle)).rows === 0;
});

// Check if the filters removed too many clonotypes
const filteredTooMuch = asyncComputed(async () => {
  if (app.model.outputs.filteredTooMuch === true) return true;
});

// Sync conditionOrder when values change OR column changes
watch(
  [() => app.model.args.conditionColumnRef, () => app.model.outputs.conditionValues],
  ([col, vals], [oldCol]) => {
    if (vals && vals.length > 0 && (col !== oldCol || app.model.args.conditionOrder.length === 0)) {
      app.model.args.conditionOrder = [...vals];
    }
  },
  { immediate: true },
);

// Sync controlConditionsOrder when values change OR antigen column changes
watch(
  [() => app.model.args.controlConfig.antigenColumnRef, () => app.model.outputs.negativeControlConditionValues],
  ([col, vals], [oldCol]) => {
    if (vals && vals.length > 0 && (col !== oldCol || app.model.args.controlConfig.controlConditionsOrder.length === 0)) {
      app.model.args.controlConfig.controlConditionsOrder = [...vals];
    }
  },
  { immediate: true },
);

const availableToAdd = computed(() => {
  const current = new Set(app.model.args.conditionOrder);
  return conditionValues.value.filter((opt) => !current.has(opt.value));
});

const availableToAddToControl = computed(() => {
  const current = new Set(app.model.args.controlConfig.controlConditionsOrder);
  return negativeControlConditionOptions.value.filter((opt) => !current.has(opt.value));
});

const resetConditionOrder = () => {
  if (app.model.outputs.conditionValues) {
    app.model.args.conditionOrder = [...app.model.outputs.conditionValues];
  }
};

const resetControlConditionOrder = () => {
  if (app.model.outputs.negativeControlConditionValues) {
    app.model.args.controlConfig.controlConditionsOrder = [...app.model.outputs.negativeControlConditionValues];
  }
};

const isClusterId = computed(() => {
  if (app.model.outputs.datasetSpec === undefined) return false;
  return app.model.outputs.datasetSpec?.axesSpec.length >= 1 && app.model.outputs.datasetSpec?.axesSpec[1]?.name === 'pl7.app/vdj/clusterId';
});

// Track the dataset spec
const datasetSpec = computedCached(() => app.model.outputs.datasetSpec);

// Watch for changes in the dataset spec to initialize defaults
watchEffect(() => {
  const spec = datasetSpec.value;
  if (!spec?.axesSpec) return;
  const isClust = spec.axesSpec.length >= 1 && spec.axesSpec[1]?.name === 'pl7.app/vdj/clusterId';
  if (isClust) {
    app.model.args.FilteringConfig.baseFilter = 'shared';
    app.model.args.FilteringConfig.minAbundance.enabled = false;
  } else {
    app.model.args.FilteringConfig.baseFilter = 'none';
    app.model.args.FilteringConfig.minAbundance.enabled = true;
  }
});

// Filtering options
const filteringOptions = [
  { value: 'none', label: 'No filtering' },
  { value: 'shared', label: 'Shared (all rounds)' },
  { value: 'single-sample', label: 'Multiple rounds' },
];
</script>

<template>
  <PlBlockPage
    v-model:subtitle="app.model.args.customBlockLabel"
    :subtitle-placeholder="app.model.args.defaultBlockLabel"
    title="Clonotype Enrichment"
  >
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
    <PlAlert v-if="isEmpty === true && filteredTooMuch !== true" type="warn" icon>
      <template #title>Empty dataset selection</template>
      The input dataset you have selected is empty or has too few clonotypes.
      Please choose a different dataset.
    </PlAlert>
    <PlAlert v-if="filteredTooMuch === true" type="warn" icon>
      <template #title>Too few clonotypes</template>
      Current filters removed all clonotypes. Consider relaxing filter criteria.
    </PlAlert>
    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Data is not computed"
      show-export-button
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

    <PlAccordionSection label="Condition Order">
      <div style="display: flex; margin-bottom: -15px;">
        Define condition order
        <PlTooltip class="info">
          <template #label>Define condition order</template>
          <template #tooltip>
            <div>
              <strong>Order aware selection:</strong> Calculates contrast between an element (numerator) and each of its preceding elements (denominators).
              <br/><br/>
              <strong>Example:</strong> If you select "Cond 1", "Cond 2" and "Cond 3", the contrasts will be:
              <ul>
                <li>Cond 2 vs Cond 1</li>
                <li>Cond 3 vs Cond 1</li>
                <li>Cond 3 vs Cond 2</li>
              </ul>
              The block will export the highest Enrichment value from all comparisons.
            </div>
          </template>
        </PlTooltip>
      </div>
      <PlElementList
        v-model:items="app.model.args.conditionOrder"
      >
        <template #item-title="{ item }">
          {{ item }}
        </template>
      </PlElementList>
      <PlBtnGhost
        v-if="availableToAdd.length > 0"
        @click="resetConditionOrder"
      >
        Reset to default
        <template #append>
          <PlMaskIcon24 name="reverse" />
        </template>
      </PlBtnGhost>
    </PlAccordionSection>

    <PlAccordionSection label="Target antigen & negative controls">
      <PlCheckbox v-model="app.model.args.controlConfig.enabled">
        Enable target selection & negative controls
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Enable negative control analysis to distinguish antigen-specific binders from background binders.
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlDropdown
        v-if="app.model.args.controlConfig.enabled"
        v-model="app.model.args.controlConfig.antigenColumnRef"
        :options="app.model.outputs.metadataOptions"
        label="Antigen column" required
      />
      <PlRow v-if="app.model.args.controlConfig.enabled">
        <PlDropdown
          v-model="app.model.args.controlConfig.targetCondition"
          :options="antigenValues"
          label="Target"
        />
        <PlDropdownMulti
          v-model="app.model.args.controlConfig.negativeConditions"
          :options="negativeAntigenValues"
          label="Negative control(s)"
        />
      </PlRow>
      <PlAccordionSection v-if="app.model.args.controlConfig.enabled" label="Negative Condition Order">
        <div style="display: flex; margin-bottom: -15px;">
          Define negative condition order
          <PlTooltip class="info">
            <template #label>Define condition order</template>
            <template #tooltip>
              <div>
                <strong>Order aware selection:</strong> Calculates contrast between an element (numerator) and each of its preceding elements (denominators).
                <br/><br/>
                <strong>Example:</strong> If you select "Cond 1", "Cond 2" and "Cond 3", the contrasts will be:
                <ul>
                  <li>Cond 2 vs Cond 1</li>
                  <li>Cond 3 vs Cond 1</li>
                  <li>Cond 3 vs Cond 2</li>
                </ul>
              </div>
            </template>
          </PlTooltip>
        </div>
        <PlElementList
          v-model:items="app.model.args.controlConfig.controlConditionsOrder"
        >
          <template #item-title="{ item }">
            {{ item }}
          </template>
        </PlElementList>
        <PlBtnGhost
          v-if="availableToAddToControl.length > 0"
          @click="resetControlConditionOrder"
        >
          Reset to default
          <template #append>
            <PlMaskIcon24 name="reverse" />
          </template>
        </PlBtnGhost>
      </PlAccordionSection>
      <PlRow v-if="app.model.args.controlConfig.enabled">
        <PlNumberField
          v-model="app.model.args.controlConfig.targetThreshold"
          label="Target threshold"
          :minValue="0"
          :step="0.1"
          placeholder="2.0"
        />
        <PlNumberField
          v-model="app.model.args.controlConfig.controlThreshold"
          label="Control threshold"
          :minValue="0"
          :step="0.1"
          placeholder="1.0"
        />
      </PlRow>
      <div v-if="app.model.args.controlConfig.enabled" style="height: 1px; background-color: #e2e2e2; margin: 16px 0;" />
    </PlAccordionSection>

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

    <PlAccordionSection label="Filtering Options">
      <PlRadioGroup
        v-model="app.model.args.FilteringConfig.baseFilter"
        :options="filteringOptions"
      >
        <template #label>
          Clonotype Filtering
          <PlTooltip class="info" :style="{display: 'inline-block'}">
            <template #tooltip>
              <strong>Clonotype filtering strategy:</strong><br/>
              <strong>No filtering:</strong> Analyze all clonotypes, including those specific to individual conditions (may include rare or condition-specific responses)<br/><br/>
              <strong>Shared (all rounds):</strong> Focus only on clonotypes present in all rounds<br/><br/>
              <strong>Multiple rounds:</strong> Focus on clonotypes present in more than one condition (excludes condition-specific clonotypes that may represent noise or rare events)
            </template>
          </PlTooltip>
        </template>
      </PlRadioGroup>
      <PlCheckbox v-model="app.model.args.FilteringConfig.minAbundance.enabled">
        Abundance Filtering
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Remove clonotypes below a specific threshold based on their maximum abundance across all conditions. Filters sampling noise in display campaigns<br/><br/>
              <strong>Counts:</strong> Filter by raw number of reads (e.g., 100).<br/>
              <strong>Frequency:</strong> Filter by fraction of reads aggregated across same condition samples (0 to 1.0).<br/><br/>
              For <em>in vivo</em> studies with lower sequencing depth, consider lower values (10-50 counts).
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlRow v-if="app.model.args.FilteringConfig.minAbundance.enabled">
        <PlNumberField
          v-if="app.model.args.FilteringConfig.minAbundance.metric === 'count'"
          v-model="app.model.args.FilteringConfig.minAbundance.threshold"
          label="Minimum abundance"
          :minValue="0"
          :step="1"
          placeholder="100"
        />
        <PlNumberField
          v-if="app.model.args.FilteringConfig.minAbundance.metric === 'frequency'"
          v-model="app.model.args.FilteringConfig.minAbundance.threshold"
          label="Minimum abundance"
          :minValue="0"
          :maxValue="1"
          :step="0.01"
          placeholder="0.1"
        />
        <PlDropdown
          v-model="app.model.args.FilteringConfig.minAbundance.metric"
          :options="[{ value: 'count', label: 'Counts' },
                     { value: 'frequency', label: 'Frequency' }]"
          label="Metric"
        />
      </PlRow>
      <PlCheckbox v-model="app.model.args.FilteringConfig.presentInRounds.enabled">
        In-round Presence Filtering
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Keep only clonotypes based on their presence in selected conditions.<br/><br/>
              <strong>Any selected (OR):</strong> Keeps clonotypes present in at least one of the selected rounds.<br/>
              <strong>All selected (AND):</strong> Keeps only clonotypes present in all of the selected rounds.<br/><br/>
              Useful to focus on clonotypes that reached later selection rounds.
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlRow v-if="app.model.args.FilteringConfig.presentInRounds.enabled">
        <PlDropdownMulti
          v-model="app.model.args.FilteringConfig.presentInRounds.rounds"
          label="Conditions"
          :options="conditionOrderOptions"
        />
        <PlDropdown
          v-model="app.model.args.FilteringConfig.presentInRounds.logic"
          :options="[{ value: 'OR', label: 'Any selected (OR)' },
                     { value: 'AND', label: 'All selected (AND)' }]"
          label="Logic"
        />
      </PlRow>
    </PlAccordionSection>

    <PlAccordionSection label="Advanced Settings">
      <PlNumberField
        v-model="app.model.args.pseudoCount"
        label="Pseudo-count"
        :minValue="0"
        :step="1"
        placeholder="100"
      >
        <template #tooltip>
          (Default: 100) Represents detection threshold for display campaigns. For <em>in vivo</em> studies, consider lower values (10-50).
        </template>
      </PlNumberField>
      <PlDropdownMulti
        v-if="!isClusterId"
        v-model="app.model.args.clonotypeDefinition"
        :options="app.model.outputs.sequenceColumnOptions"
        label="Clonotype definition"
      >
        <template #tooltip>
          Select columns that define a clonotype. By default, it's a nucletotide sequence of the clonotype.
          Here you can override this behavior and calculate enrichment score based on e.g. amino acid sequence of CDR3.
        </template>
      </PlDropdownMulti>

      <PlDropdownMulti
        v-model="app.model.args.additionalEnrichmentExports"
        :options="comparisonOptions"
        label="Export specific comparisons"
      >
        <template #tooltip>
          <div>
            <strong>Export Specific Enrichment Comparisons</strong><br/><br/>
            By default, the highest enrichment value across all comparisons is exported.
            <br/><br/>
            This option allows you to select additional comparisons (e.g., "Treatment vs. Control") to be exported as separate columns. This is useful for downstream analysis where scores from specific comparisons are needed.
          </div>
        </template>
      </PlDropdownMulti>
    </PlAccordionSection>
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
