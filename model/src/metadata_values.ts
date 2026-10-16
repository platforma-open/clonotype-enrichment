import type {
  AntigenControlConfig,
  FilteringConfig,
} from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import type {
  ColumnValueEntry,
  ColumnValueOption,
  PlRef,
  RenderCtxBase,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  deriveColumnValueOptions,
  getUniquePartitionKeys,
  isColumnValueId,
  parseColumnValueId,
  readColumnValues,
} from "@platforma-sdk/model";
import { listComparisons } from "./comparisons";
import { findMetadataColumns } from "./metadata_columns";

/**
 * A picked condition or antigen value: a column value id, or, when an earlier version of the
 * block picked it, the plain value — which no option carries, so it shows as not available.
 */
export type PickedValueOption = {
  value: string;
  label: string;
};

/**
 * Options of every condition and antigen picker, from the values of the picked columns among
 * the samples of the abundance input, and the picks no sample carries any more.
 */
export type MetadataValuePickers = {
  /**
   * The columns and the target the options were built for: they describe the picks only while
   * these stay picked.
   */
  computedFor: {
    conditionColumnRef: SUniversalPColumnId;
    antigenColumnRef: SUniversalPColumnId | undefined;
    targetAntigen: string | undefined;
  };
  /** Conditions the order can hold: all of them, or, with a target, those of its samples. */
  conditions: ColumnValueOption[];
  /** Conditions left out of `conditions` because no sample of the target has them. */
  conditionsExcludedByTarget: ColumnValueOption[];
  /** Conditions of the current order, for the present-in-rounds filter. */
  rounds: PickedValueOption[];
  /** Conditions of the samples of the negative controls. */
  controlConditions: ColumnValueOption[];
  /** Antigens that can be the target: present in at least two conditions, or any with a library. */
  targetAntigens: PickedValueOption[];
  negativeAntigens: PickedValueOption[];
  libraryAntigens: PickedValueOption[];
  /** Picked target and negative controls some of whose samples have no condition. */
  antigensWithEmptyConditions: ColumnValueOption[];
  /** Whether a negative control is present in a single condition, and in several. */
  negativeControls: { single: boolean; multi: boolean };
  /** Picks no sample of the abundance input carries, by the setting they are picked in. */
  unavailable: {
    conditions: PickedValueOption[];
    controlConditions: PickedValueOption[];
    targetAntigen: PickedValueOption | undefined;
    negativeAntigens: PickedValueOption[];
    libraryAntigen: PickedValueOption | undefined;
  };
};

/** The block data the value pickers are built from. */
export type MetadataPicks = {
  abundanceRef?: PlRef;
  conditionColumnRef?: SUniversalPColumnId;
  conditionOrder: string[];
  FilteringConfig: FilteringConfig;
  antigenControlConfig: AntigenControlConfig;
};

/**
 * Options of the condition and antigen pickers. The antigen column is read only while target
 * selection is on. `undefined` until the condition column is picked, and while a column to
 * read is still resolving or its data is not ready.
 */
export function getMetadataValuePickers(
  ctx: RenderCtxBase,
  data: MetadataPicks,
): MetadataValuePickers | undefined {
  const { abundanceRef, conditionColumnRef, antigenControlConfig: config } = data;
  if (abundanceRef === undefined || conditionColumnRef === undefined) return undefined;

  const samples = getSampleIds(ctx, abundanceRef);
  const conditionEntries = readMetadataValues(ctx, abundanceRef, conditionColumnRef, samples);
  if (conditionEntries === undefined) return undefined;

  const antigenColumnRef = config.antigenColumnRef;
  let antigenEntries: ColumnValueEntry[] | undefined;
  if (config.antigenEnabled && antigenColumnRef !== undefined) {
    antigenEntries = readMetadataValues(ctx, abundanceRef, antigenColumnRef, samples);
    if (antigenEntries === undefined) return undefined;
  }

  return buildPickers(data, {
    computedFor: { conditionColumnRef, antigenColumnRef, targetAntigen: config.targetAntigen },
    conditionEntries,
    antigenEntries,
  });
}

/** Comparisons the condition order produces, as options of the exported comparisons. */
export function getComparisonOptions(data: MetadataPicks): { value: string; label: string }[] {
  return listPickedComparisons(data).map((comparison) => ({
    value: comparison,
    label: comparison,
  }));
}

/** Comparisons the analysis computes for the condition order, as "numerator vs denominator". */
export function listPickedComparisons(data: MetadataPicks): string[] {
  return listComparisons(data.conditionOrder.map(pickLabel), {
    sequencedLibraryEnabled: data.antigenControlConfig.sequencedLibraryEnabled,
  });
}

// Internals

const SAMPLE_AXIS_NAME = "pl7.app/sampleId";

type ReadValues = {
  computedFor: MetadataValuePickers["computedFor"];
  conditionEntries: ColumnValueEntry[];
  antigenEntries: ColumnValueEntry[] | undefined;
};

function buildPickers(data: MetadataPicks, values: ReadValues): MetadataValuePickers {
  const config = data.antigenControlConfig;
  const { conditionEntries, antigenEntries } = values;
  const target = config.antigenEnabled ? config.targetAntigen : undefined;
  const negatives = config.controlEnabled ? config.negativeAntigens : [];
  const library =
    config.antigenEnabled && config.sequencedLibraryEnabled
      ? config.sequencedLibraryAntigen
      : undefined;

  const conditionBySample = new Map(conditionEntries.map((e) => [sampleOf(e), e]));
  const antigenOptions =
    antigenEntries === undefined ? [] : deriveColumnValueOptions(antigenEntries);
  const antigensInData = new Set<string>(antigenOptions.map((option) => option.value));

  // Conditions of the samples of each antigen.
  const conditionsByAntigen = new Map<string, ColumnValueEntry[]>();
  const antigensWithEmpty = new Set<string>();
  for (const antigen of antigenEntries ?? []) {
    const condition = conditionBySample.get(sampleOf(antigen));
    if (condition === undefined) {
      antigensWithEmpty.add(antigen.id);
      continue;
    }
    const conditions = conditionsByAntigen.get(antigen.id) ?? [];
    conditions.push(condition);
    conditionsByAntigen.set(antigen.id, conditions);
  }
  const conditionCount = (antigen: string) =>
    new Set(conditionsByAntigen.get(antigen)?.map((c) => c.id)).size;
  const conditionsOf = (antigens: readonly string[]) =>
    deriveColumnValueOptions(antigens.flatMap((a) => conditionsByAntigen.get(a) ?? []));

  const allConditions = deriveColumnValueOptions(conditionEntries);
  const conditions =
    antigenEntries !== undefined && target !== undefined ? conditionsOf([target]) : allConditions;
  const offeredConditions = new Set<string>(conditions.map((option) => option.value));
  const controlConditions = negatives.length > 0 ? conditionsOf(negatives) : [];
  const offeredControlConditions = new Set<string>(controlConditions.map((option) => option.value));

  // A pick still in the data stays among the options even when it no longer fits the rule.
  const keepPicked = (options: ColumnValueOption[], picked: string | undefined) =>
    picked !== undefined && antigensInData.has(picked) && !options.some((o) => o.value === picked)
      ? [toPickedOption(picked), ...options]
      : options;

  // With a library, every condition is compared against it, so one condition is enough.
  const libraryFallback =
    config.sequencedLibraryEnabled && config.sequencedLibraryAntigen !== undefined;
  const targetAntigens = keepPicked(
    antigenOptions.filter(
      ({ value }) =>
        value !== config.sequencedLibraryAntigen && (conditionCount(value) >= 2 || libraryFallback),
    ),
    config.targetAntigen,
  );
  const negativeAntigens = antigenOptions.filter(
    ({ value }) => value !== config.targetAntigen || config.negativeAntigens.includes(value),
  );
  const libraryAntigens = keepPicked(
    antigenOptions.filter(
      ({ value }) => value !== config.targetAntigen && !config.negativeAntigens.includes(value),
    ),
    config.sequencedLibraryAntigen,
  );

  const checkedForEmpty = [...(target === undefined ? [] : [target]), ...negatives];
  const missingFromData = (picked: string | undefined) =>
    picked !== undefined && antigenEntries !== undefined && !antigensInData.has(picked)
      ? toPickedOption(picked)
      : undefined;

  return {
    computedFor: values.computedFor,
    conditions,
    conditionsExcludedByTarget: allConditions.filter(({ value }) => !offeredConditions.has(value)),
    rounds: data.conditionOrder.map(toPickedOption),
    controlConditions,
    targetAntigens,
    negativeAntigens,
    libraryAntigens,
    antigensWithEmptyConditions: antigenOptions.filter(
      ({ value }) => antigensWithEmpty.has(value) && checkedForEmpty.includes(value),
    ),
    negativeControls: {
      single: negatives.some((a) => conditionCount(a) === 1),
      multi: negatives.some((a) => conditionCount(a) > 1),
    },
    unavailable: {
      conditions: data.conditionOrder.filter((c) => !offeredConditions.has(c)).map(toPickedOption),
      controlConditions: config.controlEnabled
        ? config.controlConditionsOrder
            .filter((c) => !offeredControlConditions.has(c))
            .map(toPickedOption)
        : [],
      targetAntigen: missingFromData(target),
      negativeAntigens:
        antigenEntries === undefined
          ? []
          : negatives.filter((a) => !antigensInData.has(a)).map(toPickedOption),
      libraryAntigen: missingFromData(library),
    },
  };
}

/**
 * Values of a picked metadata column among `samples`, or among all samples when they are not
 * known. A column that is not among the metadata columns of a settled result pool has no
 * values; `undefined` while the pool or the column's data is still resolving.
 */
function readMetadataValues(
  ctx: RenderCtxBase,
  abundanceRef: PlRef,
  columnRef: SUniversalPColumnId,
  samples: Set<string> | undefined,
): ColumnValueEntry[] | undefined {
  const source = findMetadataColumns(ctx, abundanceRef);
  if (source === undefined) return undefined;
  const column = source.columns.find((c) => c.id === columnRef);
  if (column === undefined) return source.isFinal ? [] : undefined;
  const entries = readColumnValues(column);
  if (entries === undefined || samples === undefined) return entries;
  return entries.filter((entry) => samples.has(sampleOf(entry)));
}

/**
 * Samples of the abundance input, read from the partition keys of the abundance column at its
 * sample axis — not from the upstream dataset's `pl7.app/axisKeys/0` annotation, which carries
 * `sampleGroupId` for `MultiplexedFastq`. `undefined` when they cannot be listed.
 */
function getSampleIds(ctx: RenderCtxBase, abundanceRef: PlRef): Set<string> | undefined {
  const column = ctx.resultPool.getPColumnByRef(abundanceRef);
  if (column === undefined) return undefined;
  const sampleAxisIdx = column.spec.axesSpec.findIndex((axis) => axis.name === SAMPLE_AXIS_NAME);
  if (sampleAxisIdx < 0) return undefined;
  const keysPerAxis = getUniquePartitionKeys(column.data);
  if (keysPerAxis === undefined || sampleAxisIdx >= keysPerAxis.length) return undefined;
  const samples = new Set(keysPerAxis[sampleAxisIdx].map(String));
  return samples.size > 0 ? samples : undefined;
}

function sampleOf(entry: ColumnValueEntry): string {
  return String(entry.key[0]);
}

function toPickedOption(picked: string): PickedValueOption {
  return { value: picked, label: pickLabel(picked) };
}

function pickLabel(picked: string): string {
  return isColumnValueId(picked) ? String(parseColumnValueId(picked).value) : picked;
}
