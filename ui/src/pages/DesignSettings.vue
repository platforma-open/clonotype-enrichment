<script setup lang="ts">
// Settings shown instead of the condition / antigen settings when a design is
// selected in the abundance dropdown (draft). Everything the design answers is
// not asked: only the comparison, the control arms and, where trajectories end
// in different pieces of one separation, the target piece.
import type {
  DesignBaselineMode,
  DesignControlMode,
  DesignThresholdMode,
} from "@platforma-open/milaboratories.clonotype-enrichment.model";
import { designControlMode } from "@platforma-open/milaboratories.clonotype-enrichment.model";
import {
  PlAccordionSection,
  PlAlert,
  PlBtnGroup,
  PlCheckboxGroup,
  PlDropdown,
  PlNumberField,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";
import EnrichmentThreshold from "./EnrichmentThreshold.vue";

const app = useApp();
const view = computed(() => app.model.outputs.designView);

const comparisonOptions = computed(() =>
  (view.value?.comparisons ?? []).map((c) => ({
    value: c.value,
    label: c.label,
    group: c.kind === "panel" ? "Panels" : "Paths",
  })),
);

/** One checkbox per arm, labelled by its name. */
const armOptions = computed(() =>
  (view.value?.arms ?? []).map(({ split, name }) => ({ value: split, label: name })),
);

const controlArms = computed({
  get: () => app.model.data.designControlArms ?? [],
  set: (v: string[]) => (app.model.data.designControlArms = v),
});

/** No control at all, or every ticked end point pooled into one veto. */
const controlMode = computed({
  get: () => designControlMode(app.model.data),
  set: (v: DesignControlMode) => (app.model.data.designControlMode = v),
});
const controlModeOptions = [
  { value: "none" as const, label: "No control" },
  { value: "pooled" as const, label: "Pooled control" },
];

function setTarget(partition: string, value: string | undefined) {
  const next = { ...(app.model.data.designTargetPieces ?? {}) };
  if (value === undefined) delete next[partition];
  else next[partition] = value;
  app.model.data.designTargetPieces = next;
}

/** One cutoff for the run, or one per end point. The run's own field stays in the main settings. */
const thresholdMode = computed({
  get: () => app.model.data.designThresholdMode ?? "global",
  set: (v: DesignThresholdMode) => (app.model.data.designThresholdMode = v),
});
const thresholdModeOptions = [
  { value: "global" as const, label: "Global" },
  { value: "endpoint" as const, label: "Per end point" },
];
/** One field per end point, falling back to the run's cutoff until it is given its own. */
const endpoints = computed(() => view.value?.plan?.scores ?? []);

function setThreshold(end: string, value: number | undefined) {
  const next = { ...(app.model.data.designThresholds ?? {}) };
  if (value === undefined) delete next[end];
  else next[end] = value;
  app.model.data.designThresholds = next;
}

/** Each end point is measured against the material it came from; these override that choice. */
const baselines = computed(() => view.value?.plan?.baselines ?? []);

/** Inferred for every end point, or set by hand. Overrides already made survive switching back. */
const baselineMode = computed({
  get: () =>
    app.model.data.designBaselineMode ??
    (Object.keys(app.model.data.designBaselines ?? {}).length ? "endpoint" : "inferred"),
  set: (v: DesignBaselineMode) => (app.model.data.designBaselineMode = v),
});
const baselineModeOptions = [
  { value: "inferred" as const, label: "From the design" },
  { value: "endpoint" as const, label: "Per end point" },
];

function setBaseline(end: string, value: string | undefined) {
  const next = { ...(app.model.data.designBaselines ?? {}) };
  if (value === undefined) delete next[end];
  else next[end] = value;
  app.model.data.designBaselines = next;
}
</script>

<template>
  <!-- A choice only when the design offers more than one comparison; else a read-only summary -->
  <PlDropdown
    v-if="comparisonOptions.length > 1"
    v-model="app.model.data.designComparison"
    :options="comparisonOptions"
    label="Comparison"
    required
  />
  <template v-else-if="comparisonOptions.length === 1">
    <div class="design-label">Comparison</div>
    <div>{{ comparisonOptions[0].label }}</div>
  </template>

  <template v-if="armOptions.length > 0">
    <PlBtnGroup v-model="controlMode" :options="controlModeOptions" label="Control" :compact="true">
      <template #tooltip>
        A pooled control is one veto: an end point only counts as a hit where no control it is
        judged against came up enriched too.
      </template>
    </PlBtnGroup>
    <PlCheckboxGroup
      v-if="controlMode === 'pooled'"
      v-model="controlArms"
      :options="armOptions"
      label="Control arms"
    />
  </template>

  <PlDropdown
    v-for="q in view?.questions ?? []"
    :key="q.partition"
    :model-value="app.model.data.designTargetPieces?.[q.partition]"
    :options="q.options"
    :label="q.label"
    required
    @update:model-value="(v: string | undefined) => setTarget(q.partition, v)"
  />

  <PlBtnGroup
    v-if="endpoints.length > 1"
    v-model="thresholdMode"
    :options="thresholdModeOptions"
    label="Enrichment cutoff"
    :compact="true"
  >
    <template #tooltip>
      Rounds, stringency and baseline differ between end points, so one cutoff does not always suit
      all of them.
    </template>
  </PlBtnGroup>
  <EnrichmentThreshold v-if="thresholdMode === 'global'" />
  <template v-else>
    <PlNumberField
      v-for="e in endpoints"
      :key="e.end"
      :model-value="app.model.data.designThresholds?.[e.end] ?? app.model.data.enrichmentThreshold"
      :label="e.endName"
      :min-value="0.6"
      :step="0.1"
      @update:model-value="(v: number | undefined) => setThreshold(e.end, v)"
    />
  </template>

  <PlBtnGroup
    v-if="baselines.length > 0"
    v-model="baselineMode"
    :options="baselineModeOptions"
    label="Baseline"
    :compact="true"
  >
    <template #tooltip>
      Each end point is measured against the material it came from: a panel's sequenced anchor, or a
      time course's own first collection. Set them by hand where that is not what was done.
    </template>
  </PlBtnGroup>
  <template v-if="baselineMode === 'endpoint'">
    <PlDropdown
      v-for="bl in baselines"
      :key="bl.end"
      :model-value="bl.current"
      :options="bl.options"
      :label="bl.label"
      required
      @update:model-value="(v: string | undefined) => setBaseline(bl.end, v)"
    />
  </template>

  <PlAlert v-if="view?.error" type="warn" icon>{{ view.error }}</PlAlert>
</template>

<style scoped>
.design-label {
  font-weight: 500;
  margin-bottom: -8px;
}
</style>
