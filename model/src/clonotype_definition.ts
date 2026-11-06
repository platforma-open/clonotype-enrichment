import type { ColumnUniversalId } from "@platforma-sdk/model";
import { deriveColumnOptions } from "@platforma-sdk/model";
import { axisSelector, exact, findColumn, resultPool } from "./columns";

/** A column offered to define a clonotype by. */
export type ClonotypeColumnOption = {
  value: ColumnUniversalId;
  label: string;
};

/**
 * Sequence columns of upstream blocks keyed by the abundance column's element axis (axis 1)
 * alone, as clonotype-definition options, by result-pool id. `undefined` while the abundance
 * column is not known.
 */
export function getClonotypeDefinitionOptions(
  abundanceRef: ColumnUniversalId,
): ClonotypeColumnOption[] | undefined {
  const elementAxis = findColumn(abundanceRef)?.getSpec().axesSpec[1];
  if (elementAxis === undefined) return undefined;

  const columns = resultPool().filter({
    include: {
      name: SEQUENCE_COLUMN_NAMES.map(exact),
      axes: [axisSelector(elementAxis)],
      partialAxesMatch: false,
    },
  });
  return deriveColumnOptions(columns).map(({ id, label }) => ({ value: id, label }));
}

// Internals

const SEQUENCE_COLUMN_NAMES = ["pl7.app/vdj/sequence", "pl7.app/sequence"];
