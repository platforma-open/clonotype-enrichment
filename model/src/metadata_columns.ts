import type {
  AnchoredPColumnId,
  ColumnRecipe,
  ColumnUniversalId,
  PColumnSpec,
  PlRef,
  RenderCtxBase,
  SUniversalPColumnId,
} from "@platforma-sdk/model";
import {
  ColumnsCollection,
  canonicalizeJson,
  deriveColumnOptions,
  getAxisId,
  isAnchoredPColumnId,
  matchAxis,
  parseJsonSafely,
} from "@platforma-sdk/model";

/** A sample-metadata column offered in the condition and antigen pickers. */
export type MetadataOption = {
  value: ColumnUniversalId;
  label: string;
};

/**
 * A picked column id written by an older version of the block — anchored to the abundance
 * column — and the id of the same column among the current metadata options.
 */
export type LegacyColumnRefReplacement = {
  from: SUniversalPColumnId;
  to: ColumnUniversalId;
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
 * For every picked id written by an older version of the block, the id of the same column
 * among the current metadata options, matched by column name, domain and axes. A legacy id
 * that matches no option, or more than one, is left out: the column has to be picked again.
 */
export function findLegacyColumnRefReplacements(
  ctx: RenderCtxBase,
  abundanceRef: PlRef,
  columnRefs: readonly (SUniversalPColumnId | undefined)[],
): LegacyColumnRefReplacement[] {
  const legacyRefs = columnRefs.filter(
    (ref): ref is SUniversalPColumnId =>
      ref !== undefined && parseLegacyAnchoredId(ref) !== undefined,
  );
  if (legacyRefs.length === 0) return [];

  const options = findMetadataColumns(ctx, abundanceRef)?.columns ?? [];
  const replacements: LegacyColumnRefReplacement[] = [];
  for (const from of legacyRefs) {
    const legacyId = parseLegacyAnchoredId(from);
    if (legacyId === undefined) continue;
    const column = ctx.resultPool.getAnchoredPColumns({ main: abundanceRef }, legacyId)?.[0];
    if (column === undefined) continue;
    const identity = columnIdentity(column.spec);
    const matches = options.filter((column) => columnIdentity(column.getSpec()) === identity);
    if (matches.length === 1) replacements.push({ from, to: matches[0].id });
  }
  return replacements;
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

function parseLegacyAnchoredId(columnRef: string): AnchoredPColumnId | undefined {
  const parsed = parseJsonSafely(columnRef);
  return isAnchoredPColumnId(parsed) ? parsed : undefined;
}

function columnIdentity(spec: PColumnSpec): string {
  return canonicalizeJson({
    name: spec.name,
    domain: spec.domain ?? {},
    axes: spec.axesSpec.map(getAxisId),
  });
}
