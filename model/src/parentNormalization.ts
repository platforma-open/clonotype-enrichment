export const MUTATION_COUNT = "pl7.app/repertoire/mutationCount";
export const PARENT_LINK = "pl7.app/repertoire/parentLink";

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

/** The summaries and the half-match flag come from the last run and are absent before it. */
export type ParentNormalization = {
  /** The one parent column the workflow found on the selected grain, when the other is missing. */
  halfMatched?: ParentInput;
  summary?: ParentRunSummary;
  proteinSummary?: ParentRunSummary;
};
