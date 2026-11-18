import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  createColumnValueId,
  createGlobalPObjectId,
  createPlDataTableStateV2,
  getStorageData,
  normalizeBlockStorage,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";

const callbackRegistry: Record<string, (storageJson: string) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

const ref = (blockId: string, name: string) => ({ __isRef: true, blockId, name });

/** A column id as `getCanonicalOptions` minted it: anchored against the abundance column. */
const anchored = (name: string, axis: number, domain: Record<string, string> = {}) =>
  JSON.stringify({ axes: [{ anchor: "main", idx: axis }], domain, name });
const conditionColumn = anchored("pl7.app/metadata", 0, { "pl7.app/label": "Condition" });
const antigenColumn = anchored("pl7.app/metadata", 0, { "pl7.app/label": "Antigen" });
const sequenceColumn = anchored("pl7.app/vdj/sequence", 1, { "pl7.app/alphabet": "aminoacid" });

const graph = (title: string, template: string) => ({ title, template, currentTab: null });

const storedAtV2 = {
  defaultBlockLabel: "Day 0-Day 7",
  customBlockLabel: "",
  abundanceRef: ref("mixcr", "abundance"),
  filterRef: ref("labeling", "labels.F"),
  clonotypeAbundanceRef: ref("mixcr", "clonotypeAbundance"),
  conditionColumnRef: conditionColumn,
  conditionOrder: ["Day 0", "Day 7"],
  downsampling: { type: "none", valueChooser: "auto" },
  FilteringConfig: {
    baseFilter: "shared",
    minAbundance: { enabled: true, threshold: 5, metric: "count" },
    presentInRounds: { enabled: true, rounds: ["Day 7"], logic: "AND" },
    excludeSequencedLibrary: false,
  },
  clonotypeDefinition: [sequenceColumn],
  additionalEnrichmentExports: ["Day 7 vs Day 0"],
  antigenControlConfig: {
    antigenEnabled: true,
    controlEnabled: true,
    antigenColumnRef: antigenColumn,
    targetAntigen: "HER2",
    negativeAntigens: ["BSA"],
    controlThreshold: 1.5,
    singleControlFrequencyThreshold: 0.02,
    controlConditionsOrder: ["Day 0"],
    sequencedLibraryEnabled: true,
    sequencedLibraryAntigen: "Library",
    hasSingleConditionNegativeControl: true,
    hasMultiConditionNegativeControl: false,
  },
  enrichmentThreshold: 3,
  pseudoCount: 2,
  tableState: createPlDataTableStateV2(),
  bubbleState: graph("Enrichment", "bubble"),
  lineState: graph("Top enriched sequences", "curve_dots"),
  stackedState: graph("Top enriched sequences", "stackedArea"),
  scatterState: graph("Binding specificity", "dots"),
  boxState: graph("Control Box Plot", "box"),
  excludedAlertDismissedKey: "Day 3",
};

describe("v3 migration", () => {
  const migrated = () => migrate(storedAtV2, "v2");

  test("lands at v5", () => {
    expect(migrated().version).toBe("v5");
  });

  test("refs to upstream outputs become their result-pool ids", () => {
    const { data } = migrated();
    expect(data.abundanceRef).toBe(createGlobalPObjectId("mixcr", "abundance"));
    expect(data.filterRef).toBe(createGlobalPObjectId("labeling", "labels.F"));
    expect(data.clonotypeAbundanceRef).toBe(createGlobalPObjectId("mixcr", "clonotypeAbundance"));
  });

  test("anchored columns and the plain values picked in them are reset", () => {
    const { data } = migrated();
    expect(data.conditionColumnRef).toBeUndefined();
    expect(data.conditionOrder).toEqual([]);
    expect(data.clonotypeDefinition).toEqual([]);
    expect(data.FilteringConfig.presentInRounds.rounds).toEqual([]);
    expect(data.antigenControlConfig.antigenColumnRef).toBeUndefined();
    expect(data.antigenControlConfig.targetAntigen).toBeUndefined();
    expect(data.antigenControlConfig.negativeAntigens).toEqual([]);
    expect(data.antigenControlConfig.controlConditionsOrder).toEqual([]);
    expect(data.antigenControlConfig.sequencedLibraryAntigen).toBeUndefined();
  });

  test("every other setting is kept", () => {
    const { data } = migrated();
    const { FilteringConfig: filtering, antigenControlConfig: config } = data;
    expect(filtering).toEqual({
      ...storedAtV2.FilteringConfig,
      presentInRounds: { enabled: true, rounds: [], logic: "AND" },
    });
    expect(config).toEqual({
      antigenEnabled: true,
      controlEnabled: true,
      negativeAntigens: [],
      controlThreshold: 1.5,
      singleControlFrequencyThreshold: 0.02,
      controlConditionsOrder: [],
      sequencedLibraryEnabled: true,
    });
    expect(data).toMatchObject({
      downsampling: storedAtV2.downsampling,
      additionalEnrichmentExports: ["Day 7 vs Day 0"],
      enrichmentThreshold: 3,
      pseudoCount: 2,
      bubbleState: storedAtV2.bubbleState,
      scatterState: storedAtV2.scatterState,
      excludedAlertDismissedKey: "Day 3",
    });
  });

  test("result-pool column ids and column value ids are kept, plain values beside them dropped", () => {
    const condition = createGlobalPObjectId("samples", "metadata.condition");
    const antigen = createGlobalPObjectId("samples", "metadata.antigen");
    const day0 = createColumnValueId({ column: condition, value: "Day 0" });
    const her2 = createColumnValueId({ column: antigen, value: "HER2" });
    const sequence = createGlobalPObjectId("mixcr", "aaSequence");
    const { data } = migrate(
      {
        ...storedAtV2,
        conditionColumnRef: condition,
        conditionOrder: [day0, "Day 7"],
        clonotypeDefinition: [sequence, sequenceColumn],
        antigenControlConfig: {
          ...storedAtV2.antigenControlConfig,
          antigenColumnRef: antigen,
          targetAntigen: her2,
          negativeAntigens: ["BSA", her2],
        },
      },
      "v2",
    );
    expect(data.conditionColumnRef).toBe(condition);
    expect(data.conditionOrder).toEqual([day0]);
    expect(data.clonotypeDefinition).toEqual([sequence]);
    expect(data.antigenControlConfig.antigenColumnRef).toBe(antigen);
    expect(data.antigenControlConfig.targetAntigen).toBe(her2);
    expect(data.antigenControlConfig.negativeAntigens).toEqual([her2]);
  });

  test("migrating the migrated data again changes nothing", () => {
    const once = migrated();
    expect(migrate(once.data, once.version)).toEqual(once);
  });
});

describe("v4 migration", () => {
  test("the old block label is dropped and the subtitle label starts empty", () => {
    const { data } = migrate(storedAtV2, "v2");
    expect(data).not.toHaveProperty("defaultBlockLabel");
    expect(data.subtitleLabel).toBe("");
    expect(data.customBlockLabel).toBe("");
  });
});

describe("v5 migration", () => {
  const condition = createGlobalPObjectId("samples", "metadata.condition");
  const antigen = createGlobalPObjectId("samples", "metadata.antigen");
  const value = (column: typeof condition, v: string) => createColumnValueId({ column, value: v });

  const storedAtV4 = {
    customBlockLabel: "",
    subtitleLabel: "",
    abundanceRef: createGlobalPObjectId("mixcr", "abundance"),
    conditionColumnRef: condition,
    conditionOrder: [value(condition, "Day 0"), value(condition, "Day 7")],
    downsampling: { type: "none", valueChooser: "auto" },
    FilteringConfig: storedAtV2.FilteringConfig,
    clonotypeDefinition: [],
    additionalEnrichmentExports: [],
    antigenControlConfig: {
      antigenEnabled: true,
      controlEnabled: true,
      antigenColumnRef: antigen,
      targetAntigen: value(antigen, "HER2"),
      negativeAntigens: [value(antigen, "BSA")],
      controlThreshold: 1.5,
      singleControlFrequencyThreshold: 0.02,
      controlConditionsOrder: [value(condition, "Day 0")],
      sequencedLibraryEnabled: false,
      hasSingleConditionNegativeControl: true,
      hasMultiConditionNegativeControl: false,
    },
    enrichmentThreshold: 3,
    pseudoCount: 2,
    tableState: createPlDataTableStateV2(),
    bubbleState: graph("Enrichment", "bubble"),
    lineState: graph("Top enriched sequences", "curve_dots"),
    stackedState: graph("Top enriched sequences", "stackedArea"),
    scatterState: graph("Binding specificity", "dots"),
    boxState: graph("Control Box Plot", "box"),
  };

  const {
    hasSingleConditionNegativeControl: _single,
    hasMultiConditionNegativeControl: _multi,
    ...configWithoutFlags
  } = storedAtV4.antigenControlConfig;

  test("the negative-control flags are dropped and the rest of the setup is kept", () => {
    const { version, data } = migrate(storedAtV4, "v4");
    expect(version).toBe("v5");
    expect(data.antigenControlConfig).toEqual(configWithoutFlags);
  });

  test("args derived from data stored before v5 carry no negative-control flags", () => {
    expect(deriveArgs(storedAtV4).antigenControlConfig).toEqual(configWithoutFlags);
  });

  test("args are the same before and after the migration", () => {
    expect(deriveArgs(migrate(storedAtV4, "v4").data)).toEqual(deriveArgs(storedAtV4));
  });
});

// Internals

type MigratedData = {
  customBlockLabel: string;
  subtitleLabel?: string;
  abundanceRef?: string;
  filterRef?: string;
  clonotypeAbundanceRef?: string;
  conditionColumnRef?: string;
  conditionOrder: string[];
  clonotypeDefinition: string[];
  FilteringConfig: { presentInRounds: { rounds: string[] } };
  antigenControlConfig: {
    antigenColumnRef?: string;
    targetAntigen?: string;
    negativeAntigens: string[];
    controlConditionsOrder: string[];
    sequencedLibraryAntigen?: string;
  };
};

/** Runs the block's storage migration, as the app does when it opens a block, on `data`. */
function migrate(data: unknown, version: string): { version: string; data: MigratedData } {
  const run = callbackRegistry[BlockStorageFacadeCallbacks.StorageMigrate];
  if (run === undefined) throw new Error("The storage migrate callback is not registered");
  const result = run(stringifyJson(createBlockStorage(data, version)));
  if (!isMigrated(result)) throw new Error(`Migration failed: ${JSON.stringify(result)}`);
  const storage = normalizeBlockStorage<MigratedData>(JSON.parse(result.newStorageJson));
  return { version: storage.__dataVersion, data: getStorageData(storage) };
}

/** Derives the args from `data` as stored, without migrating it first. */
function deriveArgs(data: unknown): { antigenControlConfig: unknown } {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  const result = derive(stringifyJson(createBlockStorage(data, "v5")));
  if (!isDerived(result)) throw new Error(`Args derivation failed: ${JSON.stringify(result)}`);
  return result.value;
}

function isDerived(result: unknown): result is { value: { antigenControlConfig: unknown } } {
  return (
    typeof result === "object" &&
    result !== null &&
    "value" in result &&
    typeof result.value === "object" &&
    result.value !== null &&
    "antigenControlConfig" in result.value
  );
}

function isMigrated(result: unknown): result is { newStorageJson: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "newStorageJson" in result &&
    typeof result.newStorageJson === "string"
  );
}
