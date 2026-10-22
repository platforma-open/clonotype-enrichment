import type { AxisSpec, PColumnSpec, PObjectSpec } from "@platforma-sdk/model";
import { isPColumnSpec } from "@platforma-sdk/model";

export const MUTATION_COUNT = "pl7.app/repertoire/mutationCount";
export const PARENT_LINK = "pl7.app/repertoire/parentLink";
const PARENT_ID_AXIS = "pl7.app/repertoire/parentId";

/** The run summary the parent-enrichment computation writes, per grain. */
export type ParentRunSummary = {
  mode: "referenced" | "cancelled" | null;
  parents?: number;
  unidentifiable?: {
    parentId: string;
    reason: "no-unmutated-variant" | "several-unmutated-variants";
  }[];
  multiParentVariants?: number;
  conditions?: string[];
  /** Per parent, in condition order. Reads are null for a parent that cannot be identified or has no data. */
  parentStates?: {
    parentId: string;
    states: ("observed" | "thin" | "absent")[];
    reads: (number | null)[];
  }[];
};

export type ParentInput = typeof MUTATION_COUNT | typeof PARENT_LINK;

/** The summaries come from the last run and are absent before it. */
export type ParentNormalization = {
  /** The one parent column found on the selected grain, when the other is missing. */
  halfMatched?: ParentInput;
  summary?: ParentRunSummary;
  proteinSummary?: ParentRunSummary;
};

const domainKey = (axis: AxisSpec) =>
  JSON.stringify(Object.entries(axis.domain ?? {}).sort(([a], [b]) => a.localeCompare(b)));

const sameAxis = (a: AxisSpec, b: AxisSpec) =>
  a.name === b.name && a.type === b.type && domainKey(a) === domainKey(b);

const isMutationCountOn = (spec: PColumnSpec, axis: AxisSpec) =>
  spec.name === MUTATION_COUNT && spec.axesSpec.length === 1 && sameAxis(spec.axesSpec[0], axis);

const isParentLinkOn = (spec: PColumnSpec, axis: AxisSpec) =>
  spec.name === PARENT_LINK &&
  spec.annotations?.["pl7.app/isLinkerColumn"] === "true" &&
  spec.axesSpec.length === 2 &&
  spec.axesSpec.some((a) => sameAxis(a, axis)) &&
  spec.axesSpec.some((a) => a.name === PARENT_ID_AXIS);

/** Mirrors the workflow's discovery: each column must resolve to exactly one; several count as none. */
export function halfMatchedParentInput(
  specs: PObjectSpec[],
  variantAxis: AxisSpec,
): ParentInput | undefined {
  const columns = specs.filter(isPColumnSpec);
  const mutationCount = columns.filter((s) => isMutationCountOn(s, variantAxis)).length === 1;
  const parentLink = columns.filter((s) => isParentLinkOn(s, variantAxis)).length === 1;
  if (mutationCount === parentLink) return undefined;
  return mutationCount ? MUTATION_COUNT : PARENT_LINK;
}
