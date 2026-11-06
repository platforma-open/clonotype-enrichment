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

  test("lands at v3", () => {
    expect(migrated().version).toBe("v3");
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
      hasSingleConditionNegativeControl: true,
      hasMultiConditionNegativeControl: false,
    });
    expect(data).toMatchObject({
      defaultBlockLabel: "Day 0-Day 7",
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

// Internals

type MigratedData = {
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

function isMigrated(result: unknown): result is { newStorageJson: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "newStorageJson" in result &&
    typeof result.newStorageJson === "string"
  );
}
