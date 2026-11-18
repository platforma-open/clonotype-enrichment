import { createGlobalPObjectId } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { kind } from "./index";

const parse = (params: unknown) => kind.parseInitializationParams(params);

describe("templates written by earlier versions of the kind", () => {
  test("a defaultBlockLabel key is ignored, not rejected", () => {
    const parsed = parse({
      enrichmentThreshold: 2,
      defaultBlockLabel: "Day 0-Day 7, No filtering",
      customBlockLabel: "My enrichment",
    });
    expect(parsed).toEqual({ enrichmentThreshold: 2, customBlockLabel: "My enrichment" });
    expect(parsed).not.toHaveProperty("defaultBlockLabel");
  });
});

describe("clonotypeAbundanceRef", () => {
  const abundance = createGlobalPObjectId("mixcr", "abundance");
  const clonotypeAbundance = createGlobalPObjectId("mixcr", "clonotypeAbundance");

  test("is accepted as the result-pool id of another block's output", () => {
    expect(parse({ abundanceRef: abundance, clonotypeAbundanceRef: clonotypeAbundance })).toEqual({
      abundanceRef: abundance,
      clonotypeAbundanceRef: clonotypeAbundance,
    });
  });

  test("may be absent", () => {
    expect(parse({ abundanceRef: abundance })).toEqual({ abundanceRef: abundance });
  });

  test.for([
    {
      why: "a PlRef object",
      value: { __isRef: true, blockId: "mixcr", name: "clonotypeAbundance" },
    },
    { why: "a plain string", value: "clonotypeAbundance" },
  ])("is rejected as $why", ({ value }) => {
    expect(() => parse({ clonotypeAbundanceRef: value })).toThrow(
      "'clonotypeAbundanceRef' must be the result-pool id of another block's output.",
    );
  });
});

describe("antigenControlConfig", () => {
  const config = {
    antigenEnabled: true,
    controlEnabled: false,
    negativeAntigens: [],
    controlThreshold: 1,
    singleControlFrequencyThreshold: 0.01,
    controlConditionsOrder: [],
    sequencedLibraryEnabled: false,
  };

  test("is accepted without the negative-control flags", () => {
    expect(parse({ antigenControlConfig: config })).toEqual({ antigenControlConfig: config });
  });

  test("is accepted with the negative-control flags earlier templates carry, which are dropped", () => {
    const parsed = parse({
      antigenControlConfig: {
        ...config,
        hasSingleConditionNegativeControl: true,
        hasMultiConditionNegativeControl: false,
      },
    });
    expect(parsed).toEqual({ antigenControlConfig: config });
    expect(parsed.antigenControlConfig).not.toHaveProperty("hasSingleConditionNegativeControl");
    expect(parsed.antigenControlConfig).not.toHaveProperty("hasMultiConditionNegativeControl");
  });

  test("still requires the fields the contract names", () => {
    const { controlThreshold: _, ...incomplete } = config;
    expect(() => parse({ antigenControlConfig: incomplete })).toThrow(
      "'antigenControlConfig' must be an antigen and control configuration object.",
    );
  });
});
