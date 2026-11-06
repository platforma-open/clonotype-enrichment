import type { AntigenControlConfig } from "@platforma-open/milaboratories.clonotype-enrichment.kind";
import type { ColumnValueId } from "@platforma-sdk/model";
import { createColumnValueId, createGlobalPObjectId } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import type { MetadataPicks, SampleValues } from "./metadata_values";
import {
  buildMetadataValuePickers,
  deriveMetadataValues,
  pairConditionsWithAntigens,
} from "./metadata_values";

describe("metadata values", () => {
  test("offer the distinct values of the condition column, in natural order", () => {
    const values = deriveMetadataValues({
      conditions: sampleValues(conditionColumn, { s1: "Day 14", s2: "Day 7", s3: "Day 7", s4: "" }),
      antigens: undefined,
      samples: undefined,
    });

    expect(values.conditions.map((o) => o.value)).toEqual([day7, day14]);
    expect(values.antigens).toBeUndefined();
  });

  test("do not offer a value whose only samples are outside the abundance input", () => {
    const values = deriveMetadataValues({
      conditions: sampleValues(conditionColumn, { s1: "Day 0", s2: "Day 7", s3: "Day 14" }),
      antigens: sampleValues(antigenColumn, { s1: "HER2", s2: "BSA", s3: "OVA" }),
      samples: ["s1", "s2"],
    });

    expect(values.conditions.map((o) => o.value)).toEqual([day0, day7]);
    expect(values.antigens?.options.map((o) => o.value)).toEqual([bsa, her2]);
  });

  test("offer an antigen whose samples have no condition", () => {
    const values = deriveMetadataValues({
      conditions: sampleValues(conditionColumn, { s1: "Day 0" }),
      antigens: sampleValues(antigenColumn, { s1: "HER2", s2: "BSA" }),
      samples: undefined,
    });

    expect(values.antigens?.options.map((o) => o.value)).toEqual([bsa, her2]);
    expect(values.antigens?.conditions.antigensWithEmptyConditions).toEqual(new Set([bsa]));
  });
});

describe("pairing conditions with antigens", () => {
  test("gives the distinct conditions of the samples of each antigen", () => {
    const pairing = pair({
      conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 7", s4: "Day 0" },
      antigens: { s1: "HER2", s2: "HER2", s3: "HER2", s4: "BSA" },
    });

    expect(pairing.conditionsByAntigen).toEqual(
      new Map([
        [her2, ["Day 0", "Day 7"]],
        [bsa, ["Day 0"]],
      ]),
    );
    expect(pairing.antigensWithEmptyConditions).toEqual(new Set());
  });

  test("counts only the samples of the abundance input", () => {
    const pairing = pair({
      conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 14" },
      antigens: { s1: "HER2", s2: "HER2", s3: "BSA" },
      samples: ["s1", "s2"],
    });

    expect(pairing.conditionsByAntigen).toEqual(new Map([[her2, ["Day 0", "Day 7"]]]));
  });

  test("tells the antigens some of whose samples have no condition, an empty one included", () => {
    const pairing = pair({
      conditions: { s1: "Day 0", s2: "" },
      antigens: { s1: "HER2", s2: "HER2", s3: "BSA", s4: "" },
    });

    expect(pairing.conditionsByAntigen).toEqual(new Map([[her2, ["Day 0"]]]));
    expect(pairing.antigensWithEmptyConditions).toEqual(new Set([her2, bsa]));
  });
});

describe("value pickers", () => {
  test("without target selection offer every condition and no antigen", () => {
    const pickers = buildMetadataValuePickers(picks({ conditionOrder: [day0, day14] }), {
      conditions: [option(conditionColumn, "Day 0"), option(conditionColumn, "Day 7")],
      antigens: undefined,
    });

    expect(pickers.conditions.map((o) => o.value)).toEqual([day0, day7]);
    expect(pickers.targetAntigens).toEqual([]);
    expect(pickers.negativeControls).toBeUndefined();
    expect(pickers.unavailable.conditions.map((o) => o.value)).toEqual([day14]);
  });

  test("with a target offer the conditions of its samples and tell the rest", () => {
    const pickers = buildMetadataValuePickers(
      picks({
        conditionOrder: [day0, day7, day14],
        antigenControlConfig: { antigenEnabled: true, targetAntigen: her2 },
      }),
      antigenValues({
        conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 14" },
        antigens: { s1: "HER2", s2: "HER2", s3: "BSA" },
      }),
    );

    expect(pickers.conditions.map((o) => o.value)).toEqual([day0, day7]);
    expect(pickers.conditionsExcludedByTarget.map((o) => o.value)).toEqual([day14]);
    expect(pickers.unavailable.conditions.map((o) => o.value)).toEqual([day14]);
  });

  test("offer as target the antigens present in two conditions, or any with a library", () => {
    const values = antigenValues({
      conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 0", s4: "Day 0" },
      antigens: { s1: "HER2", s2: "HER2", s3: "BSA", s4: "Library" },
    });

    const withoutLibrary = buildMetadataValuePickers(
      picks({ antigenControlConfig: { antigenEnabled: true } }),
      values,
    );
    expect(withoutLibrary.targetAntigens.map((o) => o.value)).toEqual([her2]);

    const withLibrary = buildMetadataValuePickers(
      picks({
        antigenControlConfig: {
          antigenEnabled: true,
          sequencedLibraryEnabled: true,
          sequencedLibraryAntigen: library,
        },
      }),
      values,
    );
    expect(withLibrary.targetAntigens.map((o) => o.value)).toEqual([bsa, her2]);
  });

  test("tell how many conditions the negative controls are in, and their conditions", () => {
    const pickers = buildMetadataValuePickers(
      picks({
        antigenControlConfig: {
          antigenEnabled: true,
          controlEnabled: true,
          targetAntigen: her2,
          negativeAntigens: [bsa, ova],
          controlConditionsOrder: [day0, day14],
        },
      }),
      antigenValues({
        conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 0", s4: "Day 7", s5: "Day 0" },
        antigens: { s1: "HER2", s2: "HER2", s3: "BSA", s4: "BSA", s5: "OVA" },
      }),
    );

    expect(pickers.negativeControls).toEqual({ single: true, multi: true });
    expect(pickers.controlConditions.map((o) => o.value)).toEqual([day0, day7]);
    expect(pickers.unavailable.controlConditions.map((o) => o.value)).toEqual([day14]);
  });

  test("offer as negative controls and library only antigens of the abundance input", () => {
    const pickers = buildMetadataValuePickers(
      picks({
        antigenControlConfig: {
          antigenEnabled: true,
          controlEnabled: true,
          sequencedLibraryEnabled: true,
          targetAntigen: her2,
          negativeAntigens: [bsa],
        },
      }),
      antigenValues({
        conditions: { s1: "Day 0", s2: "Day 7", s3: "Day 0", s4: "Day 0" },
        antigens: { s1: "HER2", s2: "BSA", s3: "Library", s4: "OVA" },
        samples: ["s1", "s2", "s3"],
      }),
    );

    expect(pickers.negativeAntigens.map((o) => o.value)).toEqual([bsa, library]);
    expect(pickers.libraryAntigens.map((o) => o.value)).toEqual([library]);
  });

  test("an antigen column that offers no values marks the library as not available", () => {
    const pickers = buildMetadataValuePickers(
      picks({
        antigenControlConfig: {
          antigenEnabled: true,
          sequencedLibraryEnabled: true,
          sequencedLibraryAntigen: library,
        },
      }),
      deriveMetadataValues({
        conditions: sampleValues(conditionColumn, { s1: "Day 0" }),
        antigens: { column: antigenColumn, rows: [] },
        samples: undefined,
      }),
    );

    expect(pickers.unavailable.libraryAntigen?.value).toEqual(library);
    expect(pickers.negativeControls).toEqual({ single: false, multi: false });
  });
});

// Internals

const conditionColumn = createGlobalPObjectId("samples", "metadata.condition");
const antigenColumn = createGlobalPObjectId("samples", "metadata.antigen");

const day0 = createColumnValueId({ column: conditionColumn, value: "Day 0" });
const day7 = createColumnValueId({ column: conditionColumn, value: "Day 7" });
const day14 = createColumnValueId({ column: conditionColumn, value: "Day 14" });
const her2 = createColumnValueId({ column: antigenColumn, value: "HER2" });
const bsa = createColumnValueId({ column: antigenColumn, value: "BSA" });
const ova = createColumnValueId({ column: antigenColumn, value: "OVA" });
const library = createColumnValueId({ column: antigenColumn, value: "Library" });

type SampleTable = {
  conditions: Record<string, string>;
  antigens: Record<string, string>;
  samples?: string[];
};

function pair(table: SampleTable) {
  return pairConditionsWithAntigens({
    conditions: sampleValues(conditionColumn, table.conditions),
    antigens: sampleValues(antigenColumn, table.antigens),
    samples: table.samples,
  });
}

/** Values read for a condition and an antigen column holding `table`. */
function antigenValues(table: SampleTable) {
  return deriveMetadataValues({
    conditions: sampleValues(conditionColumn, table.conditions),
    antigens: sampleValues(antigenColumn, table.antigens),
    samples: table.samples,
  });
}

function sampleValues(
  column: SampleValues["column"],
  values: Record<string, string>,
): SampleValues {
  return {
    column,
    rows: Object.entries(values).map(([sample, value]) => ({ sample, value })),
  };
}

function option(column: SampleValues["column"], value: string) {
  return { value: createColumnValueId({ column, value }), label: value };
}

function picks(
  overrides: {
    conditionOrder?: ColumnValueId[];
    antigenControlConfig?: Partial<AntigenControlConfig>;
  } = {},
): MetadataPicks {
  return {
    conditionColumnRef: conditionColumn,
    conditionOrder: overrides.conditionOrder ?? [],
    FilteringConfig: {
      baseFilter: "none",
      minAbundance: { enabled: false, threshold: 100, metric: "count" },
      presentInRounds: { enabled: false, rounds: [], logic: "OR" },
      excludeSequencedLibrary: true,
    },
    antigenControlConfig: {
      antigenEnabled: false,
      controlEnabled: false,
      antigenColumnRef: antigenColumn,
      negativeAntigens: [],
      controlThreshold: 1,
      singleControlFrequencyThreshold: 0.01,
      controlConditionsOrder: [],
      sequencedLibraryEnabled: false,
      hasSingleConditionNegativeControl: false,
      hasMultiConditionNegativeControl: false,
      ...overrides.antigenControlConfig,
    },
  };
}
