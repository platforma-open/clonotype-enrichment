<script setup lang="ts">
// Settings shown instead of the condition / antigen settings when a design is
// selected in the abundance dropdown (draft). Everything the design answers is
// not asked: only the comparison, the controls and, where trajectories end
// in different pieces of one separation, the target piece.
import type {
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
import { computed, shallowRef, watchEffect } from "vue";
import { useApp } from "../app";
import EnrichmentThreshold from "./EnrichmentThreshold.vue";

const app = useApp();
const view = computed(() => app.model.outputs.designView);

/**
 * `designView` is an output, so it reads as undefined for as long as the model takes to rebuild
 * it, and every setting here is a change that triggers a rebuild. Taken straight, the fields would
 * empty out on each click and come back when the output lands. These keep the last list the model
 * gave: the settings stay put, and are replaced the moment a new list arrives.
 */
function sticky<T>(pick: () => readonly T[] | undefined) {
  const last = shallowRef<readonly T[]>([]);
  watchEffect(() => {
    const next = pick();
    if (next !== undefined) last.value = next;
  });
  return last;
}

const comparisons = sticky(() => view.value?.comparisons);
const comparisonOptions = computed(() =>
  comparisons.value.map((c) => ({
    value: c.value,
    label: c.label,
    group: c.kind === "panel" ? "Panels" : "Paths",
  })),
);

/** One checkbox per end point, control or not, so a control can be unticked again. */
const ends = sticky(() => view.value?.plan?.ends);
const endOptions = computed(() => ends.value.map(({ end, name }) => ({ value: end, label: name })));

const controlEnds = computed({
  get: () => app.model.data.designControlEnds ?? [],
  set: (v: string[]) => (app.model.data.designControlEnds = v),
});

/** No control at all, or the ticked end points taken together as the background to subtract. */
const controlMode = computed({
  get: () => designControlMode(app.model.data),
  set: (v: DesignControlMode) => (app.model.data.designControlMode = v),
});
const controlModeOptions = [
  { value: "none" as const, label: "No controls" },
  { value: "pooled" as const, label: "Negative controls" },
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
const endpoints = sticky(() => view.value?.plan?.scores);

function setThreshold(end: string, value: number | undefined) {
  const next = { ...(app.model.data.designThresholds ?? {}) };
  if (value === undefined) delete next[end];
  else next[end] = value;
  app.model.data.designThresholds = next;
}

/** The target-fraction questions blink with everything else, so they are kept the same way. */
const questions = sticky(() => view.value?.questions);
</script>

<template>
  <!-- A choice only when the design offers more than one comparison; else a read-only summary -->
  <!-- Only where the design holds more than one: with a single comparison there is nothing to pick
       and nothing to say, since Samples & Data has already shown what the design is. -->
  <PlDropdown
    v-if="comparisonOptions.length > 1"
    v-model="app.model.data.designComparison"
    :options="comparisonOptions"
    label="Comparison"
    required
  />

  <template v-if="endOptions.length > 0">
    <PlBtnGroup v-model="controlMode" :options="controlModeOptions" label="Control" :compact="true">
      <template #tooltip>
        Enables specificity analysis by comparing your target against control end points.<br /><br />
        You can select multiple negative controls (e.g. irrelevant antigens). The analysis
        calculates enrichment for each one independently and subtracts the
        <strong>maximum value</strong> found across all controls, as a baseline for background
        binding. This discounts "sticky" or non-specific sequences that appear in your controls.
      </template>
    </PlBtnGroup>
    <PlCheckboxGroup
      v-if="controlMode === 'pooled'"
      v-model="controlEnds"
      :options="endOptions"
      label="Control end points"
    />
  </template>

  <PlDropdown
    v-for="q in questions"
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
      The cutoff is the Log2FC a sequence has to reach to count as enriched. End points can run
      through a different number of rounds, or start from a different baseline, so the same fold
      change does not mean the same thing in all of them. Per end point gives each one its own
      cutoff, each starting at the global one until you change it.
    </template>
  </PlBtnGroup>
  <EnrichmentThreshold v-if="thresholdMode === 'global'" />
  <template v-else>
    <PlNumberField
      v-for="e in endpoints"
      :key="e.end"
      :model-value="app.model.data.designThresholds?.[e.end] ?? app.model.data.enrichmentThreshold"
      :label="e.endName || e.label"
      :min-value="0.6"
      :step="0.1"
      @update:model-value="(v: number | undefined) => setThreshold(e.end, v)"
    />
  </template>

  <PlAlert v-if="view?.error" type="warn" icon>{{ view.error }}</PlAlert>
</template>
