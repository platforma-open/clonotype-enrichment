<script lang="ts" setup>
// The run's enrichment cutoff. Lives in its own file so design mode can show it under the
// "Global vs per end point" selector while classic mode keeps it with the other settings.
import { PlNumberField } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";

const app = useApp();
</script>

<template>
  <PlNumberField
    v-model="app.model.data.enrichmentThreshold"
    label="Enrichment threshold"
    :minValue="0.6"
    :step="0.1"
    placeholder="2.0"
    :error-message="
      app.model.data.enrichmentThreshold === undefined ? 'Value must be higher than 0.6' : undefined
    "
  >
    <template #tooltip>
      <p><strong>Enrichment threshold (E<sub>thres</sub>)</strong></p>
      <p>
        Log2 Fold Change (Log2FC) used to define enriched sequences. A sequence is considered
        enriched when its Log2FC between conditions is ≥ this value.
      </p>
      <p>
        This value is used to define <strong>Enrichment quality</strong> categories in combination
        to data-derived percentiles (q):
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
</template>
