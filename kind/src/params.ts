import { assertParamsObject } from "@platforma-sdk/block-kind";
import {
  isAnchoredPColumnId,
  isColumnUniversalId,
  isPlRef,
  parseJsonSafely,
  type SUniversalPColumnId,
} from "@platforma-sdk/model";
import { isBoolean, isPlainObject, isString } from "es-toolkit";
import type {
  AntigenControlConfig,
  BlockParams,
  DownsamplingParameters,
  FilteringConfig,
} from "./types";

/**
 * The contract at runtime, for params that arrive from a template file rather
 * than from typed code.
 *
 * Each field the contract names is read and checked; a key it does not name is
 * dropped by never being read, so it needs no rejection here. Params written
 * against a different version of the contract are caught by the version in the
 * template entry's `{name}@{selector}` reference, not by a key-set check.
 */
export function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: Record<string, unknown> = {};
  for (const [field, { is, must }] of Object.entries(CONTRACT)) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (!is(raw)) throw new Error(`'${field}' must be ${must}.`);
    params[field] = raw;
  }
  // Every value placed here passed its own field's guard, and `CONTRACT` is
  // proven exhaustive over `BlockParams` by the `satisfies` below.
  return params as BlockParams;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type Guard<T> = (value: unknown) => value is T;

/** A guard plus how to finish the sentence "'field' must be …". */
type Check<T> = { readonly is: Guard<T>; readonly must: string };

function check<T>(is: Guard<T>, must: string): Check<T> {
  return { is, must };
}

/** `Number.isFinite` already rejects non-numbers; this only adds the narrowing. */
const isNumber: Guard<number> = (v): v is number => Number.isFinite(v);

function oneOf<T extends string>(...allowed: readonly T[]): Guard<T> {
  return (v): v is T => allowed.includes(v as T);
}

function arrayOf<T>(item: Guard<T>): Guard<T[]> {
  return (v): v is T[] => Array.isArray(v) && v.every((e) => item(e));
}

/** Lifts a guard over a field the type declares optional. */
function optional<T>(item: Guard<T>): Guard<T | undefined> {
  return (v): v is T | undefined => v === undefined || item(v);
}

/**
 * A column identifier as this block stores it: a canonically serialized JSON
 * key. `isColumnUniversalId` covers the four key forms the SDK's id encoding
 * uses, but every column id here comes from `resultPool.getCanonicalOptions`,
 * which mints an *anchored* key — a shape none of those four recognizes even
 * though the SDK types it `SUniversalPColumnId`. Both forms are accepted, or
 * the kind would refuse ids the block itself writes.
 */
const isColumnId: Guard<SUniversalPColumnId> = (v): v is SUniversalPColumnId =>
  isString(v) && (isColumnUniversalId(v) || isAnchoredPColumnId(parseJsonSafely(v)));

const isDownsampling: Guard<DownsamplingParameters> = (v): v is DownsamplingParameters =>
  isPlainObject(v) &&
  optional(oneOf("none", "hypergeometric"))(v.type) &&
  optional(oneOf("min", "fixed", "auto"))(v.valueChooser) &&
  optional(isNumber)(v.n);

const isFilteringConfig: Guard<FilteringConfig> = (v): v is FilteringConfig =>
  isPlainObject(v) &&
  oneOf("none", "shared", "single-sample")(v.baseFilter) &&
  isPlainObject(v.minAbundance) &&
  isBoolean(v.minAbundance.enabled) &&
  isNumber(v.minAbundance.threshold) &&
  oneOf("count", "frequency")(v.minAbundance.metric) &&
  isPlainObject(v.presentInRounds) &&
  isBoolean(v.presentInRounds.enabled) &&
  arrayOf(isString)(v.presentInRounds.rounds) &&
  oneOf("OR", "AND")(v.presentInRounds.logic) &&
  isBoolean(v.excludeSequencedLibrary);

const isAntigenControlConfig: Guard<AntigenControlConfig> = (v): v is AntigenControlConfig =>
  isPlainObject(v) &&
  isBoolean(v.antigenEnabled) &&
  isBoolean(v.controlEnabled) &&
  optional(isColumnId)(v.antigenColumnRef) &&
  optional(isString)(v.targetAntigen) &&
  arrayOf(isString)(v.negativeAntigens) &&
  isNumber(v.controlThreshold) &&
  isNumber(v.singleControlFrequencyThreshold) &&
  arrayOf(isString)(v.controlConditionsOrder) &&
  isBoolean(v.sequencedLibraryEnabled) &&
  optional(isString)(v.sequencedLibraryAntigen) &&
  isBoolean(v.hasSingleConditionNegativeControl) &&
  isBoolean(v.hasMultiConditionNegativeControl);

const REF = "a reference to another block's output";
const COLUMN_ID = "a serialized column id";

/**
 * The contract, field by field, at runtime.
 *
 * The `satisfies` clause is the drift guard: it demands an entry for every key
 * `BlockParams` declares, and types each guard against that key's own type. Add
 * a field to the contract and this stops compiling until the check exists —
 * which matters here because every field is optional, so a parser that simply
 * forgot one would otherwise return a valid `BlockParams` and say nothing.
 */
const CONTRACT = {
  abundanceRef: check(isPlRef, REF),

  conditionColumnRef: check(isColumnId, COLUMN_ID),
  conditionOrder: check(arrayOf(isString), "an array of strings"),
  clonotypeDefinition: check(arrayOf(isColumnId), "an array of serialized column ids"),
  downsampling: check(
    isDownsampling,
    "an object of optional type / valueChooser / n downsampling settings",
  ),
  FilteringConfig: check(isFilteringConfig, "a filtering configuration object"),
  antigenControlConfig: check(
    isAntigenControlConfig,
    "an antigen and control configuration object",
  ),
  enrichmentThreshold: check(isNumber, "a number"),
  pseudoCount: check(isNumber, "a number"),
  additionalEnrichmentExports: check(arrayOf(isString), "an array of strings"),

  defaultBlockLabel: check(isString, "a string"),
  customBlockLabel: check(isString, "a string"),
} satisfies { [K in keyof BlockParams]-?: Check<NonNullable<BlockParams[K]>> };
