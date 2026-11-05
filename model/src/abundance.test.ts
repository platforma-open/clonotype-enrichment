import { createGlobalPObjectId, createPlRef } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { parseRunColumn } from "./abundance";

describe("parseRunColumn", () => {
  const id = createGlobalPObjectId("mixcr", "clonotypes.abundance");

  test("keeps a column id", () => {
    expect(parseRunColumn(id)).toBe(id);
  });

  test("turns a ref of a run made before column ids into the id of the same output", () => {
    expect(parseRunColumn(createPlRef("mixcr", "clonotypes.abundance"))).toBe(id);
  });

  test("gives nothing for a missing or unknown value", () => {
    expect(parseRunColumn(undefined)).toBeUndefined();
    expect(parseRunColumn({ blockId: "mixcr" })).toBeUndefined();
  });
});
