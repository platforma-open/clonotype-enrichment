<script setup lang="ts">
// Settings shown instead of the condition / antigen settings when a design is
// selected in the abundance dropdown (draft). Everything the design answers is
// not asked: only the comparison, the control arms and, where trajectories end
// in different pieces of one separation, the target piece.
import { PlAlert, PlCheckboxGroup, PlDropdown } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

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

function setTarget(partition: string, value: string | undefined) {
  const next = { ...(app.model.data.designTargetPieces ?? {}) };
  if (value === undefined) delete next[partition];
  else next[partition] = value;
  app.model.data.designTargetPieces = next;
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
    <div class="design-label">Control arms</div>
    <PlCheckboxGroup v-model="controlArms" :options="armOptions" />
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

  <PlAlert v-if="view?.error" type="warn" icon>{{ view.error }}</PlAlert>
  <div v-else-if="view?.plan" class="design-note">
    {{ view.plan.comparisons.length }} comparisons, {{ view.plan.scores.length }} score column(s)
    from {{ view.designName }}.
  </div>
</template>

<style scoped>
.design-label {
  font-weight: 500;
  margin-bottom: -8px;
}
.design-note {
  color: var(--txt-03, #6b6b7b);
  font-size: 13px;
}
</style>
