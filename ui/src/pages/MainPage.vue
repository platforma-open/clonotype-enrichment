<script setup lang="ts">
import type { PickedValueOption } from "@platforma-open/milaboratories.clonotype-enrichment.model";
import type { PlRef } from "@platforma-sdk/model";
import { getRawPlatformaInstance } from "@platforma-sdk/model";
import type { ListOption } from "@platforma-sdk/ui-vue";
import {
  PlAccordion,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockDependencies,
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
} from "@platforma-sdk/ui-vue";
import { asyncComputed } from "@vueuse/core";
import { computed, ref, watch, watchEffect } from "vue";
import { useApp } from "../app";

const app = useApp();

const settingsAreShown = ref(app.model.outputs.datasetSpec === undefined);
const showSettings = () => {
  settingsAreShown.value = true;
};
const statsOpen = ref(false);

/**
 * Options of the condition and antigen value pickers, while they describe the columns and the
 * target picked now. The model output follows the picks with a lag; until it catches up the
 * pickers show as loading.
 */
const pickers = computed(() => {
  const pickers = app.model.outputs.metadataValuePickers;
  if (pickers === undefined) return undefined;
  const { conditionColumnRef, antigenControlConfig: config } = app.model.data;
  const { computedFor } = pickers;
  const isCurrent =
    computedFor.conditionColumnRef === conditionColumnRef &&
    computedFor.antigenColumnRef === config.antigenColumnRef;
  return isCurrent ? pickers : undefined;
});

/** Labels of every value the pickers offer and of every pick they report as not available. */
const valueLabels = computed(() => {
  const p = pickers.value;
  if (p === undefined) return undefined;
  const { unavailable } = p;
  const options: PickedValueOption[] = [
    ...p.conditions,
    ...p.conditionsExcludedByTarget,
    ...p.rounds,
    ...p.controlConditions,
    ...p.targetAntigens,
    ...p.negativeAntigens,
    ...p.libraryAntigens,
    ...unavailable.conditions,
    ...unavailable.controlConditions,
    ...unavailable.negativeAntigens,
    ...(unavailable.targetAntigen === undefined ? [] : [unavailable.targetAntigen]),
    ...(unavailable.libraryAntigen === undefined ? [] : [unavailable.libraryAntigen]),
  ];
  return new Map(options.map((option) => [option.value, option.label]));
});

/** What the user sees for a picked condition or antigen value. */
const labelOf = (value: string) => {
  const labels = valueLabels.value;
  if (labels === undefined) return "…";
  return labels.get(value) ?? "Value not available";
};
const labelsOf = (options: readonly PickedValueOption[]) => options.map((o) => o.label);

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.data.abundanceRef = inputRef;
}

// updating defaultBlockLabel
watchEffect(() => {
  // Picked values are named by their labels, which arrive with the model outputs.
  if (valueLabels.value === undefined) return;
  const conditionOrder = app.model.data.conditionOrder;
  const clonotypeDefinition = app.model.data.clonotypeDefinition;
  const sequenceColumnOptions = app.model.outputs.sequenceColumnOptions;
  const baseFilter = app.model.data.FilteringConfig.baseFilter;

  let label = "";

  // Add clonotype definition prefix if selected
  if (clonotypeDefinition && clonotypeDefinition.length > 0 && sequenceColumnOptions) {
    const clonotypeLabels = clonotypeDefinition
      .map((colId) => {
        const option = sequenceColumnOptions.find((opt) => opt.value === colId);
        return option?.label;
      })
      .filter((label) => label !== undefined);

    if (clonotypeLabels.length > 0) {
      label = clonotypeLabels.join("-");
    }
  }

  // Add condition order
  if (conditionOrder && conditionOrder.length > 0) {
    const conditionLabel = conditionOrder.map(labelOf).join("-");
    label = label ? `${label}, ${conditionLabel}` : conditionLabel;
  }

  // Add target antigen if defined
  const antigenControlConfig = app.model.data.antigenControlConfig;
  if (antigenControlConfig.targetAntigen && antigenControlConfig.antigenEnabled) {
    const targetLabel = labelOf(antigenControlConfig.targetAntigen);
    label = label ? `${label}, ${targetLabel}` : targetLabel;
  }

  // Add filtering mode at the end
  if (baseFilter) {
    const filteringLabel =
      baseFilter === "none"
        ? "No filtering"
        : baseFilter === "shared"
          ? "Shared (all conditions)"
          : "Multiple conditions";
    label = label ? `${label}, ${filteringLabel}` : filteringLabel;
  }

  app.model.data.defaultBlockLabel = label;
});

// Persist the auto-discovered per-clonotype abundance so the workflow can
// compute the clonotype Max Frequency score (cluster input only).
watchEffect(() => {
  const datasetSpec = app.model.outputs.datasetSpec;
  const isCluster = datasetSpec?.axesSpec?.[1]?.name === "pl7.app/clusterId";
  const next = isCluster ? app.model.outputs.discoveredClonotypeAbundance : undefined;
  const current = app.model.data.clonotypeAbundanceRef;
  if (JSON.stringify(current ?? null) !== JSON.stringify(next ?? null)) {
    app.model.data.clonotypeAbundanceRef = next;
  }
});

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pt,
});

const tableLoadingText = computed(() => {
  if (app.model.outputs.isRunning) {
    return "Running";
  }
  return "Loading";
});

/** Conditions the order can hold: all of them, or, with a target, those of its samples. */
const effectiveConditionOptions = computed(() => pickers.value?.conditions ?? []);

/** Conditions left out of the order because no sample of the selected target has them. */
const conditionsExcludedByTarget = computed(() => pickers.value?.conditionsExcludedByTarget ?? []);

/** Stable key for current excluded conditions (persists across page changes; alert re-shows when key changes). */
const conditionsExcludedAlertKey = computed(() =>
  conditionsExcludedByTarget.value
    .map((option) => option.value)
    .sort()
    .join(","),
);

const conditionsExcludedAlertVisible = computed({
  get: () => {
    const key = conditionsExcludedAlertKey.value;
    const dismissedKey = app.model.data.excludedAlertDismissedKey ?? "";
    return key !== "" && key !== dismissedKey;
  },
  set: (visible) => {
    if (!visible && conditionsExcludedAlertKey.value) {
      app.model.data.excludedAlertDismissedKey = conditionsExcludedAlertKey.value;
    }
  },
});

// Clear dismissed state when exclusions go away (e.g. "Multiple target" unchecked) so the alert can show again if the same target is re-selected
watch(conditionsExcludedAlertKey, (key) => {
  if (key === "") {
    app.model.data.excludedAlertDismissedKey = undefined;
  }
});

/** Options of the present-in-rounds filter: the conditions of the current order. */
const conditionOrderOptions = computed(() => pickers.value?.rounds);

/** Options of the target, negative control and library dropdowns. */
const antigenValues = computed(() => pickers.value?.targetAntigens);
const negativeAntigenValues = computed(() => pickers.value?.negativeAntigens);
const libraryAntigenValues = computed(() => pickers.value?.libraryAntigens);

const targetAntigenLabel = computed(
  () => pickers.value?.unavailable.targetAntigen?.label ?? "Value",
);
const libraryAntigenLabel = computed(
  () => pickers.value?.unavailable.libraryAntigen?.label ?? "Value",
);

/** Conditions of the samples of the selected negative controls. */
const negativeControlConditionOptions = computed(() => pickers.value?.controlConditions ?? []);

/** Picked target and negative controls some of whose samples have no condition. */
const antigensWithEmptyConditions = computed(
  () => pickers.value?.antigensWithEmptyConditions ?? [],
);

/** Whether a negative control is present in a single condition, and in several. */
const hasSingleSampleNegativeControl = computed(
  () => pickers.value?.negativeControls.single ?? false,
);
const hasMultiSampleNegativeControl = computed(
  () => pickers.value?.negativeControls.multi ?? false,
);

/** Comparisons the condition order produces: every condition against each one before it. */
const comparisonOptions = computed(() => app.model.outputs.comparisonOptions ?? []);

// const comparisonsMessage = computed(() => {
//   if (comparisonOptions.value.length === 0) {
//     return '';
//   }
//   return `Will calculate: ${comparisonOptions.value.map((c) => c.label).join(', ')}`;
// });

// const negativeComparisonOptions = computed(() => {
//   const order = [...app.model.data.antigenControlConfig.controlConditionsOrder];
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
  { label: "None", value: "none" },
  { label: "Random Sampling", value: "hypergeometric" },
];

// Function to create statistics table HTML
const createStatsTable = () => {
  const stats = [
    {
      label: "Minimum enrichment",
      value: app.model.outputs.enrichmentStats?.minValue || "",
    },
    {
      label: "Maximum enrichment",
      value: app.model.outputs.enrichmentStats?.maxValue || "",
    },
    {
      label: "Mean enrichment",
      value: app.model.outputs.enrichmentStats?.meanValue || "",
    },
    {
      label: "Median enrichment",
      value: app.model.outputs.enrichmentStats?.medianValue || "",
    },
    {
      label: "Enrichment score cutoff",
      value: app.model.outputs.enrichmentStats?.cutoffValue || "",
    },
  ];

  const rows = stats
    .map(
      (stat) =>
        `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111;">${stat.label}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #374151; text-align: right;">${stat.value}</td>
    </tr>`,
    )
    .join("");

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
  const handle = app.model.outputs.pt.value.fullTableHandle;
  if (!handle) return undefined;
  return (await getRawPlatformaInstance().pFrameDriver.getShape(handle)).rows === 0;
});

// Check if the filters removed too many clonotypes
const filteredTooMuch = asyncComputed(async () => {
  if (app.model.outputs.filteredTooMuch === true) return true;
});

const availableToAdd = computed(() => {
  const current = new Set(app.model.data.conditionOrder);
  return effectiveConditionOptions.value.filter((opt) => !current.has(opt.value));
});

const availableToAddToControl = computed(() => {
  const current = new Set(app.model.data.antigenControlConfig.controlConditionsOrder);
  return negativeControlConditionOptions.value.filter((opt) => !current.has(opt.value));
});

const resetConditionOrder = () => {
  const vals = effectiveConditionOptions.value.map((option) => option.value);
  if (vals.length) {
    app.model.data.conditionOrder = vals;
  }
};

const resetControlConditionOrder = () => {
  const vals = negativeControlConditionOptions.value.map((option) => option.value);
  if (vals.length) {
    const mainOrder = app.model.data.conditionOrder;
    const orderMap = new Map(mainOrder.map((v, i) => [v, i]));
    const sorted = [...vals].sort((a, b) => {
      const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
      return aIdx - bIdx;
    });
    app.model.data.antigenControlConfig.controlConditionsOrder = sorted;
  }
};

const isClusterId = computed(() => {
  if (app.model.outputs.datasetSpec === undefined) return false;
  return (
    app.model.outputs.datasetSpec?.axesSpec.length >= 2 &&
    app.model.outputs.datasetSpec?.axesSpec[1]?.name === "pl7.app/clusterId"
  );
});

// Whole-sequence inputs (peptide-discovery peptides and
// synthetic-repertoire-profiler amplicon variants) have no VDJ clonotype
// definition, so the "Clonotype definition" picker is hidden for both.
const isWholeSequenceInput = computed(() => {
  const modality = app.model.outputs.modality;
  return modality === "peptide" || modality === "amplicon";
});

/**
 * Synchronization logic to initialize condition orders.
 *
 * We need to distinguish between two scenarios:
 * 1. Component remounting (e.g., switching pages in UI): We MUST preserve any custom order
 *    the user previously defined. The tracking refs (`conditionSyncCol`, `controlSyncCol`)
 *    are initialized with the current model values to prevent a reset when the page is reopened.
 *
 * 2. Active user changes (e.g., selecting a new column or dataset): We MUST reset the order
 *    to default values (all available categories) because the previous order is no longer
 *    relevant or contains invalid entries from a different column.
 *
 * A picked value that is no longer among the available ones (its samples left the input, or
 * the metadata changed upstream) stays in the order and is marked as not available. The block
 * that produced the column sees which of its values this block still uses only while they
 * stay picked.
 */

const conditionSyncCol = ref<string | undefined>(app.model.data.conditionColumnRef);
watchEffect(() => {
  const col = app.model.data.conditionColumnRef;
  const vals = effectiveConditionOptions.value.map((option) => option.value);

  if (vals.length > 0) {
    if (col !== conditionSyncCol.value || app.model.data.conditionOrder.length === 0) {
      app.model.data.conditionOrder = vals;
      conditionSyncCol.value = col;
    }
  }
});

const controlSyncCol = ref<string | undefined>(
  app.model.data.antigenControlConfig.antigenColumnRef,
);
watchEffect(() => {
  const col = app.model.data.antigenControlConfig.antigenColumnRef;
  const vals = negativeControlConditionOptions.value.map((option) => option.value);

  if (vals.length > 0) {
    const current = app.model.data.antigenControlConfig.controlConditionsOrder;

    if (col !== controlSyncCol.value || current.length === 0) {
      const mainOrder = app.model.data.conditionOrder;
      const orderMap = new Map(mainOrder.map((v, i) => [v, i]));
      const sorted = [...vals].sort((a, b) => {
        const aIdx = orderMap.get(a) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderMap.get(b) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
      });
      app.model.data.antigenControlConfig.controlConditionsOrder = sorted;
      controlSyncCol.value = col;
    }
  }
});

// Columns picked by an older version of the block carry ids anchored to the abundance column.
// They are swapped for the ids of the same columns among the current options. The swap keeps
// the column, so it keeps the condition order and the picked antigens too; those were picked
// as plain values, which no option carries, so they show as not available until picked again.
const legacyColumnRefSwaps = new Map<string, string>();
watchEffect(() => {
  const replacements = app.model.outputs.legacyMetadataColumnRefs;
  if (!replacements?.length) return;
  const config = app.model.data.antigenControlConfig;
  for (const { from, to } of replacements) {
    legacyColumnRefSwaps.set(from, to);
    if (app.model.data.conditionColumnRef === from) {
      conditionSyncCol.value = to;
      app.model.data.conditionColumnRef = to;
    }
    if (config.antigenColumnRef === from) {
      controlSyncCol.value = to;
      config.antigenColumnRef = to;
    }
  }
});

/** Picks no sample of the abundance input carries any more, by the setting they are picked in. */
const unavailable = computed(() => pickers.value?.unavailable);

const unavailableConditions = computed(
  () => new Set(unavailable.value?.conditions.map((option) => option.value)),
);
const unavailableControlConditions = computed(
  () => new Set(unavailable.value?.controlConditions.map((option) => option.value)),
);
const unavailableLibraryAntigen = computed(() => unavailable.value?.libraryAntigen);

/** Selected comparisons that the current condition order no longer produces. */
const unavailableComparisons = computed(() => {
  const available = new Set(comparisonOptions.value.map((o) => o.value));
  return app.model.data.additionalEnrichmentExports.filter((v) => !available.has(v));
});

/**
 * Picked values the workflow still receives although no sample of the abundance input carries
 * them, grouped by the setting they are picked in.
 */
const unavailablePicks = computed(() => {
  const picks = unavailable.value;
  if (picks === undefined) return [];
  const groups: { setting: string; values: PickedValueOption[] }[] = [
    { setting: "Conditions", values: picks.conditions },
    { setting: "Negative control conditions", values: picks.controlConditions },
    { setting: "Target", values: picks.targetAntigen === undefined ? [] : [picks.targetAntigen] },
    { setting: "Negative controls", values: picks.negativeAntigens },
    {
      setting: "Library",
      values: picks.libraryAntigen === undefined ? [] : [picks.libraryAntigen],
    },
  ];
  return groups
    .filter((group) => group.values.length > 0)
    .map((group) => ({ setting: group.setting, values: labelsOf(group.values) }));
});

// Track datasets and spec to prevent unwanted updates of values
const syncAbundanceRef = ref(
  app.model.data.abundanceRef ? JSON.stringify(app.model.data.abundanceRef) : undefined,
);
const syncIsClustered = ref<boolean | undefined>(
  app.model.outputs.datasetSpec?.axesSpec !== undefined &&
    app.model.outputs.datasetSpec.axesSpec.length >= 2 &&
    app.model.outputs.datasetSpec.axesSpec[1].name === "pl7.app/clusterId",
);

// Watch for changes in the dataset spec to initialize defaults
watchEffect(() => {
  const abundanceRef = app.model.data.abundanceRef;
  const spec = app.model.outputs.datasetSpec;

  if (abundanceRef && spec?.axesSpec) {
    const abundanceRefStr = JSON.stringify(abundanceRef);
    const isClustered = spec.axesSpec.length >= 2 && spec.axesSpec[1]?.name === "pl7.app/clusterId";

    // Reset to default if:
    // 1. The user switched to a DIFFERENT dataset.
    // 2. The dataset type (clustered vs regular) has changed (self-correction for lag).
    if (abundanceRefStr !== syncAbundanceRef.value || isClustered !== syncIsClustered.value) {
      if (isClustered) {
        app.model.data.FilteringConfig.baseFilter = "single-sample";
        app.model.data.FilteringConfig.minAbundance.enabled = false;
      } else {
        app.model.data.FilteringConfig.baseFilter = "none";
        app.model.data.FilteringConfig.minAbundance.enabled = true;
      }
      syncAbundanceRef.value = abundanceRefStr;
      syncIsClustered.value = isClustered;
    }
  }
});

// Enforce dependency: Enable target selection if negative controls are enabled
watch(
  () => app.model.data.antigenControlConfig.controlEnabled,
  (enabled) => {
    if (enabled) {
      app.model.data.antigenControlConfig.antigenEnabled = true;
    }
  },
);

// Sync control flags to model
watchEffect(() => {
  const controls = pickers.value?.negativeControls;
  if (controls === undefined) return;
  const config = app.model.data.antigenControlConfig;
  if (config.hasSingleConditionNegativeControl !== controls.single) {
    config.hasSingleConditionNegativeControl = controls.single;
  }
  if (config.hasMultiConditionNegativeControl !== controls.multi) {
    config.hasMultiConditionNegativeControl = controls.multi;
  }
});

// Clear sequenced library antigen when the available options change due to user action
// (target or negative control selection changed), but NOT on component remount.
const librarySyncKey = ref(
  [
    app.model.data.antigenControlConfig.targetAntigen,
    ...app.model.data.antigenControlConfig.negativeAntigens,
  ].join(","),
);
watchEffect(() => {
  const key = [
    app.model.data.antigenControlConfig.targetAntigen,
    ...app.model.data.antigenControlConfig.negativeAntigens,
  ].join(",");
  const current = app.model.data.antigenControlConfig.sequencedLibraryAntigen;

  if (key !== librarySyncKey.value) {
    // User changed target or negative controls — clear the library once it is the target or
    // one of the negative controls. A library missing from the data stays picked and marked as
    // not available.
    const config = app.model.data.antigenControlConfig;
    if (
      current &&
      (current === config.targetAntigen || config.negativeAntigens.includes(current))
    ) {
      config.sequencedLibraryAntigen = undefined;
    }
    librarySyncKey.value = key;
  }
});

// Clear antigen-valued selections when the antigen column itself changes.
// These hold values of the selected column, so a different column
// invalidates them outright. Plain `watch` doesn't fire on mount, so persisted
// selections survive component remount.
watch(
  () => app.model.data.antigenControlConfig.antigenColumnRef,
  (next, prev) => {
    if (prev !== undefined && legacyColumnRefSwaps.get(prev) === next) return;
    const config = app.model.data.antigenControlConfig;
    config.targetAntigen = undefined;
    config.negativeAntigens = [];
    config.sequencedLibraryAntigen = undefined;
  },
);

// Picking a target removes the conditions that have no samples of that target from the order,
// once the pickers are built for that target. Conditions that leave the data on their own stay
// in the order and are marked as not available.
const pruneOrderForTarget = ref<{ target: string | undefined }>();
watch(
  () => app.model.data.antigenControlConfig.targetAntigen,
  (target) => {
    pruneOrderForTarget.value = { target };
  },
);
watchEffect(() => {
  const pending = pruneOrderForTarget.value;
  const p = pickers.value;
  if (pending === undefined || p === undefined) return;
  if (p.computedFor.targetAntigen !== pending.target) return;
  pruneOrderForTarget.value = undefined;
  const excluded = new Set<string>(p.conditionsExcludedByTarget.map((option) => option.value));
  if (excluded.size === 0) return;
  const current = app.model.data.conditionOrder;
  const pruned = current.filter((v) => !excluded.has(v));
  if (pruned.length !== current.length) app.model.data.conditionOrder = pruned;
});

// Drop stale "present in rounds" selections when the condition order changes.
const conditionOrderKey = computed(() => app.model.data.conditionOrder.join(","));
watch(conditionOrderKey, () => {
  const validSet = new Set(app.model.data.conditionOrder);
  const current = app.model.data.FilteringConfig.presentInRounds.rounds;
  const filtered = current.filter((v) => validSet.has(v));
  if (filtered.length !== current.length) {
    app.model.data.FilteringConfig.presentInRounds.rounds = filtered;
  }
});

// Filtering options
const filteringOptions = [
  { value: "none", label: "No filtering" },
  { value: "shared", label: "Shared (all conditions)" },
  { value: "single-sample", label: "Multiple conditions" },
];

const isConditionOrderOpen = ref(true); // Open by default
const isControlOrderOpen = ref(true); // Open by default
</script>

<template>
  <PlBlockPage
    v-model:subtitle="app.model.data.customBlockLabel"
    :subtitle-placeholder="app.model.data.defaultBlockLabel"
    title="Enrichment Analysis"
  >
    <PlBlockDependencies :handle="app.plugins.dependencies.handle" />
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
      The input dataset you have selected is empty or has too few sequences. Please choose a
      different dataset.
    </PlAlert>
    <PlAlert v-if="filteredTooMuch === true" type="warn" icon>
      <template #title>Too few sequences</template>
      Current filters removed all sequences. Consider relaxing filter criteria.
    </PlAlert>
    <PlAgDataTableV2
      v-model="app.model.data.tableState"
      :settings="tableSettings"
      :loading-text="tableLoadingText"
      not-ready-text="Data is not computed"
      show-export-button
    />
  </PlBlockPage>

  <PlSlideModal v-model="settingsAreShown">
    <template #title>Settings</template>
    <PlAlert v-if="unavailablePicks.length > 0" type="error" icon>
      <template #title>Selected values are missing from the data</template>
      No sample of the input carries these values any more:
      <ul>
        <li v-for="group in unavailablePicks" :key="group.setting">
          <strong>{{ group.setting }}:</strong> {{ group.values.join(", ") }}
        </li>
      </ul>
      The analysis results will be wrong until they are removed or replaced, or the condition order
      is reset to default.
    </PlAlert>
    <PlDropdownRef
      v-model="app.model.data.abundanceRef"
      :options="app.model.outputs.abundanceOptions"
      label="Select abundance"
      clearable
      required
      @update:model-value="setInput"
    />
    <PlDropdown
      v-model="app.model.data.conditionColumnRef"
      :options="app.model.outputs.metadataOptions"
      :disabled="app.model.data.abundanceRef === undefined"
      label="Condition column"
      clearable
      required
    />

    <PlAlert v-if="antigensWithEmptyConditions.length > 0" type="error">
      Some samples matching the
      <b>{{ labelsOf(antigensWithEmptyConditions).join(", ") }}</b> antigen have empty values in the
      condition column. Please provide valid condition names in your metadata to include these
      samples in the analysis.
    </PlAlert>

    <PlAccordion multiple>
      <PlAccordionSection v-model="isConditionOrderOpen" label="Condition Order">
        <div style="display: flex; margin-bottom: -15px">
          Define condition order
          <PlTooltip class="info">
            <template #label>Define condition order</template>
            <template #tooltip>
              <div>
                <strong>Order aware selection:</strong> Calculates contrast between an element
                (numerator) and each of its preceding elements (denominators). <br /><br />
                <strong>Example:</strong> If you select "Cond 1", "Cond 2" and "Cond 3", the
                contrasts will be:
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
        <PlElementList v-model:items="app.model.data.conditionOrder">
          <template #item-title="{ item }">
            {{ labelOf(item) }}
            <span v-if="unavailableConditions.has(item)" class="unavailable-value">
              not available
            </span>
          </template>
        </PlElementList>
        <PlBtnGhost
          v-if="availableToAdd.length > 0 || unavailableConditions.size > 0"
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
          When <strong>Target</strong> is defined, only target-specific conditions are allowed.
          Removed: {{ labelsOf(conditionsExcludedByTarget).join(", ") }}.
        </PlAlert>
      </PlAccordionSection>
    </PlAccordion>

    <PlNumberField
      v-model="app.model.data.enrichmentThreshold"
      label="Enrichment threshold"
      :minValue="0.6"
      :step="0.1"
      placeholder="2.0"
      :error-message="
        app.model.data.enrichmentThreshold === undefined
          ? 'Value must be higher than 0.6'
          : undefined
      "
    >
      <template #tooltip>
        <p><strong>Enrichment threshold (E<sub>thres</sub>)</strong></p>
        <p>
          Log2 Fold Change (Log2FC) used to define enriched sequences. A sequence is considered
          enriched when its Log2FC between conditions is ≥ this value.
        </p>
        <p>
          This value is used to define
          <strong>Enrichment quality</strong> categories in combination to data-derived percentiles
          (q):
        </p>
        <p>
          - High threshold: Max Log2FC greater than maximum between enrichment q75 and E<sub
            >thres</sub
          ><br />
          - Stable threshold: Overall Log2FC greater than maximum between enrichment q50 and E<sub
            >thres</sub
          ><br />
          - Low threshold: Max Log2FC greater than enrichment q25<br />
          - Frequency threshold: Frequency greater than frequency q75<br />
        </p>
        <ul>
          <li><strong>Stable Binder</strong> — high threshold &amp; stable threshold.</li>
          <li><strong>Rescuer</strong> — high threshold &amp; NOT stable threshold.</li>
          <li><strong>Parasite</strong> — low threshold &amp; frequency threshold.</li>
          <li><strong>Weak Binder</strong> — All other sequences.</li>
        </ul>
      </template>
    </PlNumberField>

    <PlRow>
      <div style="display: flex; align-items: center; gap: 4px">
        <PlCheckbox
          v-model="app.model.data.antigenControlConfig.antigenEnabled"
          :disabled="app.model.data.antigenControlConfig.controlEnabled"
        >
          Multiple target dataset
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            <div>Enable specific target selection for dedicated enrichment analysis.</div>
          </template>
        </PlTooltip>
      </div>

      <div style="display: flex; align-items: center; gap: 4px">
        <PlCheckbox v-model="app.model.data.antigenControlConfig.controlEnabled">
          Use negative controls
        </PlCheckbox>
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Enables specificity analysis by comparing your target against control samples.<br /><br />
              You can select multiple negative controls (e.g., irrelevant antigens). The analysis
              calculates enrichment for each one independently and uses the
              <strong>maximum value</strong> found across all controls as a baseline for background
              binding. This helps filter out "sticky" or non-specific sequences that appear in your
              control samples.
            </div>
          </template>
        </PlTooltip>
      </div>
    </PlRow>
    <PlDropdown
      v-if="app.model.data.antigenControlConfig.antigenEnabled"
      v-model="app.model.data.antigenControlConfig.antigenColumnRef"
      :options="app.model.outputs.metadataOptions"
      :disabled="app.model.data.abundanceRef === undefined"
      label="Antigen column"
      clearable
      required
    />
    <PlDropdown
      v-if="
        app.model.data.antigenControlConfig.antigenEnabled &&
        !app.model.data.antigenControlConfig.controlEnabled
      "
      v-model="app.model.data.antigenControlConfig.targetAntigen"
      :options="antigenValues"
      :missing-value-label="`${targetAntigenLabel} — not available`"
      label="Target"
    />
    <PlRow v-if="app.model.data.antigenControlConfig.controlEnabled">
      <PlDropdown
        v-model="app.model.data.antigenControlConfig.targetAntigen"
        :options="antigenValues"
        :missing-value-label="`${targetAntigenLabel} — not available`"
        label="Target"
      />
      <PlDropdownMulti
        v-model="app.model.data.antigenControlConfig.negativeAntigens"
        :style="{ minWidth: '148px' }"
        :options="negativeAntigenValues"
        missing-value-label="Antigen not available"
        label="Negative control(s)"
      />
    </PlRow>
    <div style="display: flex; align-items: center; gap: 4px">
      <PlCheckbox
        v-if="app.model.data.antigenControlConfig.antigenEnabled"
        v-model="app.model.data.antigenControlConfig.sequencedLibraryEnabled"
      >
        Sequenced Library
      </PlCheckbox>
      <PlTooltip v-if="app.model.data.antigenControlConfig.antigenEnabled" class="info">
        <template #tooltip>
          <div>
            When enabled, you can select the library from the antigen column values. The samples
            associated with this library will be used as the reference (baseline) for enrichment
            fold-change calculations, for both the target antigen and negative controls.
          </div>
        </template>
      </PlTooltip>
    </div>
    <PlDropdown
      v-if="
        app.model.data.antigenControlConfig.antigenEnabled &&
        app.model.data.antigenControlConfig.sequencedLibraryEnabled &&
        (libraryAntigenValues === undefined ||
          libraryAntigenValues.length > 0 ||
          unavailableLibraryAntigen !== undefined)
      "
      v-model="app.model.data.antigenControlConfig.sequencedLibraryAntigen"
      :options="libraryAntigenValues"
      :missing-value-label="`${libraryAntigenLabel} — not available`"
      label="Library"
    />
    <PlAlert
      v-if="
        app.model.data.antigenControlConfig.antigenEnabled &&
        app.model.data.antigenControlConfig.sequencedLibraryEnabled &&
        libraryAntigenValues?.length === 0
      "
      type="error"
      icon
    >
      No options available. Only antigen column values not used as target or negative controls are
      shown.
    </PlAlert>
    <PlAccordion multiple>
      <PlAccordionSection
        v-if="app.model.data.antigenControlConfig.controlEnabled && hasMultiSampleNegativeControl"
        v-model="isControlOrderOpen"
        label="Negative Condition Order"
      >
        <div style="display: flex; margin-bottom: -15px">
          Define negative condition order
          <PlTooltip class="info">
            <template #label>Define condition order</template>
            <template #tooltip>
              <div>
                <strong>Order aware selection:</strong> Calculates contrast between an element
                (numerator) and each of its preceding elements (denominators). <br /><br />
                <strong>Example:</strong> If you select "Cond 1", "Cond 2" and "Cond 3", the
                contrasts will be:
                <ul>
                  <li>Cond 2 vs Cond 1</li>
                  <li>Cond 3 vs Cond 1</li>
                  <li>Cond 3 vs Cond 2</li>
                </ul>
              </div>
            </template>
          </PlTooltip>
        </div>
        <PlElementList v-model:items="app.model.data.antigenControlConfig.controlConditionsOrder">
          <template #item-title="{ item }">
            {{ labelOf(item) }}
            <span v-if="unavailableControlConditions.has(item)" class="unavailable-value">
              not available
            </span>
          </template>
        </PlElementList>
        <PlBtnGhost
          v-if="availableToAddToControl.length > 0 || unavailableControlConditions.size > 0"
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
      v-if="
        app.model.data.antigenControlConfig.controlEnabled &&
        hasMultiSampleNegativeControl &&
        !(
          app.model.data.antigenControlConfig.sequencedLibraryEnabled === false &&
          app.model.data.antigenControlConfig.controlConditionsOrder.length === 1
        )
      "
    >
      <PlNumberField
        v-model="app.model.data.antigenControlConfig.controlThreshold"
        label="Control threshold"
        :minValue="0"
        :step="0.1"
        placeholder="1.0"
      >
        <template #tooltip>
          <div>
            Log2 Fold Change (Log2FC) thresholds used to define
            <strong>Enriched negative control sequences</strong>.<br />
            A sequence is considered enriched if its Log2FC value between conditions is equal or
            greater than the threshold. This threshold in combination with
            <strong>Enrichment threshold</strong> is used to define
            <strong>Binding Specificity</strong> categories: <br /><br />
            Target<sub>Max</sub> and Control<sub>Max</sub> are the maximum Log2FC values for the
            target and control conditions, respectively: <br /><br />
            - <strong>Antigen-Specific:</strong> Target<sub>Max</sub> ≥ Enrichment Threshold and
            Control<sub>Max</sub> &lt; Control Threshold.
            <br />
            - <strong>Non-Specific:</strong> Target<sub>Max</sub> ≥ Enrichment Threshold and
            Control<sub>Max</sub> ≥ Control Threshold (indicates "sticky" binders).
            <br />
            - <strong>Negative-Control:</strong> Target<sub>Max</sub> &lt; Enrichment Threshold and
            Control<sub>Max</sub> ≥ Control Threshold.
            <br />
            - <strong>Not-Enriched:</strong> Both below thresholds.
          </div>
        </template>
      </PlNumberField>
    </PlRow>

    <PlAccordionSection label="Downsampling">
      <PlBtnGroup
        v-model="app.model.data.downsampling.type"
        :options="downsamplingOptions"
        label="Downsampling options"
        :compact="true"
      >
        <template #tooltip>
          <div>
            <strong>Downsampling Strategy:</strong><br />
            Normalizes sequencing depth across samples to ensure fair comparison of diversity and
            abundance.
            <br /><br />
            <strong>None:</strong> Use raw abundance values. Recommended only if sequencing depth is
            already uniform.<br /><br />
            <strong>Random Sampling:</strong> Resamples all samples to a target read depth (total
            number of reads) while maintaining relative sequence proportions. Choose
            <strong>Fixed</strong> (manual), <strong>Min</strong> (smallest sample), or
            <strong>Auto</strong> to set the target depth.
          </div>
        </template>
      </PlBtnGroup>
      <PlBtnGroup
        v-if="app.model.data.downsampling.type === 'hypergeometric'"
        v-model="app.model.data.downsampling.valueChooser"
        style="margin-top: -18px"
        :options="[
          { value: 'fixed', label: 'Fixed' },
          { value: 'min', label: 'Min' },
          { value: 'auto', label: 'Auto' },
        ]"
      />

      <PlNumberField
        v-if="
          app.model.data.downsampling.type === 'hypergeometric' &&
          app.model.data.downsampling.valueChooser === 'fixed'
        "
        v-model="app.model.data.downsampling.n"
        label="Select N"
        :minValue="0"
        required
      />
    </PlAccordionSection>

    <PlAccordionSection label="Sequence Filtering">
      <PlRadioGroup v-model="app.model.data.FilteringConfig.baseFilter" :options="filteringOptions">
        <template #label>
          Based on condition overlap
          <PlTooltip class="info" :style="{ display: 'inline-block' }">
            <template #tooltip>
              <strong>Condition-based filtering strategy:</strong><br />
              <strong>No filtering:</strong> Analyze all sequences, including those specific to
              individual conditions (may include rare or condition-specific responses)<br /><br />
              <strong>Shared (all conditions):</strong> Focus only on sequences present in all
              conditions (Library excluded)<br /><br />
              <strong>Multiple conditions:</strong> Focus on sequences present in more than one
              condition (excludes condition-specific sequences that may represent noise or rare
              events)
            </template>
          </PlTooltip>
        </template>
      </PlRadioGroup>
      <PlCheckbox
        v-if="
          app.model.data.FilteringConfig.baseFilter === 'shared' &&
          app.model.data.antigenControlConfig.sequencedLibraryEnabled &&
          app.model.data.antigenControlConfig.sequencedLibraryAntigen !== undefined
        "
        v-model="app.model.data.FilteringConfig.excludeSequencedLibrary"
      >
        Exclude Sequenced Library
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              <strong>Exclude Library from Shared Filter</strong><br /><br />
              Libraries are often too diverse to be fully captured by sequencing. This option
              ensures enriched binders are not discarded just because they were stochastically
              missed in the Library sequencing.
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlCheckbox v-model="app.model.data.FilteringConfig.minAbundance.enabled">
        Based on abundance
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Remove sequences below a specific threshold based on their maximum abundance across
              all conditions. Filters sampling noise in display campaigns<br /><br />
              <strong>Counts:</strong> Filter by raw/downsampled number of reads (e.g., 100).<br />
              <strong>Frequency:</strong> Filter by fraction of reads aggregated across same
              condition samples (0 to 1.0).<br /><br />
              For <em>in vivo</em> studies with lower sequencing depth, consider lower values (10-50
              counts).
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlRow v-if="app.model.data.FilteringConfig.minAbundance.enabled">
        <PlNumberField
          v-if="app.model.data.FilteringConfig.minAbundance.metric === 'count'"
          v-model="app.model.data.FilteringConfig.minAbundance.threshold"
          label="Minimum abundance"
          :minValue="0"
          :step="1"
          placeholder="100"
        />
        <PlNumberField
          v-if="app.model.data.FilteringConfig.minAbundance.metric === 'frequency'"
          v-model="app.model.data.FilteringConfig.minAbundance.threshold"
          label="Minimum abundance"
          :minValue="0"
          :maxValue="1"
          :step="0.01"
          placeholder="0.1"
        />
        <PlDropdown
          v-model="app.model.data.FilteringConfig.minAbundance.metric"
          :options="[
            { value: 'count', label: 'Counts' },
            { value: 'frequency', label: 'Frequency' },
          ]"
          label="Metric"
        />
      </PlRow>
      <PlCheckbox v-model="app.model.data.FilteringConfig.presentInRounds.enabled">
        Based on specific conditions
        <PlTooltip class="info">
          <template #tooltip>
            <div>
              Filter sequences based on their occurrence across conditions.<br /><br />
              <strong>Present in any (OR):</strong> Keeps sequences detected in at least one of the
              selected conditions.<br />
              <strong>Present in all (AND):</strong> Only keeps sequences detected in every one of
              the selected conditions.<br /><br />
              Useful to focus on persistent sequences or those appearing in later selection
              conditions.
            </div>
          </template>
        </PlTooltip>
      </PlCheckbox>
      <PlRow v-if="app.model.data.FilteringConfig.presentInRounds.enabled">
        <PlDropdownMulti
          v-model="app.model.data.FilteringConfig.presentInRounds.rounds"
          label="Conditions"
          :options="conditionOrderOptions"
        />
        <PlDropdown
          v-model="app.model.data.FilteringConfig.presentInRounds.logic"
          :options="[
            { value: 'OR', label: 'Present in any (OR)' },
            { value: 'AND', label: 'Present in all (AND)' },
          ]"
          label="Logic"
        />
      </PlRow>
    </PlAccordionSection>

    <PlAccordionSection label="Advanced Settings">
      <PlNumberField
        v-model="app.model.data.pseudoCount"
        label="Pseudo-count"
        :minValue="1"
        :step="1"
        placeholder="1"
      >
        <template #tooltip>
          <p><strong>Pseudo-count (Default: 1)</strong></p>
          <p>
            A value added to all sequence counts to stabilize fold-change estimates and avoid
            division by zero.
          </p>
          <p>
            Increasing the pseudo-count reduces the impact of sampling noise and moderates extreme
            enrichment values. This is particularly useful for highly enriched sequences that are
            absent in the reference sample (e.g., in <strong>display campaigns</strong>).
          </p>
        </template>
      </PlNumberField>
      <PlNumberField
        v-if="
          app.model.data.antigenControlConfig.controlEnabled &&
          (hasSingleSampleNegativeControl ||
            (app.model.data.antigenControlConfig.sequencedLibraryEnabled === false &&
              app.model.data.antigenControlConfig.controlConditionsOrder.length === 1))
        "
        v-model="app.model.data.antigenControlConfig.singleControlFrequencyThreshold"
        label="Control Frequency Threshold"
        :minValue="0"
        :maxValue="1"
        :step="0.01"
        placeholder="0.01"
      >
        <template #tooltip>
          <div>
            <strong>Control Frequency Threshold</strong> (Default: 0.01)<br /><br />
            Minimum frequency required to consider a sequence "present" in the control sample during
            <strong>specificity classification</strong>.<br /><br />
            Sequences are only considered present in the control if their frequency is
            <strong>greater than or equal to</strong> this value. This prevents low-abundance noise
            in the control from affecting specificity classification.
          </div>
        </template>
      </PlNumberField>
      <PlDropdownMulti
        v-if="!isClusterId && !isWholeSequenceInput"
        v-model="app.model.data.clonotypeDefinition"
        :options="app.model.outputs.sequenceColumnOptions"
        label="Clonotype definition"
      >
        <template #tooltip>
          Select columns that define a clonotype. By default, it's a nucleotide sequence of the
          clonotype. Here you can override this behavior and calculate enrichment score based on
          e.g. amino acid sequence of CDR3.
        </template>
      </PlDropdownMulti>

      <PlDropdownMulti
        v-model="app.model.data.additionalEnrichmentExports"
        :options="comparisonOptions"
        :error="
          unavailableComparisons.length > 0
            ? `Not produced by the current condition order, so not exported: ${unavailableComparisons.join(
                ', ',
              )}`
            : undefined
        "
        missing-value-label="Comparison not available"
        label="Export specific comparisons"
      >
        <template #tooltip>
          <div>
            <strong>Export Specific Enrichment Comparisons</strong><br /><br />
            By default, the highest enrichment value across all comparisons is exported.
            <br /><br />
            This option allows you to select additional comparisons (e.g., "Treatment vs. Control")
            to be exported as separate columns. This is useful for downstream analysis where scores
            from specific comparisons are needed.
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
        <div
          style="
            color: #6b7280;
            font-size: 14px;
            margin-top: 4px;
            line-height: 1.2;
            margin-bottom: 0;
          "
        >
          Derived from each sequence's highest enrichment value among all comparisons
        </div>
      </div>
    </template>
    <div style="margin-top: 0px" v-html="createStatsTable()" />
  </PlDialogModal>
</template>

<style scoped>
.unavailable-value {
  margin-left: 8px;
  color: var(--txt-error);
  font-style: italic;
}
</style>
