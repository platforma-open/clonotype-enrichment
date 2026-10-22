import type {
  AntigenControlConfig,
  FilteringConfig,
} from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import type {
  ColumnUniversalId,
  ColumnValueId,
  ColumnValueOption,
  PFrameHandle,
  PObjectId,
  RenderCtxBase,
} from "@platforma-sdk/model";
import {
  columnValueLabel,
  ColumnRecipe,
  createColumnValueId,
  deriveColumnValueOptions,
  extractPObjectId,
  getUniquePartitionKeys,
  hasReachableData,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import { findColumn } from "./columns";
import { listComparisons } from "./comparisons";

/** A picked condition or antigen value: a column value id of the condition or antigen column. */
export type PickedValueOption = {
  value: ColumnValueId;
  label: string;
};

/**
 * Options of every condition and antigen picker, from the values of the picked columns, and the
 * picks no sample carries any more.
 */
export type MetadataValuePickers = {
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
  /**
   * Whether a negative control is present in a single condition, and in several; `undefined`
   * while target selection is off.
   */
  negativeControls: undefined | { single: boolean; multi: boolean };
  /** Picks no sample carries, by the setting they are picked in. */
  unavailable: {
    conditions: PickedValueOption[];
    controlConditions: PickedValueOption[];
    libraryAntigen: PickedValueOption | undefined;
  };
};

/** The block data the value pickers are built from. */
export type MetadataPicks = {
  abundanceRef?: ColumnUniversalId;
  conditionColumnRef?: ColumnUniversalId;
  conditionOrder: ColumnValueId[];
  FilteringConfig: FilteringConfig;
  antigenControlConfig: AntigenControlConfig;
};

/**
 * Where the UI reads the values of a picked metadata column from: a frame of the column alone,
 * while the column is there. `column` is the pick the frame was made for, so the UI can tell one
 * that still describes an earlier pick; `frameColumn` is the column as the frame holds it.
 */
export type MetadataColumnFrame =
  | { readonly type: "resolving"; readonly column: ColumnUniversalId }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent"; readonly column: ColumnUniversalId }
  | {
      readonly type: "present";
      readonly column: ColumnUniversalId;
      readonly frame: PFrameHandle;
      readonly frameColumn: PObjectId;
    };

/** The value of a metadata column at one sample. */
export type SampleValue = {
  sample: string;
  value: string;
};

/** Values of a metadata column, one row per sample that has one. */
export type SampleValues = {
  column: ColumnUniversalId;
  rows: readonly SampleValue[];
};

/** Conditions of the samples of each antigen, among the samples of the abundance input. */
export type AntigenConditions = {
  conditionColumn: ColumnUniversalId;
  /** Distinct conditions of the samples of each antigen, by the antigen's value id. */
  conditionsByAntigen: ReadonlyMap<ColumnValueId, readonly string[]>;
  /** Antigens some of whose samples have no condition. */
  antigensWithEmptyConditions: ReadonlySet<ColumnValueId>;
};

/** The values the pickers are built from, among the samples of the abundance input. */
export type MetadataValues = {
  /** Options of the condition column. */
  conditions: ColumnValueOption[];
  /**
   * Options of the antigen column and the conditions of its samples; `undefined` while target
   * selection is off.
   */
  antigens: undefined | { options: ColumnValueOption[]; conditions: AntigenConditions };
};

/**
 * Where the UI reads the values of the picked condition column from; `undefined` until it is
 * picked.
 */
export function getConditionValuesSource(
  ctx: RenderCtxBase,
  data: MetadataPicks,
): MetadataColumnFrame | undefined {
  const column = data.conditionColumnRef;
  return column === undefined ? undefined : metadataColumnFrame(ctx, column);
}

/**
 * Where the UI reads the values of the picked antigen column from, while target selection is on;
 * `undefined` otherwise.
 */
export function getAntigenValuesSource(
  ctx: RenderCtxBase,
  data: MetadataPicks,
): MetadataColumnFrame | undefined {
  const { antigenEnabled, antigenColumnRef } = data.antigenControlConfig;
  return antigenEnabled && antigenColumnRef !== undefined
    ? metadataColumnFrame(ctx, antigenColumnRef)
    : undefined;
}

/**
 * Samples of the abundance input, read from the partition keys of the abundance column at its
 * sample axis — not from the upstream dataset's `pl7.app/axisKeys/0` annotation, which carries
 * `sampleGroupId` for `MultiplexedFastq`. `undefined` when they cannot be listed.
 */
export function getAbundanceSamples(data: MetadataPicks): string[] | undefined {
  const { abundanceRef } = data;
  if (abundanceRef === undefined) return undefined;
  const column = findColumn(abundanceRef);
  if (column === undefined || !hasReachableData(column)) return undefined;
  const columnData = column.getData();
  if (!(columnData instanceof TreeNodeAccessor)) return undefined;
  const sampleAxisIdx = column
    .getSpec()
    .axesSpec.findIndex((axis) => axis.name === SAMPLE_AXIS_NAME);
  if (sampleAxisIdx < 0) return undefined;
  const keysPerAxis = getUniquePartitionKeys(columnData);
  if (keysPerAxis === undefined || sampleAxisIdx >= keysPerAxis.length) return undefined;
  const samples = [...new Set(keysPerAxis[sampleAxisIdx].map(String))];
  return samples.length > 0 ? samples : undefined;
}

/**
 * The values the pickers are built from: those of the condition column, and of the antigen column
 * while target selection is on (`antigens` given), paired by sample. Only `samples` count, or all
 * of them when they are not known — before the abundance input is computed, say. An empty value is
 * no value.
 */
export function deriveMetadataValues(params: {
  conditions: SampleValues;
  antigens: SampleValues | undefined;
  samples: readonly string[] | undefined;
}): MetadataValues {
  const { conditions, antigens, samples } = params;
  const counts = countsSample(samples);
  return {
    conditions: deriveColumnValueOptions(conditions.column, valuesAt(conditions, counts)),
    antigens:
      antigens === undefined
        ? undefined
        : {
            options: deriveColumnValueOptions(antigens.column, valuesAt(antigens, counts)),
            conditions: pairConditionsWithAntigens({ conditions, antigens, samples }),
          },
  };
}

/**
 * Pairs the condition and the antigen of each sample. Only `samples` count, or all of them when
 * they are not known. An empty value is no value.
 */
export function pairConditionsWithAntigens(params: {
  conditions: SampleValues;
  antigens: SampleValues;
  samples: readonly string[] | undefined;
}): AntigenConditions {
  const { conditions, antigens } = params;
  const counts = countsSample(params.samples);

  const conditionBySample = new Map<string, string>();
  for (const { sample, value } of conditions.rows) {
    if (value !== "" && counts(sample)) conditionBySample.set(sample, value);
  }

  const conditionsByAntigen = new Map<ColumnValueId, Set<string>>();
  const antigensWithEmptyConditions = new Set<ColumnValueId>();
  for (const { sample, value } of antigens.rows) {
    if (value === "" || !counts(sample)) continue;
    const antigen = createColumnValueId({ column: antigens.column, value });
    const condition = conditionBySample.get(sample);
    if (condition === undefined) {
      antigensWithEmptyConditions.add(antigen);
      continue;
    }
    const antigenConditions = conditionsByAntigen.get(antigen) ?? new Set<string>();
    antigenConditions.add(condition);
    conditionsByAntigen.set(antigen, antigenConditions);
  }

  return {
    conditionColumn: conditions.column,
    conditionsByAntigen: new Map(
      [...conditionsByAntigen].map(([antigen, values]) => [antigen, [...values]]),
    ),
    antigensWithEmptyConditions,
  };
}

/** Options of the condition and antigen pickers, from the values read for the picked columns. */
export function buildMetadataValuePickers(
  data: MetadataPicks,
  values: MetadataValues,
): MetadataValuePickers {
  const config = data.antigenControlConfig;
  const { antigens } = values;
  const pairing = antigens?.conditions;
  const target = config.antigenEnabled ? config.targetAntigen : undefined;
  const negatives = config.controlEnabled ? config.negativeAntigens : [];
  const library =
    config.antigenEnabled && config.sequencedLibraryEnabled
      ? config.sequencedLibraryAntigen
      : undefined;

  const antigenOptions = antigens?.options ?? [];
  const antigensInData = new Set<string>(antigenOptions.map((option) => option.value));
  const conditionCount = (antigen: ColumnValueId) =>
    pairing?.conditionsByAntigen.get(antigen)?.length ?? 0;

  const conditions =
    pairing !== undefined && target !== undefined
      ? conditionsOf(pairing, [target])
      : values.conditions;
  const offeredConditions = new Set<string>(conditions.map((option) => option.value));
  const conditionsExcludedByTarget =
    pairing !== undefined && target !== undefined
      ? values.conditions.filter(({ value }) => !offeredConditions.has(value))
      : [];
  const controlConditions =
    pairing !== undefined && negatives.length > 0 ? conditionsOf(pairing, negatives) : [];
  const offeredControlConditions = new Set<string>(controlConditions.map((option) => option.value));

  // A pick still in the data stays among the options even when it no longer fits the rule.
  const keepPicked = (options: ColumnValueOption[], picked: ColumnValueId | undefined) =>
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
  const missingFromData = (picked: ColumnValueId | undefined) =>
    picked !== undefined && antigens !== undefined && !antigensInData.has(picked)
      ? toPickedOption(picked)
      : undefined;

  return {
    conditions,
    conditionsExcludedByTarget,
    rounds: data.conditionOrder.map(toPickedOption),
    controlConditions,
    targetAntigens,
    negativeAntigens,
    libraryAntigens,
    antigensWithEmptyConditions: antigenOptions.filter(
      ({ value }) =>
        pairing !== undefined &&
        pairing.antigensWithEmptyConditions.has(value) &&
        checkedForEmpty.includes(value),
    ),
    negativeControls:
      antigens === undefined
        ? undefined
        : {
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
      libraryAntigen: missingFromData(library),
    },
  };
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
  return listComparisons(data.conditionOrder.map(columnValueLabel), {
    sequencedLibraryEnabled: data.antigenControlConfig.sequencedLibraryEnabled,
  });
}

// Internals

const SAMPLE_AXIS_NAME = "pl7.app/sampleId";

/** A frame of `column` alone, while the column and its frame are there. */
function metadataColumnFrame(ctx: RenderCtxBase, column: ColumnUniversalId): MetadataColumnFrame {
  const status = ColumnRecipe.getStatus(column);
  if (status !== "present") return { type: status, column };
  const frame = ctx.createPFrame([column]);
  if (frame === undefined) return { type: "resolving", column };
  // The frame holds a column by the bare id of its leaf.
  return { type: "present", column, frame, frameColumn: extractPObjectId(column) };
}

/** Whether a sample counts: one of `samples`, or any when they are not known. */
function countsSample(samples: readonly string[] | undefined): (sample: string) => boolean {
  if (samples === undefined) return () => true;
  const counted = new Set(samples);
  return (sample) => counted.has(sample);
}

/** Values of `column` at the samples that count. */
function valuesAt(column: SampleValues, counts: (sample: string) => boolean): string[] {
  return column.rows.filter(({ sample }) => counts(sample)).map(({ value }) => value);
}

/** Distinct conditions of the samples of `antigens`, as options. */
function conditionsOf(
  pairing: AntigenConditions,
  antigens: readonly ColumnValueId[],
): ColumnValueOption[] {
  return deriveColumnValueOptions(
    pairing.conditionColumn,
    antigens.flatMap((antigen) => pairing.conditionsByAntigen.get(antigen) ?? []),
  );
}

function toPickedOption(picked: ColumnValueId): PickedValueOption {
  return { value: picked, label: columnValueLabel(picked) };
}
