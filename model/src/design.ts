// Experiment design support (draft).
//
// Reads the design tensors published in the result pool (column
// `pl7.app/design/tensors`, axes [designId, tensorId], one JSON tensor per
// cell, its STEP 3 label inside) and turns the user's choices into an analysis plan that the workflow
// computes. The tensor shape follows the spec draft "Each tensor is a JSON
// object with a fixed shape" (schemaVersion 1).
//
// Everything here is pure: no SDK calls, so it can be unit-tested and reused
// by the UI.

export const TENSOR_COLUMN_NAME = "pl7.app/design/tensors";
export const TENSOR_SAMPLE_AXIS_ANNOTATION = "pl7.app/design/sampleAxis";
export const SUPPORTED_SCHEMA_VERSION = 1;

export type Position = string[];
export type StepKind = "selection" | "piece" | "portion" | "timecourse";

type TensorBase = {
  schemaVersion: number;
  designName: string;
  datasets: string[];
  label?: TensorLabel;
};

export type TrajectoryTensor = TensorBase & {
  type: "trajectory";
  positions: Position[];
  pieceOf: (string | null)[];
  steps: StepKind[];
};
export type PartitionTensor = TensorBase & { type: "partition"; positions: Position[] };
export type RecurrenceTensor = TensorBase & { type: "recurrence"; positions: Position[] };
export type PanelArm = { split: string; positions: Position[]; trajectories: string[] };
export type PanelTensor = TensorBase & {
  type: "panel";
  anchor: { material: string; reads: string[] };
  arms: PanelArm[];
};
export type Tensor = TrajectoryTensor | PartitionTensor | RecurrenceTensor | PanelTensor;

/** One label column set: the metadata columns read together, one value tuple per group
 *  (null for a group with no reads). */
export type LabelColumn = { cols: string[]; values: (string[] | null)[] };
/** STEP 3 label of a tensor. Groups are its positions; for a panel, its arms. */
export type TensorLabel = {
  axes: LabelColumn[];
  mixed: LabelColumn[];
  within: string[];
  constant: [string, string][];
  /** Trajectories only: the columns that name the last position, which the axes do not. */
  end?: [string, string][];
};

export type Design = {
  designId: string;
  name: string;
  tensors: Record<string, Tensor>;
  /** By tensor id; empty when the design has no labels. */
  labels: Record<string, TensorLabel>;
};

/** Content of a `PColumnData/Json` resource: keys are JSON arrays of axis values. */
export type JsonColumnData = { keyLength: number; data: Record<string, unknown> };

/** Groups the cells of a tensor column into designs. Unknown schema versions are skipped. */
export function readDesigns(content: JsonColumnData | undefined): Design[] {
  if (!content?.data) return [];
  const byId = new Map<string, Design>();
  for (const [key, value] of Object.entries(content.data)) {
    let designId: string, tensorId: string, tensor: Tensor;
    try {
      [designId, tensorId] = JSON.parse(key) as [string, string];
      tensor = (typeof value === "string" ? JSON.parse(value) : value) as Tensor;
    } catch {
      continue;
    }
    if (tensor?.schemaVersion !== SUPPORTED_SCHEMA_VERSION) continue;
    let d = byId.get(designId);
    if (!d) {
      d = { designId, name: tensor.designName || designId, tensors: {}, labels: {} };
      byId.set(designId, d);
    }
    d.tensors[tensorId] = tensor;
    if (tensor.label) d.labels[tensorId] = tensor.label;
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Every sample the design's tensors name. A design can only be analysed where all of these
 *  carry abundance, so this is what the input dropdown checks the abundance against. */
export function designSamples(design: Design): string[] {
  const out = new Set<string>();
  for (const t of Object.values(design.tensors)) {
    const positions = t.type === "panel" ? t.arms.flatMap((a) => a.positions) : t.positions;
    for (const p of positions) for (const s of p) out.add(s);
    if (t.type === "panel") for (const s of t.anchor.reads) out.add(s);
  }
  return [...out];
}

/**
 * Name of group `i` of a tensor, read from its STEP 3 label: the values of every axis, blanks
 * left out. Two or more axes are a confound (the table cannot say which one varies), so all
 * are shown, joined by " · ". A value that is a bare number is shown with its column name
 * ("selection 2"). Undefined when the label has no axis, the group is a hole or every value
 * is blank; callers then fall back to the sample labels.
 */
export function groupName(label: TensorLabel | undefined, i: number): string | undefined {
  if (!label?.axes.length) return undefined;
  const parts = label.axes
    .map((a) =>
      (a.values[i] ?? [])
        .map((v, j) => (v === "" ? "" : /^-?\d+(\.\d+)?$/.test(v) ? `${a.cols[j]} ${v}` : v))
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

/** Display names for one design, from its labels; sample labels where there are none. */
export class Names {
  private byPos = new Map<string, string>();
  private byStep = new Map<string, string>();
  private pieces = new Map<string, Map<string, string>>(); // partition id -> position key -> name
  private ids = new Map<Tensor, string>();
  readonly derived: boolean;

  constructor(
    private design: Design,
    private sampleLabel: Labeler,
  ) {
    this.derived = Object.keys(design.labels).length > 0;
    const entries = Object.entries(design.tensors);
    for (const [id, t] of entries) this.ids.set(t, id);
    for (const [id, t] of entries) {
      if (t.type !== "partition") continue;
      const m = new Map<string, string>();
      t.positions.forEach((p, i) => {
        const n = groupName(design.labels[id], i);
        if (n && p.length) m.set(posKey(p), n);
      });
      this.pieces.set(id, m);
    }
    // A position is named by the first trajectory that holds it, plus its piece when it is
    // one; positions only in a partition by their piece.
    for (const [id, t] of entries) {
      if (t.type !== "trajectory") continue;
      t.positions.forEach((p, i) => {
        const k = posKey(p);
        if (!p.length || this.byPos.has(k)) return;
        const own = groupName(design.labels[id], i);
        const n = [own, this.piece(t.pieceOf[i], p)].filter(Boolean).join(" ");
        if (n) this.byPos.set(k, n);
        if (own) this.byStep.set(k, own);
      });
    }
    for (const m of this.pieces.values())
      for (const [k, n] of m) if (!this.byPos.has(k)) this.byPos.set(k, n);
  }

  /** A position: derived name, else its sample labels. */
  pos(p: Position): string {
    return this.byPos.get(posKey(p)) ?? this.sampleLabel(p);
  }

  /** A position without the piece it is of: what the parallel lines have in common at this step. */
  step(p: Position): string {
    return this.byStep.get(posKey(p)) ?? this.pos(p);
  }

  /** A piece of a separation by what tells it from the other pieces, else as a position. */
  piece(partition: string | null | undefined, p: Position): string | undefined {
    if (!partition) return undefined;
    return this.pieces.get(partition)?.get(posKey(p));
  }

  /** Arm `split` of a panel tensor. */
  arm(panel: PanelTensor, split: string): string {
    const id = this.ids.get(panel);
    const i = panel.arms.findIndex((a) => a.split === split);
    return (id !== undefined && groupName(this.design.labels[id], i)) || split;
  }

  /** What names a trajectory's last position, as [column, value]: the columns its axes and
   *  constants leave out. Sibling trajectories differ in these. */
  endLabel(t: Tensor | undefined): [string, string][] {
    const id = t ? this.ids.get(t) : undefined;
    return (id !== undefined && this.design.labels[id]?.end) || [];
  }

  /** Sample-label name, for when derived names collide. */
  fallback(p: Position): string {
    return this.sampleLabel(p);
  }
}

/** Axis ids are equal when type, name and every domain entry are equal (any key order). */
export function sameAxisId(
  a: { type?: string; name: string; domain?: Record<string, string> } | undefined,
  b: { type?: string; name: string; domain?: Record<string, string> } | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.name !== b.name || (a.type ?? "") !== (b.type ?? "")) return false;
  const da = a.domain ?? {};
  const db = b.domain ?? {};
  const ka = Object.keys(da);
  if (ka.length !== Object.keys(db).length) return false;
  return ka.every((k) => da[k] === db[k]);
}

// ---------------------------------------------------------------------------
// Comparisons offered for a design
// ---------------------------------------------------------------------------

export type Labeler = (sampleIds: string[]) => string;

export type ComparisonOption = { value: string; label: string; kind: "panel" | "trajectory" };

/** Every panel, then every trajectory no panel covers. A trajectory inside a panel is computed
 *  with the panel's arm it belongs to, so offering it alone would repeat the same numbers. */
export function comparisonOptions(design: Design, label: Labeler): ComparisonOption[] {
  const names = new Names(design, label);
  const out: ComparisonOption[] = [];
  const entries = Object.entries(design.tensors);
  const covered = new Set<string>();
  for (const [id, t] of entries) {
    if (t.type !== "panel") continue;
    for (const a of t.arms) for (const tid of a.trajectories) covered.add(tid);
    out.push({ value: id, kind: "panel", label: panelSummary(design, t) });
  }
  for (const [id, t] of entries) {
    if (t.type !== "trajectory" || covered.has(id)) continue;
    out.push({
      value: id,
      kind: "trajectory",
      label: `Path ${t.positions.map((p) => names.pos(p)).join(" → ")}`,
    });
  }
  return out;
}

/**
 * How wide a panel is and what its arms run over: "3 arms over round". The arms are named by the
 * settings below it, so that is not repeated here.
 */
function panelSummary(design: Design, t: PanelTensor): string {
  const over = [
    ...new Set(
      t.arms.flatMap((a) =>
        a.trajectories.flatMap((tid) => design.labels[tid]?.axes.flatMap((x) => x.cols) ?? []),
      ),
    ),
  ];
  return [`${t.arms.length} arms`, over.length ? `over ${over.join(", ")}` : ""]
    .filter(Boolean)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type DesignChoices = {
  /** Tensor id of the chosen comparison (a panel or a trajectory). */
  comparison?: string;
  /** End point keys (see posKey) the user marked as controls. An arm can hold several end
   *  points, and a design can want one of them as the control of another, as vfp1602 reads its
   *  low gate against its high one, so the choice is per end point rather than per arm. */
  controlEnds: string[];
  /** Partition tensor id -> key of the chosen target piece (see posKey). */
  targetPieces: Record<string, string>;
  /** End point key -> its own enrichment cutoff, where the run's global one does not fit it. */
  thresholds?: Record<string, number>;
};

/** `label` is the samples' labels (unique); `name` is the derived display name. */
export type PlanPosition = {
  id: string;
  label: string;
  name: string;
  /** `name` without the piece it is of, so a step shared by parallel lines reads the same in all
   *  of them. The piece is what the lines are facetted by, so repeating it crowds the x axis. */
  step: string;
  samples: string[];
};
/** One trajectory of the comparison, for the frequency plots: its positions in order, and the
 *  comparison group (arm) it belongs to. */
export type PlanTrack = { label: string; group: string; positions: string[] };
export type PlanComparison = {
  id: string;
  /** What this comparison is, as its two sample sets. `id` is a running number, so it moves when
   *  another comparison appears or goes; this does not, and it is what the exported column's
   *  domain carries, so a block that remembers one of our columns still finds it.
   *  ponytail: a plain pair of posKeys, long for a pooled side; hash it if a domain value ever
   *  has to be short. */
  key: string;
  label: string;
  /** Column group in the results: "Trunk", an arm's split name, or "Controls". */
  group: string;
  kind: "step" | "preference" | "check" | "control";
  num: string;
  den: string;
};
export type PlanScore = {
  id: string;
  label: string;
  /** Split name of the arm (its id). */
  arm: string;
  /** Display name of the arm. */
  group: string;
  target: string;
  controls: string[];
  /** Step comparisons along this end point's own path, for its Max Log2FC. */
  steps: string[];
  /** Position ids along the same path, for the frequency its quality is judged on. */
  path: string[];
  /** posKey of the end point, the key its own settings are stored under. */
  end: string;
  /** What names this end point apart from the others: its arm, then where it ends. */
  endName: string;
  /** Set only where this end point's cutoff differs from the run's. */
  threshold?: number;
};
export type PlanArm = { split: string; name: string; role: "target" | "control"; score?: string };
/** One end point of the comparison, control or not: what the settings offer to tick. */
export type PlanEnd = { end: string; name: string; role: "target" | "control" };
export type TargetQuestion = {
  partition: string;
  label: string;
  options: { value: string; label: string }[];
};
export type Plan = {
  designId: string;
  designName: string;
  comparison: string;
  positions: PlanPosition[];
  comparisons: PlanComparison[];
  scores: PlanScore[];
  arms: PlanArm[];
  /** Every end point in plan order, so a control can be unticked again. */
  ends: PlanEnd[];
  tracks: PlanTrack[];
};
export type PlanResult = {
  /** Questions the design cannot answer. Shown in the settings. */
  questions: TargetQuestion[];
  /** Set when every question is answered. */
  plan?: Plan;
  /** Why no plan could be built. */
  error?: string;
};

export const posKey = (p: Position): string => JSON.stringify([...p].sort());

type Segment = {
  trajectory: TrajectoryTensor;
  /** Index in trajectory.positions of the first position of this segment. */
  from: number;
};

/**
 * Builds the plan for one comparison.
 *
 * Panel: one arm per split. Each arm's positions are compared with the arm's
 * baseline (the panel's anchor reads, or the first position of the arm when
 * the anchor was not sequenced), except inside a time course, where each time
 * point is compared with the start of the time course. A position that is a
 * piece of a separation is also compared with the other pieces pooled
 * ("preference"). Positions before the anchor form the trunk.
 *
 * Each arm that is not a control gets one score per end position: the end
 * position against its baseline, minus the highest enrichment of any control
 * comparison (negatives counted as 0). Controls are every comparison of the
 * control arms and, when the end position is a piece of a separation, the
 * other pieces against the same baseline.
 *
 * Where trajectories of one arm end in different pieces of the same
 * separation, the design cannot tell which piece is the target, so the user
 * is asked.
 */

export function buildPlan(design: Design, choices: DesignChoices, label: Labeler): PlanResult {
  const tensor = choices.comparison ? design.tensors[choices.comparison] : undefined;
  // No comparison yet means the UI has not written the default back; the alert would only blink.
  if (!tensor)
    return {
      questions: [],
      error: comparisonOptions(design, label).length
        ? undefined
        : "This design has nothing to compare",
    };
  if (tensor.type !== "panel" && tensor.type !== "trajectory")
    return { questions: [], error: "This comparison type is not supported yet" };

  const names = new Names(design, label);
  const b = new PlanBuilder(design, names);

  // Collect arms as (split, display name, segments)
  type ArmIn = { split: string; name: string; segments: Segment[]; firstPositions: Position[] };
  const arms: ArmIn[] = [];
  let baseline: Position | undefined;
  let trunk: Segment | undefined;

  if (tensor.type === "panel") {
    baseline = tensor.anchor.reads.length ? tensor.anchor.reads : undefined;
    const anchorKey = baseline ? posKey(baseline) : undefined;
    for (const arm of tensor.arms) {
      const segments: Segment[] = [];
      for (const tid of arm.trajectories) {
        const t = design.tensors[tid];
        if (t?.type !== "trajectory") continue;
        const idx = anchorKey ? t.positions.findIndex((p) => posKey(p) === anchorKey) : -1;
        segments.push({ trajectory: t, from: idx + 1 });
        if (idx > 0 && !trunk) trunk = { trajectory: t, from: 0 };
      }
      arms.push({
        split: arm.split,
        name: names.arm(tensor, arm.split),
        segments,
        firstPositions: arm.positions,
      });
    }
  } else {
    arms.push({
      split: "path",
      name: "",
      segments: [{ trajectory: tensor, from: 1 }],
      firstPositions: [],
    });
    baseline = tensor.positions[0];
  }

  // Questions: trajectories of one arm that end in different pieces of one separation
  const questions: TargetQuestion[] = [];
  const dropped = new Set<Segment>();
  const partitionOf = (groupKey: string) => groupKey.slice(0, groupKey.indexOf("#"));
  for (const arm of arms) {
    const groups = new Map<string, Segment[]>();
    for (const s of arm.segments) {
      const t = s.trajectory;
      const last = t.positions.length - 1;
      const part = t.pieceOf[last];
      if (!part) continue;
      const prefix = t.positions.slice(s.from, last).map(posKey).join("|");
      const k = part + "#" + prefix;
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    for (const [k, segs] of groups) {
      if (segs.length < 2) continue;
      const partition = partitionOf(k);
      const options = segs.map((s) => {
        const t = s.trajectory;
        const p = t.positions[t.positions.length - 1];
        return { value: posKey(p), label: names.piece(partitionOf(k), p) ?? names.pos(p) };
      });
      const chosen = choices.targetPieces[partition];
      if (!questions.some((q) => q.partition === partition))
        questions.push({
          partition,
          label: `Target fraction, ${arm.name || arm.split}`,
          options,
        });
      if (!chosen || !options.some((o) => o.value === chosen)) continue;
      for (const s of segs) {
        const p = s.trajectory.positions[s.trajectory.positions.length - 1];
        if (posKey(p) !== chosen) dropped.add(s);
      }
    }
  }
  const unanswered = questions.filter(
    (q) => !q.options.some((o) => o.value === choices.targetPieces[q.partition]),
  );
  if (unanswered.length)
    return { questions, error: `Choose: ${unanswered.map((q) => q.label).join(", ")}` };

  // Trunk comparisons (panel only)
  if (trunk) {
    const t = trunk.trajectory;
    const anchorIdx = t.positions.findIndex((p) => baseline && posKey(p) === posKey(baseline));
    const start = t.positions[0];
    const g: Group = { group: "Trunk", prefix: "" };
    for (let i = 1; i <= anchorIdx; i++) b.step(g, t.positions[i], start);
    for (let i = 0; i <= anchorIdx; i++) b.preference(g, t, i);
  }

  // Arm comparisons
  const armEnds: {
    split: string;
    end: Position;
    base: Position;
    t: TrajectoryTensor;
    i: number;
    steps: string[];
    path: string[];
  }[] = [];
  const armComparisons = new Map<string, string[]>();
  // What tells one end point from another: the arm it ran in, then the position it ends at. Either
  // alone repeats itself once a design has several arms ending in the same round.
  /**
   * What tells one end point of an arm from the others: the end-label columns every one of the
   * arm's trajectories carries with a differing value. The position's own name is no use where
   * the lines run in parallel to the same round, as vfp1602's three gates all end in
   * "antigen-sort R3"; the gate itself is in the end label.
   */
  const tellApart = (split: string): string[] => {
    const ends = armEnds.filter((e) => e.split === split && e.t);
    if (ends.length < 2) return [];
    const seen = new Map<string, string[]>();
    for (const e of ends)
      for (const [col, value] of names.endLabel(e.t))
        seen.set(col, [...(seen.get(col) ?? []), value]);
    return [...seen]
      .filter(([, vs]) => vs.length === ends.length && new Set(vs).size > 1)
      .map(([col]) => col);
  };
  /** Where a trajectory ends, named by what tells it from its siblings, else by its position. */
  const endOf = (split: string, t: TrajectoryTensor | undefined, end: Position): string => {
    const cols = tellApart(split);
    const own = names
      .endLabel(t)
      .filter(([col]) => cols.includes(col))
      .map(([, value]) => value);
    return own.length ? own.join(" ") : names.pos(end);
  };
  const endName = (arm: string, where: string) =>
    [arm, arm === where ? "" : where].filter((part) => part !== "").join(" · ") || where;
  // Comparison labels in an arm start with the arm's derived name; the column group is that name.
  const groupOf = (arm: ArmIn): Group => ({
    group: arm.name || arm.split,
    prefix: names.derived && arm.name ? `${arm.name}: ` : "",
  });
  for (const arm of arms) {
    const g = groupOf(arm);
    const ids: string[] = [];
    const segs = arm.segments.filter((s) => !dropped.has(s));
    if (segs.length === 0) {
      // An arm with nothing after its first material: compare each piece with the baseline
      for (const p of arm.firstPositions) {
        if (!baseline) continue;
        const id = b.step(g, p, baseline);
        if (id) ids.push(id);
        armEnds.push({
          split: arm.split,
          end: p,
          base: baseline,
          t: undefined as never,
          i: -1,
          steps: id ? [id] : [],
          path: [b.pos(baseline), b.pos(p)],
        });
      }
    }
    for (const s of segs) {
      const t = s.trajectory;
      const armBase = baseline ?? t.positions[s.from];
      const first = baseline ? s.from : s.from + 1;
      const segSteps: string[] = [];
      let tcStart: Position | undefined;
      let base = armBase;
      for (let i = first; i < t.positions.length; i++) {
        const step = t.steps[i - 1];
        if (step === "timecourse") {
          tcStart ??= t.positions[i - 1];
          base = tcStart;
        } else if (step === "portion" && tcStart) {
          // A whole of the last collection does not restart the course: a 24 h collection
          // still holds the 6 h material, so it is measured against what was applied.
          base = tcStart;
        } else {
          tcStart = undefined;
          base = armBase;
        }
        let id: string | undefined;
        if (step === "portion") id = b.check(g, t.positions[i], t.positions[i - 1]);
        else id = b.step(g, t.positions[i], base);
        if (id) {
          ids.push(id);
          if (b.kindOf(id) === "step") segSteps.push(id);
        }
        const pref = b.preference(g, t, i);
        if (pref) ids.push(pref);
      }
      const last = t.positions.length - 1;
      armEnds.push({
        split: arm.split,
        end: t.positions[last],
        base,
        t,
        i: last,
        steps: segSteps,
        // the baseline first, then everything the material passed through on the way to the end
        path: [armBase, ...t.positions.slice(first)]
          .filter((p) => p.length > 0)
          .map((p) => b.pos(p)),
      });
    }
    armComparisons.set(arm.split, ids);
  }

  // Scores
  const controlSet = new Set(choices.controlEnds);
  const isControl = (e: { end: Position }) => controlSet.has(posKey(e.end));
  // Every step along a control end point's own path, pooled with the others: a sequence counts as
  // a hit only where it beat the best of them.
  const controlIds = armEnds
    .filter(isControl)
    .flatMap((e) => e.steps)
    .filter((id) => b.kindOf(id) === "step");
  const armOut: PlanArm[] = [];
  const endOut: PlanEnd[] = [];
  for (const arm of arms) {
    const g = groupOf(arm);
    const ends = armEnds.filter((e) => e.split === arm.split);
    const controls = ends.filter(isControl).length;
    armOut.push({
      split: arm.split,
      name: g.group,
      role: controls === ends.length && ends.length > 0 ? "control" : "target",
    });
    for (const e of ends) {
      const where = endOf(arm.split, e.t, e.end);
      if (isControl(e)) {
        endOut.push({ end: posKey(e.end), name: endName(g.group, where), role: "control" });
        continue;
      }
      const target = b.step(g, e.end, e.base, true);
      if (!target) continue;
      const siblings = e.t ? b.siblingsOf(e.t, e.i) : [];
      const sibControls = siblings
        .map((p) => b.control(g, p, e.base))
        .filter((x): x is string => !!x);
      // A control that shares a step with this end point cannot speak against it: where the two
      // ran together, whatever rose did so in both. Dropping those leaves the control saying only
      // what happened after they parted.
      const own = new Set([...e.steps, target]);
      const pooled = controlIds.filter((id) => !own.has(id));
      // Plain "Enrichment", as the classic block says it. The control background is subtracted
      // into this number where there is one, which the setting above the table already states.
      const name = ends.length > 1 ? `Enrichment, ${g.group} · ${where}` : `Enrichment, ${g.group}`;
      const sid = b.score(
        name,
        arm.split,
        g.group,
        target,
        [...pooled, ...sibControls],
        // the end point's own comparison counts towards its Max Log2FC, and `score` dedupes
        [...e.steps, target],
        e.path,
        posKey(e.end),
        endName(g.group, where),
        choices.thresholds?.[posKey(e.end)],
      );
      endOut.push({ end: posKey(e.end), name: endName(g.group, where), role: "target" });
      armOut[armOut.length - 1]!.score ??= sid;
    }
  }

  // Tracks: every trajectory that ends in a target, so the frequency plots can follow each one. An
  // arm with no trajectory is its baseline then its pieces. A control end point has no score and so
  // no top sequences of its own, and counting it would leave a design with one target facetted by a
  // single path.
  const tracks: PlanTrack[] = [];
  for (const arm of arms) {
    const group = groupOf(arm).group;
    const name = tensor.type === "trajectory" ? "Path" : group;
    const pathsOf: { positions: Position[]; t?: TrajectoryTensor }[] = arm.segments.length
      ? arm.segments.map((s) => ({ positions: s.trajectory.positions, t: s.trajectory }))
      : [{ positions: [...(baseline ? [baseline] : []), ...arm.firstPositions] }];
    for (const { positions: ps, t } of pathsOf) {
      const live = ps.filter((p) => p.length);
      if (live.length === 0 || controlSet.has(posKey(live[live.length - 1]!))) continue;
      let label =
        pathsOf.length > 1 ? `${name} · ${endOf(arm.split, t, live[live.length - 1]!)}` : name;
      if (tracks.some((t) => t.label === label)) label = `${label} (${tracks.length + 1})`;
      tracks.push({ label, group, positions: live.map((p) => b.pos(p)) });
    }
  }

  return {
    questions,
    plan: {
      designId: design.designId,
      designName: design.name,
      comparison: choices.comparison!,
      positions: b.positions,
      comparisons: b.comparisons,
      scores: b.scores,
      arms: armOut,
      ends: endOut,
      tracks,
    },
  };
}

/** Column group of a comparison and the start of its label. */
type Group = { group: string; prefix: string };

class PlanBuilder {
  positions: PlanPosition[] = [];
  comparisons: PlanComparison[] = [];
  scores: PlanScore[] = [];
  private posIds = new Map<string, string>();
  private cmpIds = new Map<string, string>();
  private labels = new Set<string>();

  constructor(
    private design: Design,
    private names: Names,
  ) {}

  /** Plan positions keep sample labels: derived names can repeat across arms. */
  pos(p: Position): string {
    const k = posKey(p);
    let id = this.posIds.get(k);
    if (!id) {
      id = `p${this.positions.length + 1}`;
      this.posIds.set(k, id);
      this.positions.push({
        id,
        label: this.names.fallback(p),
        name: this.names.pos(p),
        step: this.names.step(p),
        samples: [...p].sort(),
      });
    }
    return id;
  }

  kindOf(id: string) {
    return this.comparisons.find((c) => c.id === id)?.kind;
  }

  /** `label` names positions by `name`; when it repeats an earlier label, sample labels are
   *  used instead, so every comparison column stays distinguishable. */
  private add(
    g: Group,
    kind: PlanComparison["kind"],
    num: Position,
    den: Position,
    label: (name: (p: Position) => string, derived: boolean) => string,
  ): string | undefined {
    if (num.length === 0 || den.length === 0 || posKey(num) === posKey(den)) return undefined;
    const n = this.pos(num);
    const d = this.pos(den);
    const k = `${n}/${d}`;
    const existing = this.cmpIds.get(k);
    if (existing) return existing;
    const id = `c${this.comparisons.length + 1}`;
    this.cmpIds.set(k, id);
    let text = g.prefix + label((p) => this.names.pos(p), true);
    if (this.labels.has(text)) text = label((p) => this.names.fallback(p), false);
    if (this.labels.has(text)) text = `${text} (${id})`;
    this.labels.add(text);
    const key = `${posKey(num)}/${posKey(den)}`;
    this.comparisons.push({ id, key, label: text, group: g.group, kind, num: n, den: d });
    return id;
  }

  step(g: Group, num: Position, den: Position, reuseOnly = false) {
    const k = `${this.posIds.get(posKey(num))}/${this.posIds.get(posKey(den))}`;
    if (reuseOnly && this.cmpIds.has(k)) return this.cmpIds.get(k);
    return this.add(g, "step", num, den, (name) => `${name(num)} vs ${name(den)}`);
  }

  check(g: Group, num: Position, den: Position) {
    return this.add(g, "check", num, den, (name) => `${name(num)} vs ${name(den)} (check)`);
  }

  control(g: Group, num: Position, den: Position) {
    return this.add(g, "control", num, den, (name) => `${name(num)} vs ${name(den)}`);
  }

  siblingsOf(t: TrajectoryTensor, i: number): Position[] {
    const part = t.pieceOf[i];
    if (!part) return [];
    const p = this.design.tensors[part];
    if (p?.type !== "partition") return [];
    const own = posKey(t.positions[i]);
    return p.positions.filter((x) => posKey(x) !== own);
  }

  /** The piece against the other pieces of the same separation, pooled. The pooled side is
   *  named by its pieces. */
  preference(g: Group, t: TrajectoryTensor, i: number) {
    const sib = this.siblingsOf(t, i);
    if (sib.length === 0) return undefined;
    const pooled = sib.flat();
    const part = t.pieceOf[i];
    return this.add(g, "preference", t.positions[i], pooled, (name, derived) => {
      const other = derived
        ? sib.map((p) => this.names.piece(part, p) ?? name(p)).join(" + ")
        : name(pooled);
      return `${name(t.positions[i])} vs ${other} (fraction preference)`;
    });
  }

  score(
    label: string,
    arm: string,
    group: string,
    target: string,
    controls: string[],
    steps: string[],
    path: string[],
    end: string,
    endName: string,
    threshold?: number,
  ) {
    const id = `s${this.scores.length + 1}`;
    this.scores.push({
      id,
      label,
      arm,
      group,
      target,
      controls: [...new Set(controls)],
      steps: [...new Set(steps)],
      path,
      end,
      endName,
      ...(threshold !== undefined && { threshold }),
    });
    return id;
  }
}
