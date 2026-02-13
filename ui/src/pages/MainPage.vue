<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { getRawPlatformaInstance, getSingleColumnData, type PObjectId } from '@platforma-sdk/model';
import type {
  ListOption,
} from '@platforma-sdk/ui-vue';
import {
  PlAccordion,
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
  useWatchFetch,
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

  // Add target antigen if defined
  const antigenControlConfig = app.model.args.antigenControlConfig;
  if (antigenControlConfig.targetAntigen && antigenControlConfig.antigenEnabled) {
    label = label ? `${label}, ${antigenControlConfig.targetAntigen}` : antigenControlConfig.targetAntigen;
  }

  // Add filtering mode at the end
  if (baseFilter) {
    const filteringLabel = baseFilter === 'none' ? 'No filtering' : (baseFilter === 'shared' ? 'Shared (all conditions)' : 'Multiple conditions');
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

type MetadataFetched = {
  conditionValues: string[];
  conditionBySample?: Record<string, string>;
  antigenBySample?: Record<string, string>;
};

/** Fetch metadata column data once from the pframe and derive all metadata-derived lists. Filter by sampleIds when available so only samples in the abundance input are used. */
const metadataFetched = useWatchFetch(
  () => ({
    pframe: app.model.outputs.metadataColumnsPframe,
    columnIds: app.model.outputs.metadataColumnIds,
    sampleIds: app.model.outputs.sampleIds as string[] | undefined,
  }),
  async ({ pframe: pframeHandle, columnIds, sampleIds }) => {
    if (!pframeHandle || !columnIds?.conditionColId) return undefined;

    // Helper to extract data mapped by sample ID
    const buildBySample = (colData: { axesData: Record<string, (string | number | null)[]>; data: (string | number | null)[] }) => {
      const axisKeys = Object.keys(colData.axesData);
      if (!axisKeys.length) return {};
      const sampleKey = axisKeys[0];
      const out: Record<string, string> = {};
      for (let i = 0; i < colData.data.length; i++) {
        const sampleId = colData.axesData[sampleKey]?.[i];
        const val = colData.data[i];
        if (sampleId != null && val != null) out[String(sampleId)] = String(val);
      }
      return out;
    };

    // Always fetch condition column full data (sample id → value) for conditionBySample
    const conditionColData = await getSingleColumnData(pframeHandle, columnIds.conditionColId as PObjectId);
    let conditionBySample = buildBySample(conditionColData);

    let antigenBySample: Record<string, string> | undefined;
    if (columnIds.antigenColId) {
      const antigenColData = await getSingleColumnData(pframeHandle, columnIds.antigenColId as PObjectId);
      antigenBySample = buildBySample(antigenColData);
    }

    // Restrict to samples present in the abundance input (sampleIds from trace)
    if (sampleIds?.length) {
      const sampleIdSet = new Set(sampleIds);
      conditionBySample = Object.fromEntries(
        Object.entries(conditionBySample).filter(([id]) => sampleIdSet.has(id)),
      );
      if (antigenBySample) {
        antigenBySample = Object.fromEntries(
          Object.entries(antigenBySample).filter(([id]) => sampleIdSet.has(id)),
        );
      }
    }

    // Unique condition values from the (possibly filtered) condition map
    const conditionValues = [...new Set(Object.values(conditionBySample))].filter(Boolean).sort();

    return { conditionValues, conditionBySample, antigenBySample } satisfies MetadataFetched;
  },
);

/** Condition values valid for the main order: all in dataset or only those in samples for the selected target antigen. */
const effectiveConditionValues = computed(() => {
  const raw = metadataFetched.value;
  if (!raw?.conditionValues?.length) return [];
  if (!raw.conditionBySample || !raw.antigenBySample) return raw.conditionValues;
  const config = app.model.args.antigenControlConfig;
  if (!config?.antigenEnabled || !config.targetAntigen) return raw.conditionValues;
  // Restrict to conditions present in samples that have the selected target antigen
  const target = config.targetAntigen;
  const conditionsForTarget = new Set<string>();
  for (const [sampleId, antigenValue] of Object.entries(raw.antigenBySample)) {
    if (antigenValue === target) {
      const c = raw.conditionBySample[sampleId];
      if (c) conditionsForTarget.add(c);
    }
  }
  return [...conditionsForTarget];
});
const effectiveConditionOptions = computed(() => mapToOptions(effectiveConditionValues.value));

/** Conditions present in the experiment but excluded from the order because they are not in samples for the selected target antigen. */
const conditionsExcludedByTarget = computed(() => {
  const raw = metadataFetched.value;
  const config = app.model.args.antigenControlConfig;
  if (!raw?.conditionValues?.length || !config?.antigenEnabled || !config.targetAntigen) return [];
  const effective = effectiveConditionValues.value;
  const effectiveSet = new Set(effective);
  return raw.conditionValues.filter((c) => !effectiveSet.has(c));
});

/** Stable key for current excluded conditions (persists across page changes; alert re-shows when key changes). */
const conditionsExcludedAlertKey = computed(() =>
  [...conditionsExcludedByTarget.value].sort().join(','));

const conditionsExcludedAlertVisible = computed({
  get: () => {
    const key = conditionsExcludedAlertKey.value;
    const dismissedKey = app.model.ui.excludedAlertDismissedKey ?? '';
    return key !== '' && key !== dismissedKey;
  },
  set: (visible) => {
    if (!visible && conditionsExcludedAlertKey.value) {
      app.model.ui.excludedAlertDismissedKey = conditionsExcludedAlertKey.value;
    }
  },
});

// Clear dismissed state when exclusions go away (e.g. "Multiple target" unchecked) so the alert can show again if the same target is re-selected
watch(conditionsExcludedAlertKey, (key) => {
  if (key === '') {
    app.model.ui.excludedAlertDismissedKey = undefined;
  }
});

/** Options for condition order list and present-in-rounds filter (current order). */
const conditionOrderOptions = computed(() => mapToOptions([...app.model.args.conditionOrder]));

/** Sample options (id as value, label from model or id fallback) for sequenced library selection. */
const sampleOptions = computed(() => {
  const bySample = metadataFetched.value?.conditionBySample;
  if (!bySample) return [];
  const labels = app.model.outputs.sampleLabels as Record<string | number, string> | undefined;
  return Object.keys(bySample).sort().map((id) => ({
    value: id,
    label: labels?.[id] ?? id,
  }));
});

/** Antigens map to their conditions. */
const antigenConditionsMap = computed(() => {
  const raw = metadataFetched.value;
  if (!raw?.conditionBySample || !raw?.antigenBySample) return {};
  const counts: Record<string, Set<string>> = {};
  for (const [sampleId, antigenValue] of Object.entries(raw.antigenBySample)) {
    if (!counts[antigenValue]) counts[antigenValue] = new Set();
    const c = raw.conditionBySample[sampleId];
    if (c) counts[antigenValue].add(c);
  }
  return counts;
});

/** Antigens that appear in at least 2 conditions (required for target selection). */
const antigenValuesList = computed(() => {
  return Object.entries(antigenConditionsMap.value)
    .filter(([, conditions]) => conditions.size >= 2)
    .map(([antigen]) => antigen);
});
const antigenValues = computed(() => mapToOptions(antigenValuesList.value));

/** Antigen options excluding the selected target (for negative control dropdown). */
const negativeAntigenValues = computed(() => {
  const target = app.model.args.antigenControlConfig.targetAntigen;
  // Use all antigens (>= 1 condition), not just those with >= 2 conditions
  const allAntigens = Object.keys(antigenConditionsMap.value);
  const filtered = allAntigens.filter((v) => v !== target);
  return mapToOptions(filtered);
});

const hasSingleSampleNegativeControl = computed(() => {
  const selected = app.model.args.antigenControlConfig.negativeAntigens;
  const map = antigenConditionsMap.value;
  return selected.some((antigen) => (map[antigen]?.size ?? 0) === 1);
});

const hasMultiSampleNegativeControl = computed(() => {
  const selected = app.model.args.antigenControlConfig.negativeAntigens;
  const map = antigenConditionsMap.value;
  return selected.some((antigen) => (map[antigen]?.size ?? 0) > 1);
});

/** Condition values in samples that have the selected negative control antigens. */
const negativeControlConditionValues = computed(() => {
  const raw = metadataFetched.value;
  if (!raw?.conditionBySample || !raw?.antigenBySample) return [];
  const config = app.model.args.antigenControlConfig;
  if (!config?.controlEnabled || !config.negativeAntigens?.length) return [];
  const negSet = new Set(config.negativeAntigens);
  const conditions = new Set<string>();
  for (const [sampleId, antigenValue] of Object.entries(raw.antigenBySample)) {
    if (negSet.has(antigenValue)) {
      const c = raw.conditionBySample[sampleId];
      if (c) conditions.add(c);
    }
  }
  return [...conditions];
});
const negativeControlConditionOptions = computed(() => mapToOptions(negativeControlConditionValues.value));

// Generate comparison options based on condition order
// Creates all possible numerator-denominator pairs where numerator comes after denominator
const comparisonOptions = computed(() => {
  let order = [...app.model.args.conditionOrder];
  if (app.model.args.antigenControlConfig.sequencedLibraryEnabled) {
    order = ['0 - Library', ...order.filter((c) => c !== '0 - Library')];
  }
  if (order.length < 2) return [];

  const comparisons = [];
  for (let num_i = 1; num_i < order.length; num_i++) {
    for (let den_j = 0; den_j < num_i; den_j++) {
      const numerator = order[num_i];
      const denominator = order[den_j];
      const comparisonName = `${numerator} vs ${denominator}`;
      comparisons.push({
        value: comparisonName,
        label: comparisonName,
      });
    }
  }
  return comparisons;
});

// const comparisonsMessage = computed(() => {
//   if (comparisonOptions.value.length === 0) {
//     return '';
//   }
//   return `Will calculate: ${comparisonOptions.value.map((c) => c.label).join(', ')}`;
// });

// const negativeComparisonOptions = computed(() => {
//   const order = [...app.model.args.antigenControlConfig.controlConditionsOrder];
//   if (order.length < 2) return [];

//   const comparisons = [];
//   for (let num_i = 1; num_i < order.length; num_i++) {
//     for (let den_j = 0; den_j < num_i; den_j++) {
//       const numerator = order[num_i];
//       const denominator = order[den_j];
//       const comparisonName = `${numerator} vs ${denominator}`;
//       comparisons.push({
//         value: comparisonName,
//         label: comparisonName,
//       });
//     }
//   }
//   return comparisons;
// });

// const negativeComparisonsMessage = computed(() => {
//   if (negativeComparisonOptions.value.length === 0) {
//     return '';
//   }
//   return `Will calculate: ${negativeComparisonOptions.value.map((c) => c.label).join(', ')}`;
// });

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

const availableToAdd = computed(() => {
  const current = new Set(app.model.args.conditionOrder);
  return effectiveConditionOptions.value.filter((opt) => !current.has(opt.value));
});

const availableToAddToControl = computed(() => {
  const current = new Set(app.model.args.antigenControlConfig.controlConditionsOrder);
  return negativeControlConditionOptions.value.filter((opt) => !current.has(opt.value));
});

const resetConditionOrder = () => {
  const vals = effectiveConditionValues.value;
  if (vals?.length) {
    app.model.args.conditionOrder = [...vals];
  }
};

const resetControlConditionOrder = () => {
  const vals = negativeControlConditionValues.value;
  if (vals?.length) {
    const mainOrder = app.model.args.conditionOrder;
    const orderMap = new Map(mainOrder.map((v, i) => [v, i]));
    const sorted = [...vals].sort((a, b) => {
      const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
    app.model.args.antigenControlConfig.controlConditionsOrder = sorted;
  }
};

const isClusterId = computed(() => {
  if (app.model.outputs.datasetSpec === undefined) return false;
  return app.model.outputs.datasetSpec?.axesSpec.length >= 2 && app.model.outputs.datasetSpec?.axesSpec[1]?.name === 'pl7.app/vdj/clusterId';
});

/**
 * Synchronization logic to initialize and validate condition orders.
 *
 * We need to distinguish between two scenarios:
 * 1. Component remounting (e.g., switching pages in UI): We MUST preserve any custom order
 *    the user previously defined. The tracking refs (`conditionSyncCol`, `controlSyncCol`)
 *    are initialized with the current model values to prevent a reset when the page is reopened.
 *
 * 2. Active user changes (e.g., selecting a new column or dataset): We MUST reset the order
 *    to default values (all available categories) because the previous order is no longer
 *    relevant or contains invalid entries from a different column.
 */

const conditionSyncCol = ref<string | undefined>(app.model.args.conditionColumnRef);
watchEffect(() => {
  const col = app.model.args.conditionColumnRef;
  const vals = effectiveConditionValues.value;

  if (vals && vals.length > 0) {
    const current = app.model.args.conditionOrder;
    const valSet = new Set(vals);

    // If the current order contains values that are no longer valid (e.g. not present in samples
    // for the selected target antigen), remove them but preserve order.
    const hasInvalidItems = current.some((v) => !valSet.has(v));

    if (col !== conditionSyncCol.value || current.length === 0) {
      app.model.args.conditionOrder = [...vals];
      conditionSyncCol.value = col;
    } else if (hasInvalidItems) {
      app.model.args.conditionOrder = current.filter((v) => valSet.has(v));
    }
  }
});

const controlSyncCol = ref<string | undefined>(app.model.args.antigenControlConfig.antigenColumnRef);
watchEffect(() => {
  const col = app.model.args.antigenControlConfig.antigenColumnRef;
  const vals = negativeControlConditionValues.value;

  if (vals && vals.length > 0) {
    const current = app.model.args.antigenControlConfig.controlConditionsOrder;
    const valSet = new Set(vals);

    const hasInvalidItems = current.some((v) => !valSet.has(v));

    if (col !== controlSyncCol.value || current.length === 0 || hasInvalidItems) {
      const mainOrder = app.model.args.conditionOrder;
      const orderMap = new Map(mainOrder.map((v, i) => [v, i]));
      const sorted = [...vals].sort((a, b) => {
        const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });
      app.model.args.antigenControlConfig.controlConditionsOrder = sorted;
      controlSyncCol.value = col;
    }
  }
});

// Track datasets and spec to prevent unwanted updates of values
const syncAbundanceRef = ref(app.model.args.abundanceRef ? JSON.stringify(app.model.args.abundanceRef) : undefined);
const syncIsClustered = ref<boolean | undefined>(
  app.model.outputs.datasetSpec?.axesSpec !== undefined
  && app.model.outputs.datasetSpec.axesSpec.length >= 2
  && app.model.outputs.datasetSpec.axesSpec[1].name === 'pl7.app/vdj/clusterId',
);

// Watch for changes in the dataset spec to initialize defaults
watchEffect(() => {
  const abundanceRef = app.model.args.abundanceRef;
  const spec = app.model.outputs.datasetSpec;

  if (abundanceRef && spec?.axesSpec) {
    const abundanceRefStr = JSON.stringify(abundanceRef);
    const isClustered = spec.axesSpec.length >= 2 && spec.axesSpec[1]?.name === 'pl7.app/vdj/clusterId';

    // Reset to default if:
    // 1. The user switched to a DIFFERENT dataset.
    // 2. The dataset type (clustered vs regular) has changed (self-correction for lag).
    if (abundanceRefStr !== syncAbundanceRef.value || isClustered !== syncIsClustered.value) {
      if (isClustered) {
        app.model.args.FilteringConfig.baseFilter = 'shared';
        app.model.args.FilteringConfig.minAbundance.enabled = false;
      } else {
        app.model.args.FilteringConfig.baseFilter = 'none';
        app.model.args.FilteringConfig.minAbundance.enabled = true;
      }
      syncAbundanceRef.value = abundanceRefStr;
      syncIsClustered.value = isClustered;
    }
  }
});

// Enforce dependency: Enable target selection if negative controls are enabled
watch(() => app.model.args.antigenControlConfig.controlEnabled, (enabled) => {
  if (enabled) {
    app.model.args.antigenControlConfig.antigenEnabled = true;
  }
});

// Sync control flags to model
watchEffect(() => {
  if (app.model.args.antigenControlConfig) {
    app.model.args.antigenControlConfig.hasSingleConditionNegativeControl = hasSingleSampleNegativeControl.value;
    app.model.args.antigenControlConfig.hasMultiConditionNegativeControl = hasMultiSampleNegativeControl.value;
  }
});

// Filtering options
const filteringOptions = [
  { value: 'none', label: 'No filtering' },
  { value: 'shared', label: 'Shared (all conditions)' },
  { value: 'single-sample', label: 'Multiple conditions' },
];

const isConditionOrderOpen = ref(true); // Open by default
const isControlOrderOpen = ref(true); // Open by default
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

    <PlAccordion multiple>
      <PlAccordionSection v-model="isConditionOrderOpen" label="Condition Order">
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
        <PlAlert
          v-if="conditionsExcludedByTarget.length > 0"
          v-model="conditionsExcludedAlertVisible"
          type="warn"
          closeable
        >
          Conditions not present in samples for the selected target antigen were removed: {{ conditionsExcludedByTarget.join(', ') }}.
        </PlAlert>
      </PlAccordionSection>
    </PlAccordion>

    <PlNumberField
      v-model="app.model.args.enrichmentThreshold"
      label="Enrichment threshold"
      :minValue="0.5"
      :step="0.1"
      placeholder="2.0"
    >
      <template #tooltip>
        <p><strong>Enrichment threshold (E<sub>thres</sub>)</strong></p>
        <p>Log2 Fold Change (Log2FC) used to define enriched clonotypes. A clonotype is considered enriched when its Log2FC between conditions is ≥ this value.</p>
        <p>This value is used to define <strong>Enrichment quality</strong> categories in combination to data-derived percentiles (q):</p>
        <p>
          - High threshold: Max Log2FC greater than maximum between enrichment q75 and E<sub>thres</sub><br/>
          - Stable threshold: Overall Log2FC greater than maximum between enrichment q50 and E<sub>thres</sub><br/>
          - Low threshold: Max Log2FC greater than enrichment q25<br/>
          - Frequency threshold: Frequency greater than frequency q75<br/>
        </p>
        <ul>
          <li><strong>Stable Binder</strong> — high threshold &amp; stable threshold.</li>
          <li><strong>Rescuer</strong> — high threshold &amp; NOT stable threshold.</li>
          <li><strong>Parasite</strong> — low threshold &amp; frequency threshold.</li>
          <li><strong>Weak Binder</strong> — All other clonotypes.</li>
        </ul>
      </template>
    </PlNumberField>

    <PlRow>
      <div style="display: flex; align-items: center; gap: 4px;">
        <PlCheckbox
          v-model="app.model.args.antigenControlConfig.antigenEnabled"
          :disabled="app.model.args.antigenControlConfig.controlEnabled"
        >
          Multiple target dataset
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Enable specific target selection for dedicated enrichment analysis.
            </div>
          </template>
        </PlTooltip>
      </div>

      <div style="display: flex; align-items: center; gap: 4px;">
        <PlCheckbox v-model="app.model.args.antigenControlConfig.controlEnabled">
          Use negative controls
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Enables specificity analysis by comparing your target against control samples.<br/><br/>
              You can select multiple negative controls (e.g., irrelevant antigens). The analysis calculates enrichment for each one independently and uses the <strong>maximum value</strong> found across all controls as a baseline for background binding. This helps filter out "sticky" or non-specific clonotypes that appear in your control samples.
            </div>
          </template>
        </PlTooltip>
      </div>
    </PlRow>
    <PlDropdown
      v-if="app.model.args.antigenControlConfig.antigenEnabled"
      v-model="app.model.args.antigenControlConfig.antigenColumnRef"
      :options="app.model.outputs.metadataOptions"
      label="Antigen column" required
    />
    <PlDropdown
      v-if="app.model.args.antigenControlConfig.antigenEnabled
        && !app.model.args.antigenControlConfig.controlEnabled"
      v-model="app.model.args.antigenControlConfig.targetAntigen"
      :options="antigenValues"
      label="Target"
    />
    <PlRow v-if="app.model.args.antigenControlConfig.controlEnabled">
      <PlDropdown
        v-model="app.model.args.antigenControlConfig.targetAntigen"
        :options="antigenValues"
        label="Target"
      />
      <PlDropdownMulti
        v-model="app.model.args.antigenControlConfig.negativeAntigens"
        :style="{minWidth: '148px'}"
        :options="negativeAntigenValues"
        label="Negative control(s)"
      />
    </PlRow>
    <div style="display: flex; align-items: center; gap: 4px;">
      <PlCheckbox
        v-if="app.model.args.antigenControlConfig.antigenEnabled"
        v-model="app.model.args.antigenControlConfig.sequencedLibraryEnabled"
      >
        Sequenced Library
      </PlCheckbox>
      <PlTooltip v-if="app.model.args.antigenControlConfig.antigenEnabled" class="info">
        <template #tooltip>
          <div>
            When enabled, you can select a sample that represents your sequenced naive library. This sample will be used as the reference (baseline) for enrichment fold-change calculations, for both the target antigen and negative controls.
          </div>
        </template>
      </PlTooltip>
    </div>
    <PlDropdown
      v-if="app.model.args.antigenControlConfig.antigenEnabled && app.model.args.antigenControlConfig.sequencedLibraryEnabled"
      v-model="app.model.args.antigenControlConfig.sequencedLibrarySampleId"
      :options="sampleOptions"
      label="Sample"
      clearable
    />
    <PlAccordion multiple>
      <PlAccordionSection
        v-if="app.model.args.antigenControlConfig.controlEnabled && hasMultiSampleNegativeControl"
        v-model="isControlOrderOpen" label="Negative Condition Order"
      >
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
          v-model:items="app.model.args.antigenControlConfig.controlConditionsOrder"
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
    </PlAccordion>
    <PlRow
      v-if="app.model.args.antigenControlConfig.controlEnabled
        && hasMultiSampleNegativeControl"
    >
      <PlNumberField
        v-model="app.model.args.antigenControlConfig.controlThreshold"
        label="Control threshold"
        :minValue="0"
        :step="0.1"
        placeholder="1.0"
      >
        <template #tooltip>
          <div>
            Log2 Fold Change (Log2FC) thresholds used to define <strong>Enriched negative control clonotypes</strong>.<br/>
            A clonotype is considered enriched if its Log2FC value between conditions is equal or greater than the threshold. This threshold in combination with <strong>Enrichment threshold</strong> is used to define <strong>Binding Specificity</strong> categories:
            <br/><br/>
            Target<sub>Max</sub> and Control<sub>Max</sub> are the maximum Log2FC values for the target and control conditions, respectively:
            <br/><br/>
            - <strong>Antigen-Specific:</strong> Target<sub>Max</sub> ≥ Enrichment Threshold and Control<sub>Max</sub> &lt; Control Threshold.
            <br/>
            - <strong>Non-Specific:</strong> Target<sub>Max</sub> ≥ Enrichment Threshold and Control<sub>Max</sub> ≥ Control Threshold (indicates "sticky" binders).
            <br/>
            - <strong>Negative-Control:</strong> Target<sub>Max</sub> &lt; Enrichment Threshold and Control<sub>Max</sub> ≥ Control Threshold.
            <br/>
            - <strong>Not-Enriched:</strong> Both below thresholds.
          </div>
        </template>
      </PlNumberField>
    </PlRow>

    <PlAccordionSection label="Downsampling">
      <PlBtnGroup
        v-model="app.model.args.downsampling.type" :options="downsamplingOptions"
        label="Downsampling options" :compact="true"
      >
        <template #tooltip>
          <div>
            <strong>Downsampling Strategy:</strong><br/>
            Normalizes sequencing depth across samples to ensure fair comparison of diversity and abundance.
            <br/><br/>
            <strong>None:</strong> Use raw abundance values. Recommended only if sequencing depth is already uniform.<br/><br/>
            <strong>Random Sampling:</strong> Resamples all samples to a target read depth (total number of reads) while maintaining relative clonotype proportions. Choose <strong>Fixed</strong> (manual), <strong>Min</strong> (smallest sample), or <strong>Auto</strong> to set the target depth.
          </div>
        </template>
      </PlBtnGroup>
      <PlBtnGroup
        v-if="app.model.args.downsampling.type === 'hypergeometric'"
        v-model="app.model.args.downsampling.valueChooser"
        style="margin-top: -18px"
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
    </PlAccordionSection>

    <PlAccordionSection label="Clonotype Filtering">
      <PlRadioGroup
        v-model="app.model.args.FilteringConfig.baseFilter"
        :options="filteringOptions"
      >
        <template #label>
          Based on condition overlap
          <PlTooltip class="info" :style="{display: 'inline-block'}">
            <template #tooltip>
              <strong>Condition-based filtering strategy:</strong><br/>
              <strong>No filtering:</strong> Analyze all clonotypes, including those specific to individual conditions (may include rare or condition-specific responses)<br/><br/>
              <strong>Shared (all conditions):</strong> Focus only on clonotypes present in all conditions<br/><br/>
              <strong>Multiple conditions:</strong> Focus on clonotypes present in more than one condition (excludes condition-specific clonotypes that may represent noise or rare events)
            </template>
          </PlTooltip>
        </template>
      </PlRadioGroup>
      <PlCheckbox v-model="app.model.args.FilteringConfig.minAbundance.enabled">
        Based on abundance
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Remove clonotypes below a specific threshold based on their maximum abundance across all conditions. Filters sampling noise in display campaigns<br/><br/>
              <strong>Counts:</strong> Filter by raw/downsampled number of reads (e.g., 100).<br/>
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
        Based on specific conditions
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Filter clonotypes based on their occurrence across conditions.<br/><br/>
              <strong>Present in any (OR):</strong> Keeps clonotypes detected in at least one of the selected conditions.<br/>
              <strong>Present in all (AND):</strong> Only keeps clonotypes detected in every one of the selected conditions.<br/><br/>
              Useful to focus on persistent clonotypes or those appearing in later selection conditions.
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
          :options="[{ value: 'OR', label: 'Present in any (OR)' },
                     { value: 'AND', label: 'Present in all (AND)' }]"
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
      <PlNumberField
        v-if="hasSingleSampleNegativeControl ||
          (app.model.args.antigenControlConfig.sequencedLibraryEnabled === false &&
            app.model.args.antigenControlConfig.controlConditionsOrder.length === 1)"
        v-model="app.model.args.antigenControlConfig.singleControlFrequencyThreshold"
        label="Control Frequency Threshold"
        :minValue="0"
        :maxValue="1"
        :step="0.01"
        placeholder="0.01"
      >
        <template #tooltip>
          <div>
            <strong>Control Frequency Threshold</strong> (Default: 0.01)<br/><br/>
            Minimum frequency required to consider a clonotype "present" in the control sample during <strong>specificity classification</strong>.<br/><br/>
            Clonotypes are only considered present in the control if their frequency is <strong>greater than or equal to</strong> this value. This prevents low-abundance noise in the control from affecting specificity classification.
          </div>
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
