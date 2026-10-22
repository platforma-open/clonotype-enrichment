import type {
  ColumnUniversalId,
  DatasetSelection,
  PlRef,
  RelaxedColumnSelector,
} from "@platforma-sdk/model";
import {
  createDatasetSelection,
  createGlobalPObjectId,
  createPrimaryRef,
  isPlRef,
  parseColumnIdSafely,
} from "@platforma-sdk/model";
import { exact } from "./columns";

/** The abundance column and the subset it is restricted to, as the block stores them. */
export type AbundancePick = {
  abundanceRef: ColumnUniversalId | undefined;
  filterRef: ColumnUniversalId | undefined;
};

/** The dataset picker's selection of the stored abundance column and subset. */
export function toDatasetSelection(pick: AbundancePick): DatasetSelection | undefined {
  const column = pick.abundanceRef === undefined ? undefined : toPlRef(pick.abundanceRef);
  if (column === undefined) return undefined;
  const filter = pick.filterRef === undefined ? undefined : toPlRef(pick.filterRef);
  return createDatasetSelection(createPrimaryRef(column, filter));
}

/** The abundance column and subset a dataset picker selection stores. */
export function fromDatasetSelection(selection: DatasetSelection | undefined): AbundancePick {
  const primary = selection?.primary;
  return {
    abundanceRef: primary === undefined ? undefined : toColumnId(primary.column),
    filterRef: primary?.filter === undefined ? undefined : toColumnId(primary.filter),
  };
}

/** The result-pool id of the upstream output a ref points to: it names the same block and column. */
export function toColumnId(ref: PlRef): ColumnUniversalId {
  return createGlobalPObjectId(ref.blockId, ref.name);
}

/** Primary raw abundances per sample: the first of exactly two axes is the sample. */
export const PRIMARY_ABUNDANCE: RelaxedColumnSelector = {
  axes: [{ name: [exact("pl7.app/sampleId")] }, {}],
  partialAxesMatch: false,
  annotations: {
    "pl7.app/isAbundance": [exact("true")],
    "pl7.app/abundance/normalized": [exact("false")],
    "pl7.app/abundance/isPrimary": [exact("true")],
  },
};

// Internals

function toPlRef(id: ColumnUniversalId): PlRef | undefined {
  const key = parseColumnIdSafely(id);
  return isPlRef(key) ? key : undefined;
}
