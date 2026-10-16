import type { ColumnRecipe, ColumnUniversalId, PlRef, RenderCtxBase } from "@platforma-sdk/model";
import { ColumnsCollection, deriveColumnOptions, getAxisId, matchAxis } from "@platforma-sdk/model";

/** A sample-metadata column offered in the condition and antigen pickers. */
export type MetadataOption = {
  value: ColumnUniversalId;
  label: string;
};

/**
 * Sample-metadata columns of upstream blocks whose only axis is the abundance column's
 * sample axis (axis 0), as picker options. Every option id is a result-pool leaf, so it
 * names the block that produced the column. `undefined` only while the result pool is still
 * resolving; an abundance column that is gone from a settled pool offers no options.
 */
export function getMetadataOptions(
  ctx: RenderCtxBase,
  abundanceRef: PlRef,
): MetadataOption[] | undefined {
  const source = findMetadataColumns(ctx, abundanceRef);
  if (source === undefined) {
    return ColumnsCollection(["result_pool"], { ctx: ctx.ctx }).isFinal() ? [] : undefined;
  }
  return deriveColumnOptions([source]).map((option) => ({
    value: option.id,
    label: option.label,
  }));
}

/**
 * Sample-metadata columns of the result pool whose only axis is the abundance column's sample
 * axis (axis 0). `undefined` while the abundance column's spec is not known.
 */
export function findMetadataColumns(
  ctx: RenderCtxBase,
  abundanceRef: PlRef,
): { columns: ColumnRecipe[]; isFinal: boolean } | undefined {
  const sampleAxis = ctx.resultPool.getPColumnSpecByRef(abundanceRef)?.axesSpec[0];
  if (sampleAxis === undefined) return undefined;
  const sampleAxisId = getAxisId(sampleAxis);

  const collection = ColumnsCollection(["result_pool"], { ctx: ctx.ctx }).filter({
    include: { name: [{ type: "exact", value: METADATA_COLUMN_NAME }] },
  });
  const columns = collection.getColumns().filter((column) => {
    const axes = column.getSpec().axesSpec;
    return axes.length === 1 && matchAxis(sampleAxisId, getAxisId(axes[0]));
  });
  return { columns, isFinal: collection.isFinal() };
}

// Internals

const METADATA_COLUMN_NAME = "pl7.app/metadata";
