import type {
  MetadataColumnFrame,
  SampleValue,
  SampleValues,
} from "@platforma-open/milaboratories.clonotype-enrichment.model";
import type { ColumnUniversalId } from "@platforma-sdk/model";
import { getSingleColumnData } from "@platforma-sdk/model";
import type { ShallowRef } from "vue";
import { shallowRef, watch } from "vue";

/** The values of a picked metadata column at each sample, as far as they are read. */
export type SampleValuesState =
  | { readonly type: "loading" }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent" }
  | { readonly type: "read"; readonly values: SampleValues }
  | { readonly type: "failed"; readonly message: string };

/**
 * The values of the picked metadata `column` at each sample, read through the `source` the model
 * gives for it. `undefined` while no column is picked. Loading while
 * the source is resolving or still describes an earlier pick. Called from `setup`.
 */
export function useSampleValues(params: {
  source: () => MetadataColumnFrame | undefined;
  column: () => ColumnUniversalId | undefined;
}): Readonly<ShallowRef<SampleValuesState | undefined>> {
  const state = shallowRef<SampleValuesState | undefined>();
  let request = 0;

  watch(
    // An output recomputed after its producer reruns keeps its object and changes the frame
    // inside it; copying it makes the read follow the frame.
    [params.column, () => copyOf(params.source())],
    ([column, source]) => {
      const current = ++request;
      if (column === undefined) {
        state.value = undefined;
        return;
      }
      if (source === undefined || source.column !== column || source.type === "resolving") {
        state.value = LOADING;
        return;
      }
      if (source.type === "absent") {
        state.value = ABSENT;
        return;
      }
      state.value = LOADING;
      readSampleValues(source).then(
        (values) => {
          if (current === request) state.value = { type: "read", values };
        },
        (error: unknown) => {
          if (current === request) state.value = { type: "failed", message: messageOf(error) };
        },
      );
    },
    { immediate: true },
  );

  return state;
}

/**
 * The value of the column `source` holds at each sample that has one, read in the UI through its
 * frame; a metadata column is keyed by the sample alone. Rejects when the column has more than one
 * axis.
 */
export async function readSampleValues(
  source: Extract<MetadataColumnFrame, { type: "present" }>,
): Promise<SampleValues> {
  const { axesData, data } = await getSingleColumnData(source.frame, source.frameColumn);
  const axes = Object.values(axesData);
  if (axes.length !== 1) {
    throw new Error(`A column keyed by sample alone expected, it has ${axes.length} axes`);
  }
  const samples = axes[0];

  const rows: SampleValue[] = [];
  for (let row = 0; row < data.length; row++) {
    const sample = samples[row];
    const value = data[row];
    if (sample === undefined || sample === null || value === undefined || value === null) continue;
    rows.push({ sample: String(sample), value: String(value) });
  }
  return { column: source.column, rows };
}

// Internals

const LOADING: SampleValuesState = { type: "loading" };

const ABSENT: SampleValuesState = { type: "absent" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copyOf<T extends object>(source: T | undefined): T | undefined {
  return source === undefined ? undefined : { ...source };
}
