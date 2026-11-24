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
        const parts = [groupName(design.labels[id], i), this.piece(t.pieceOf[i], p)];
        const n = parts.filter(Boolean).join(" ");
        if (n) this.byPos.set(k, n);
      });
    }
    for (const m of this.pieces.values())
      for (const [k, n] of m) if (!this.byPos.has(k)) this.byPos.set(k, n);
  }

  /** A position: derived name, else its sample labels. */
  pos(p: Position): string {
    return this.byPos.get(posKey(p)) ?? this.sampleLabel(p);
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
    out.push({ value: id, kind: "panel", label: panelSummary(design, id, t, names) });
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
 * A panel described by its STEP 3 label: the columns its arms differ by, the columns its arms'
 * trajectories run over, and the anchor's samples as the baseline. Without a label, the arms are
 * listed by name.
 */
function panelSummary(design: Design, id: string, t: PanelTensor, names: Names): string {
  const cols = (l: TensorLabel | undefined) => (l?.axes ?? []).map((a) => a.cols.join(" + "));
  const by = cols(design.labels[id]);
  const arms = by.length
    ? `${t.arms.length} arms by ${by.join(" · ")}`
    : `${t.arms.length} arms: ${t.arms.map((a) => names.arm(t, a.split)).join(", ")}`;
  const over = [
    ...new Set(
      t.arms.flatMap((a) =>
        a.trajectories.flatMap((tid) => design.labels[tid]?.axes.flatMap((x) => x.cols) ?? []),
      ),
    ),
  ];
  const baseline = t.anchor.reads.length
    ? names.fallback(t.anchor.reads)
    : `${t.anchor.material} (not sequenced)`;
  return [arms, over.length ? `over ${over.join(", ")}` : "", `baseline ${baseline}`]
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type DesignChoices = {
  /** Tensor id of the chosen comparison (a panel or a trajectory). */
  comparison?: string;
  /** Split names of the panel arms the user marked as controls. */
  controlArms: string[];
  /** Partition tensor id -> key of the chosen target piece (see posKey). */
  targetPieces: Record<string, string>;
  /**
   * End point key -> key of the position to measure it against, overriding the inferred baseline.
   * A time course is inferred from its own first position and a panel arm from the anchor, which is
   * right unless the material an arm started from was sequenced without being a fork.
   */
  baselines?: Record<string, string>;
};

/** `label` is the samples' labels (unique); `name` is the derived display name. */
export type PlanPosition = { id: string; label: string; name: string; samples: string[] };
/** One trajectory of the comparison, for the frequency plots: its positions in order, and the
 *  comparison group (arm) it belongs to. */
export type PlanTrack = { label: string; group: string; positions: string[] };
export type PlanComparison = {
  id: string;
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
};
export type PlanArm = { split: string; name: string; role: "target" | "control"; score?: string };
export type TargetQuestion = {
  partition: string;
  label: string;
  options: { value: string; label: string }[];
};
/** One end point's baseline, and what else it could be measured against. Optional, unlike a
 *  TargetQuestion: the plan is complete without an answer. */
export type BaselineChoice = {
  /** posKey of the end point. */
  end: string;
  label: string;
  /** posKey of the baseline in force, inferred or chosen. */
  current: string;
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
  tracks: PlanTrack[];
  /** Only end points with a choice to make: two or more candidate baselines. */
  baselines: BaselineChoice[];
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
/**
 * Positions an end point of `t` can be measured against: everything upstream of it on its own
 * trajectory, plus a panel's sequenced anchor. Pieces of one separation are left out, since a
 * baseline has to be the material the end point came from, not a sibling of it.
 */
function baselineCandidates(tensor: Tensor, t: TrajectoryTensor): Position[] {
  const out = t.positions.slice(0, -1).filter((p) => p.length > 0);
  const anchor = tensor.type === "panel" ? tensor.anchor.reads : [];
  if (anchor.length && !out.some((p) => posKey(p) === posKey(anchor))) out.unshift(anchor);
  return out;
}

export function buildPlan(design: Design, choices: DesignChoices, label: Labeler): PlanResult {
  const tensor = choices.comparison ? design.tensors[choices.comparison] : undefined;
  if (!tensor) return { questions: [], error: "Choose a comparison" };
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
  }[] = [];
  const armComparisons = new Map<string, string[]>();
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
        armEnds.push({ split: arm.split, end: p, base: baseline, t: undefined as never, i: -1 });
      }
    }
    for (const s of segs) {
      const t = s.trajectory;
      // The user's own baseline for this end point wins over every inference below.
      const endKey = posKey(t.positions[t.positions.length - 1]!);
      const wanted = choices.baselines?.[endKey];
      const fixed = wanted
        ? baselineCandidates(tensor, t).find((p) => posKey(p) === wanted)
        : undefined;
      const fixedIdx = fixed ? t.positions.findIndex((p) => posKey(p) === posKey(fixed)) : -1;
      const armBase = fixed ?? baseline ?? t.positions[s.from];
      const first = fixedIdx >= 0 ? fixedIdx + 1 : baseline ? s.from : s.from + 1;
      let tcStart: Position | undefined;
      let base = armBase;
      for (let i = first; i < t.positions.length; i++) {
        const step = t.steps[i - 1];
        if (fixed) {
          base = fixed;
        } else if (step === "timecourse") {
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
        if (id) ids.push(id);
        const pref = b.preference(g, t, i);
        if (pref) ids.push(pref);
      }
      const last = t.positions.length - 1;
      armEnds.push({ split: arm.split, end: t.positions[last], base, t, i: last });
    }
    armComparisons.set(arm.split, ids);
  }

  // Scores
  const controlSet = new Set(choices.controlArms);
  const controlIds = arms
    .filter((a) => controlSet.has(a.split))
    .flatMap((a) => armComparisons.get(a.split) ?? [])
    .filter((id) => b.kindOf(id) === "step");
  const armOut: PlanArm[] = [];
  for (const arm of arms) {
    const g = groupOf(arm);
    if (controlSet.has(arm.split)) {
      armOut.push({ split: arm.split, name: g.group, role: "control" });
      continue;
    }
    const ends = armEnds.filter((e) => e.split === arm.split);
    for (const e of ends) {
      const target = b.step(g, e.end, e.base, true);
      if (!target) continue;
      const siblings = e.t ? b.siblingsOf(e.t, e.i) : [];
      const sibControls = siblings
        .map((p) => b.control(g, p, e.base))
        .filter((x): x is string => !!x);
      const name =
        ends.length > 1
          ? `Specific enrichment, ${g.group} · ${names.pos(e.end)}`
          : `Specific enrichment, ${g.group}`;
      const sid = b.score(name, arm.split, g.group, target, [...controlIds, ...sibControls]);
      armOut.push({ split: arm.split, name: g.group, role: "target", score: sid });
    }
    if (ends.length === 0) armOut.push({ split: arm.split, name: g.group, role: "target" });
  }

  // Tracks: every trajectory of the comparison (target pieces and their siblings alike), so the
  // frequency plots can follow each one. An arm with no trajectory is its baseline then its pieces.
  const tracks: PlanTrack[] = [];
  for (const arm of arms) {
    const group = groupOf(arm).group;
    const name = tensor.type === "trajectory" ? "Path" : group;
    const pathsOf = arm.segments.length
      ? arm.segments.map((s) => s.trajectory.positions)
      : [[...(baseline ? [baseline] : []), ...arm.firstPositions]];
    for (const ps of pathsOf) {
      const live = ps.filter((p) => p.length);
      if (live.length === 0) continue;
      let label = pathsOf.length > 1 ? `${name} · ${names.pos(live[live.length - 1])}` : name;
      if (tracks.some((t) => t.label === label)) label = `${label} (${tracks.length + 1})`;
      tracks.push({ label, group, positions: live.map((p) => b.pos(p)) });
    }
  }

  // Per-end-point baselines, offered only where the end point has more than one candidate.
  const baselines: BaselineChoice[] = [];
  for (const e of armEnds) {
    if (!e.t || !e.base) continue;
    const options = baselineCandidates(tensor, e.t).map((p) => ({
      value: posKey(p),
      label: names.pos(p),
    }));
    const end = posKey(e.end);
    if (options.length < 2 || baselines.some((x) => x.end === end)) continue;
    baselines.push({
      end,
      label: `Baseline, ${names.pos(e.end)}`,
      current: posKey(e.base),
      options,
    });
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
      tracks,
      baselines,
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
    this.comparisons.push({ id, label: text, group: g.group, kind, num: n, den: d });
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

  score(label: string, arm: string, group: string, target: string, controls: string[]) {
    const id = `s${this.scores.length + 1}`;
    this.scores.push({ id, label, arm, group, target, controls: [...new Set(controls)] });
    return id;
  }
}
