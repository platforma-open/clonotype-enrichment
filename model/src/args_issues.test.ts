import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  createColumnValueId,
  createGlobalPObjectId,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";

const callbackRegistry: Record<string, (storageJson?: string) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

const condition = createGlobalPObjectId("samples", "metadata.condition");
const antigen = createGlobalPObjectId("samples", "metadata.antigen");
const conditionValue = (value: string) => createColumnValueId({ column: condition, value });
const antigenValue = (value: string) => createColumnValueId({ column: antigen, value });

const day0 = conditionValue("Day 0");
const day7 = conditionValue("Day 7");
const her2 = antigenValue("HER2");
const bsa = antigenValue("BSA");
const library = antigenValue("Library");

/** Antigen and control setup with the target, negative control and library all picked. */
const fullControl = {
  antigenEnabled: true,
  controlEnabled: true,
  antigenColumnRef: antigen,
  targetAntigen: her2,
  negativeAntigens: [bsa],
  controlConditionsOrder: [day0],
  sequencedLibraryEnabled: true,
  sequencedLibraryAntigen: library,
};

describe("args issues", () => {
  test("a configured block derives runnable args", () => {
    expect(deriveArgs(configured())).toMatchObject({
      value: {
        abundanceRef: createGlobalPObjectId("mixcr", "abundance"),
        conditionColumnRef: condition,
        conditionOrder: [day0, day7],
      },
      issues: [],
    });
  });

  test("a configured block with antigen, control and library picks derives runnable args", () => {
    expect(deriveArgs(configured({ antigenControlConfig: fullControl }))).toMatchObject({
      value: { antigenControlConfig: { targetAntigen: her2, sequencedLibraryAntigen: library } },
      issues: [],
    });
  });

  test.for([
    {
      why: "no abundance",
      data: { abundanceRef: undefined },
      message: "Abundance is required",
    },
    {
      why: "no condition column",
      data: { conditionColumnRef: undefined },
      message: "Condition column is required",
    },
    {
      why: "no conditions, with a library standing in for the second one",
      data: {
        conditionOrder: [],
        antigenControlConfig: { sequencedLibraryEnabled: true, sequencedLibraryAntigen: library },
      },
      message: "Conditions are required",
    },
    {
      why: "an enrichment threshold below 0.6",
      data: { enrichmentThreshold: 0.5 },
      message: "Enrichment threshold must be ≥ 0.6",
    },
    {
      why: "target selection on without an antigen column",
      data: { antigenControlConfig: { antigenEnabled: true, targetAntigen: her2 } },
      message: "Antigen column is required",
    },
    {
      why: "target selection on without a target",
      data: { antigenControlConfig: { antigenEnabled: true, antigenColumnRef: antigen } },
      message: "Target antigen is required",
    },
    {
      why: "negative controls on without a negative control antigen",
      data: { antigenControlConfig: { ...fullControl, negativeAntigens: [] } },
      message: "Control configuration is incomplete",
    },
    {
      why: "a sequenced library on without a library antigen",
      data: { antigenControlConfig: { sequencedLibraryEnabled: true } },
      message: "Library antigen is required",
    },
    {
      why: "a single condition without a sequenced library",
      data: { conditionOrder: [day0] },
      message: "At least 2 conditions are required",
    },
  ])("$why blocks Run with its message", ({ data, message }) => {
    expect(deriveArgs(configured(data))).toEqual({
      error: message,
      args: expect.any(Object),
      issues: [{ severity: "error", message }],
    });
  });

  test("negative controls need target selection on", () => {
    const antigenControlConfig = { ...fullControl, antigenEnabled: false };
    expect(deriveArgs(configured({ antigenControlConfig }))).toMatchObject({
      issues: [{ severity: "error", message: "Control configuration is incomplete" }],
    });
  });

  test("negative controls need a control condition", () => {
    const antigenControlConfig = { ...fullControl, controlConditionsOrder: [] };
    expect(deriveArgs(configured({ antigenControlConfig }))).toMatchObject({
      issues: [{ severity: "error", message: "Control configuration is incomplete" }],
    });
  });

  test("every failed check is reported", () => {
    const data = configured({
      abundanceRef: undefined,
      conditionColumnRef: undefined,
      conditionOrder: [],
    });
    expect(deriveArgs(data)).toMatchObject({
      error: expect.any(String),
      issues: [
        { severity: "error", message: "Abundance is required" },
        { severity: "error", message: "Condition column is required" },
        { severity: "error", message: "Conditions are required" },
        { severity: "error", message: "At least 2 conditions are required" },
      ],
    });
  });

  test("a new block derives args and is blocked from running", () => {
    expect(deriveArgs(initialData())).toMatchObject({
      args: expect.any(Object),
      issues: expect.arrayContaining([{ severity: "error", message: "Abundance is required" }]),
    });
  });
});

// Internals

type Overrides = Record<string, unknown> & { antigenControlConfig?: Record<string, unknown> };

/** A new block's data with an abundance, a condition column and two conditions picked. */
function configured(overrides: Overrides = {}): Record<string, unknown> {
  const { antigenControlConfig, ...rest } = overrides;
  const data = initialData();
  return {
    ...data,
    abundanceRef: createGlobalPObjectId("mixcr", "abundance"),
    conditionColumnRef: condition,
    conditionOrder: [day0, day7],
    ...rest,
    antigenControlConfig: { ...readObject(data.antigenControlConfig), ...antigenControlConfig },
  };
}

function initialData(): Record<string, unknown> {
  const initial = callbackRegistry[BlockStorageFacadeCallbacks.StorageInitial];
  if (initial === undefined) throw new Error("The initial storage callback is not registered");
  const storage = readObject(JSON.parse(String(initial())));
  return readObject(storage.__data);
}

function deriveArgs(data: Record<string, unknown>): unknown {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  return derive(stringifyJson(createBlockStorage(data, "v3")));
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Expected an object");
  return Object.fromEntries(Object.entries(value));
}
