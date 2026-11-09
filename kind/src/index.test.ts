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
