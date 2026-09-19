import { deltaE2000, grayScaleLevel } from "./color";
import type {
  Batch,
  BatchStatus,
  DomainEvent,
  Generation,
  GradeRecord,
  Lab,
  Weighing,
} from "./types";

// ---- 回潮环境与称量门控常量 ----
export const TEMP_MIN = 18; // 20 - 2
export const TEMP_MAX = 22; // 20 + 2
export const HUM_MIN = 60; // 65 - 5
export const HUM_MAX = 70; // 65 + 5
export const MAX_REL_DIFF = 0.005; // 相邻称量差 0.5%

export function envOk(temp: number, humidity: number): boolean {
  return temp >= TEMP_MIN && temp <= TEMP_MAX && humidity >= HUM_MIN && humidity <= HUM_MAX;
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------- 事件折叠（回放所有不可变事件 → 当前批次） ----------------

export function fold(events: DomainEvent[]): Batch[] {
  const map = new Map<string, Batch>();
  for (const e of events) {
    const b = map.get(e.batchId);
    switch (e.type) {
      case "BATCH_CREATED":
        map.set(e.batchId, {
          id: e.batchId,
          no: e.no,
          fabric: e.fabric,
          createdAt: e.at,
          generations: [
            {
              gen: 0,
              gsm: e.gsm,
              reason: "create",
              gsmFrom: null,
              weighings: [],
              grade: null,
            },
          ],
        });
        break;
      case "GSM_CHANGED":
        if (b) {
          b.generations.push({
            gen: e.gen,
            gsm: e.to,
            reason: "gsm",
            gsmFrom: e.from,
            weighings: [],
            grade: null,
          });
        }
        break;
      case "WEIGHING_APPENDED":
        if (b) {
          const g = b.generations.find((x) => x.gen === e.gen);
          g?.weighings.push(e.weighing);
        }
        break;
      case "GRADE_RECORDED":
        if (b) {
          const g = b.generations.find((x) => x.gen === e.gen);
          if (g) g.grade = e.grade;
        }
        break;
    }
  }
  return [...map.values()].sort((x, y) => x.createdAt - y.createdAt);
}

export function latestGen(batch: Batch): Generation {
  return batch.generations[batch.generations.length - 1];
}

// ---------------- 回潮门控评估 ----------------

export interface WeighingPair {
  index: number; // 后一次称量在序列中的下标
  prev: Weighing;
  curr: Weighing;
  rel: number; // |差| / 前一次
  relPct: number;
  diffOk: boolean;
  envOk: boolean; // 两次称量环境均合格
  ok: boolean;
  firstQualified: boolean; // 是否为首个合格对（该结果锁定生效）
}

export interface GateInfo {
  count: number;
  pairs: WeighingPair[];
  /** 首个合格的相邻称量对下标（对应 pairs 数组），一旦出现即锁定 */
  firstQualifiedPair: number | null;
  /** 门控是否通过：存在首个合格结果即生效（后续补测不推翻） */
  anchored: boolean;
  /** 最近一次称量/相邻对的问题（用于提示为什么“待复测”） */
  reasons: string[];
  lastEnvOk: boolean;
  lastDiffOk: boolean;
}

export function evaluate(weighings: Weighing[]): GateInfo {
  const pairs: WeighingPair[] = [];
  for (let i = 1; i < weighings.length; i++) {
    const prev = weighings[i - 1];
    const curr = weighings[i];
    const rel = prev.grams > 0 ? Math.abs(curr.grams - prev.grams) / prev.grams : Infinity;
    const eOk = envOk(prev.temp, prev.humidity) && envOk(curr.temp, curr.humidity);
    // 1e-9 容差用于消除浮点表示误差（如 10.05-10=0.04999…）
    const dOk = rel <= MAX_REL_DIFF + 1e-9 && Number.isFinite(rel);
    pairs.push({
      index: i,
      prev,
      curr,
      rel,
      relPct: rel * 100,
      diffOk: dOk,
      envOk: eOk,
      ok: eOk && dOk,
      firstQualified: false,
    });
  }
  const firstQualifiedPair = pairs.findIndex((p) => p.ok);
  if (firstQualifiedPair >= 0) pairs[firstQualifiedPair].firstQualified = true;
  const anchored = firstQualifiedPair >= 0;

  const reasons: string[] = [];
  const last = weighings[weighings.length - 1];
  let lastEnvOk = true;
  let lastDiffOk = true;

  if (weighings.length === 0) {
    reasons.push("尚无称量记录，需先完成回潮称量");
  } else if (weighings.length === 1) {
    reasons.push("仅 1 次称量，需相邻两次称量差 ≤0.5%");
    lastEnvOk = envOk(last.temp, last.humidity);
    if (!lastEnvOk) reasons.push("最近称量环境超出 20±2℃ 或 65±5%RH");
  } else {
    const lp = pairs[pairs.length - 1];
    lastEnvOk = envOk(lp.prev.temp, lp.prev.humidity) && envOk(lp.curr.temp, lp.curr.humidity);
    lastDiffOk = lp.diffOk;
    if (!lastEnvOk) reasons.push("最近称量环境超出 20±2℃ 或 65±5%RH");
    if (!lp.diffOk)
      reasons.push(`相邻称量差 ${lp.relPct.toFixed(2)}%，大于 0.5%，需继续复测`);
  }

  return { count: weighings.length, pairs, firstQualifiedPair: anchored ? firstQualifiedPair : null, anchored, reasons, lastEnvOk, lastDiffOk };
}

export function gateOf(batch: Batch): GateInfo {
  return evaluate(latestGen(batch).weighings);
}

// ---------------- 派生状态 ----------------

export function statusOf(batch: Batch): BatchStatus {
  const g = latestGen(batch);
  if (g.grade) return "GRADED";
  const gate = evaluate(g.weighings);
  if (gate.anchored) return "READY";
  if (g.weighings.length === 0) return g.gen === 0 ? "CONDITIONING" : "RETEST";
  return "RETEST";
}

export interface BatchView {
  batch: Batch;
  gen: Generation;
  status: BatchStatus;
  gate: GateInfo;
  activeGrade: GradeRecord | null;
  /** 因改克重而被作废的历史判级（仍可查） */
  superseded: GradeRecord[];
  canAppend: boolean;
  canGrade: boolean;
}

export function viewOf(batch: Batch): BatchView {
  const gen = latestGen(batch);
  const gate = evaluate(gen.weighings);
  return {
    batch,
    gen,
    status: statusOf(batch),
    gate,
    activeGrade: gen.grade,
    superseded: batch.generations.slice(0, -1).flatMap((g) => (g.grade ? [g.grade] : [])),
    canAppend: !gen.grade,
    canGrade: !gen.grade && gate.anchored,
  };
}

export function viewsOf(events: DomainEvent[]): BatchView[] {
  return fold(events).map(viewOf);
}

// ---------------- 命令（校验后产生不可变事件） ----------------

function findBatch(events: DomainEvent[], batchId: string): Batch {
  const b = fold(events).find((x) => x.id === batchId);
  if (!b) throw new Error("批次不存在");
  return b;
}

export interface CreateBatchInput {
  no: string;
  fabric: string;
  gsm: number;
  at?: number;
}

export function createBatch(events: DomainEvent[], input: CreateBatchInput): DomainEvent {
  const no = input.no.trim();
  const fabric = input.fabric.trim();
  if (!no) throw new Error("请填写批次号");
  if (!fabric) throw new Error("请填写面料描述");
  if (!(input.gsm > 0)) throw new Error("克重必须为正数");
  if (fold(events).some((b) => b.no === no)) throw new Error(`批次号 ${no} 已存在`);
  const batchId = uid();
  return {
    type: "BATCH_CREATED",
    id: uid(),
    at: input.at ?? Date.now(),
    batchId,
    no,
    fabric,
    gsm: input.gsm,
  };
}

export interface WeighingInput {
  temp: number;
  humidity: number;
  grams: number;
  at?: number;
}

export function appendWeighing(
  events: DomainEvent[],
  batchId: string,
  input: WeighingInput,
): DomainEvent {
  const b = findBatch(events, batchId);
  const g = latestGen(b);
  if (g.grade) throw new Error("本轮已判级，不能再补称量；如需重测请先修改克重开新轮回潮");
  if (!Number.isFinite(input.temp) || input.temp <= 0) throw new Error("温度数值无效");
  if (!Number.isFinite(input.humidity) || input.humidity <= 0 || input.humidity > 100)
    throw new Error("湿度数值无效（0~100）");
  if (!(input.grams > 0)) throw new Error("称量克重必须为正数");

  const weighing: Weighing = {
    id: uid(),
    at: input.at ?? Date.now(),
    temp: input.temp,
    humidity: input.humidity,
    grams: input.grams,
  };
  return {
    type: "WEIGHING_APPENDED",
    id: uid(),
    at: input.at ?? Date.now(),
    batchId,
    gen: g.gen,
    weighing,
  };
}

export function changeGsm(events: DomainEvent[], batchId: string, to: number): DomainEvent {
  const b = findBatch(events, batchId);
  const g = latestGen(b);
  if (!(to > 0)) throw new Error("克重必须为正数");
  if (Math.abs(to - g.gsm) < 1e-9) throw new Error("新克重与当前克重相同");
  return {
    type: "GSM_CHANGED",
    id: uid(),
    at: Date.now(),
    batchId,
    gen: g.gen + 1,
    from: g.gsm,
    to,
  };
}

export interface GradeInput {
  std: Lab;
  smp: Lab;
  limit: number;
  at?: number;
}

export function recordGrade(
  events: DomainEvent[],
  batchId: string,
  input: GradeInput,
): DomainEvent {
  const b = findBatch(events, batchId);
  const g = latestGen(b);
  if (g.grade) throw new Error("本轮已有判级结果，不能重复判级（仅首个结果生效）");
  const gate = evaluate(g.weighings);
  if (!gate.anchored)
    throw new Error("回潮未合格（环境 20±2℃ / 65±5%RH 且相邻称量差 ≤0.5%），不能判色差");
  if (!(input.limit > 0)) throw new Error("合格 ΔE 上限必须为正数");
  for (const [name, v] of [
    ["标样 L", input.std.l],
    ["标样 a", input.std.a],
    ["标样 b", input.std.b],
    ["试样 L", input.smp.l],
    ["试样 a", input.smp.a],
    ["试样 b", input.smp.b],
  ]) {
    if (!Number.isFinite(v)) throw new Error(`${name} 数值无效`);
  }

  const de = deltaE2000(input.std, input.smp);
  const grade: GradeRecord = {
    id: uid(),
    at: input.at ?? Date.now(),
    std: input.std,
    smp: input.smp,
    de,
    level: grayScaleLevel(de),
    limit: input.limit,
    pass: de <= input.limit,
    gsm: g.gsm,
  };
  return {
    type: "GRADE_RECORDED",
    id: uid(),
    at: input.at ?? Date.now(),
    batchId,
    gen: g.gen,
    grade,
  };
}
