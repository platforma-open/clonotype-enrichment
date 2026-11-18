import {
  BlockStorageFacadeCallbacks,
  createGlobalPObjectId,
  getStorageData,
  normalizeBlockStorage,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";

const callbackRegistry: Record<string, (...json: string[]) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

// Ids as the exporting project's result pool minted them: template-local entry ids
// "clonotyping" and "clustering" stand for the blocks the template creates.
const clonotypeAbundance = createGlobalPObjectId("clonotyping", "abundance");
const clusterAbundance = createGlobalPObjectId("clustering", "abundance");

const exported = {
  abundanceRef: clusterAbundance,
  clonotypeAbundanceRef: clonotypeAbundance,
  enrichmentThreshold: 3,
};

/** Template-local entry id → the block id the applying project gave that entry. */
const blockIds = { clonotyping: "block-1", clustering: "block-2" };

describe("template params", () => {
  test("a block created from a template keeps the clonotype abundance and exports it again", () => {
    const data = initFromParams(exported, {});
    expect(data.clonotypeAbundanceRef).toBe(clonotypeAbundance);
    expect(deriveParams(data)).toMatchObject(exported);
  });

  test("the clonotype abundance is pointed at the applying project's block, as the abundance is", () => {
    const data = initFromParams(exported, blockIds);
    // The same canonical string the result pool mints for that block's output, so the UI, which
    // writes the discovered id only when it differs, leaves it as it is.
    expect(data.clonotypeAbundanceRef).toBe(createGlobalPObjectId("block-1", "abundance"));
    expect(data.abundanceRef).toBe(createGlobalPObjectId("block-2", "abundance"));
  });

  test("a block created from a template runs with the clonotype abundance", () => {
    const data = initFromParams(exported, blockIds);
    expect(deriveArgs(data)).toMatchObject({
      args: { clonotypeAbundanceRef: createGlobalPObjectId("block-1", "abundance") },
    });
  });

  test("a template without a clonotype abundance creates a block without one", () => {
    const { clonotypeAbundanceRef: _, ...withoutIt } = exported;
    const data = initFromParams(withoutIt, {});
    expect(data.clonotypeAbundanceRef).toBeUndefined();
    expect(deriveParams(data).clonotypeAbundanceRef).toBeUndefined();
  });
});

describe("a template written while the contract carried the negative-control flags", () => {
  const antigenControlConfig = {
    antigenEnabled: false,
    controlEnabled: false,
    negativeAntigens: [],
    controlThreshold: 1,
    singleControlFrequencyThreshold: 0.01,
    controlConditionsOrder: [],
    sequencedLibraryEnabled: false,
  };
  const withFlags = {
    ...exported,
    antigenControlConfig: {
      ...antigenControlConfig,
      hasSingleConditionNegativeControl: false,
      hasMultiConditionNegativeControl: true,
    },
  };

  test("creates a block whose data, args and exported params carry no flags", () => {
    const data = initFromParams(withFlags, blockIds);
    expect(data.antigenControlConfig).toEqual(antigenControlConfig);
    // The template names no condition column, so the args come with their issues, under `args`.
    const { args } = readObject(deriveArgs(data));
    expect(readObject(args).antigenControlConfig).toEqual(antigenControlConfig);
    expect(deriveParams(data).antigenControlConfig).toEqual(antigenControlConfig);
  });

  test("creates the same block as the template without them", () => {
    const { antigenControlConfig: _, ...rest } = withFlags;
    expect(initFromParams(withFlags, blockIds)).toEqual(
      initFromParams({ ...rest, antigenControlConfig }, blockIds),
    );
  });
});

// Internals

/** The block data a template entry with these params creates, as the app applies it. */
function initFromParams(
  params: Record<string, unknown>,
  ids: Record<string, string>,
): Record<string, unknown> {
  const init = callback(BlockStorageFacadeCallbacks.StorageInitialFromParams);
  const result = readObject(init(stringifyJson(params), stringifyJson(ids)));
  if (typeof result.storageJson !== "string") throw new Error(String(result.error));
  const storage = normalizeBlockStorage<Record<string, unknown>>(JSON.parse(result.storageJson));
  return getStorageData(storage);
}

/** The params a template export writes for a block with this data. */
function deriveParams(data: Record<string, unknown>): Record<string, unknown> {
  const derive = callback(BlockStorageFacadeCallbacks.InitializationParamsDerive);
  const result = readObject(derive(storageOf(data)));
  if (result.error !== undefined) throw new Error(String(result.error));
  return readObject(result.value);
}

function deriveArgs(data: Record<string, unknown>): unknown {
  return callback(BlockStorageFacadeCallbacks.ArgsDerive)(storageOf(data));
}

function storageOf(data: Record<string, unknown>): string {
  const initial = callback(BlockStorageFacadeCallbacks.StorageInitial);
  const storage = readObject(JSON.parse(String(initial())));
  return stringifyJson({ ...storage, __data: data });
}

function callback(name: string): (...json: string[]) => unknown {
  const fn = callbackRegistry[name];
  if (fn === undefined) throw new Error(`The ${name} callback is not registered`);
  return fn;
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Expected an object");
  return Object.fromEntries(Object.entries(value));
}
