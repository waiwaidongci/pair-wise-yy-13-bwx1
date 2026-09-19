// 领域规则：回潮门控、首个合格结果生效、色差计算与灰卡评级
import type { Batch, Era, GradingResult, Lab, WeighingRecord } from "./types";

// —— 回潮环境门控：20±2℃ / 65±5%RH ——
export const TEMP_MIN = 18;
export const TEMP_MAX = 22;
export const HUM_MIN = 60;
export const HUM_MAX = 70;
/** 相邻称量相对差上限 0.5% */
export const DIFF_PCT_MAX = 0.5;
/** 浮点容差（实际称量精度远小于此），保证 0.5% 边界判定稳定 */
const EPS = 1e-9;

export interface EnvCheck {
  tempOk: boolean;
  humOk: boolean;
}

export function checkEnv(temp: number, humidity: number): EnvCheck {
  return {
    tempOk: temp >= TEMP_MIN - EPS && temp <= TEMP_MAX + EPS,
    humOk: humidity >= HUM_MIN - EPS && humidity <= HUM_MAX + EPS,
  };
}

export function relativeDiffPct(weight: number, prev: number | null): number | null {
  if (prev === null || prev <= 0) return null;
  return (Math.abs(weight - prev) / prev) * 100;
}

/**
 * 校验一次称量是否"合格"：
 * 环境必须同时合格（温度与湿度），且相邻称量相对差不大于 0.5%。
 */
export function evaluateWeighing(input: {
  temp: number;
  humidity: number;
  weight: number;
  prevWeight: number | null;
}): { valid: boolean; reasons: string[]; diffPct: number | null } {
  const reasons: string[] = [];
  const env = checkEnv(input.temp, input.humidity);
  if (!env.tempOk) reasons.push(`温度 ${input.temp}℃ 超出 ${TEMP_MIN}~${TEMP_MAX}℃`);
  if (!env.humOk) reasons.push(`湿度 ${input.humidity}% 超出 ${HUM_MIN}~${HUM_MAX}%`);

  const diffPct = relativeDiffPct(input.weight, input.prevWeight);
  if (diffPct !== null && diffPct > DIFF_PCT_MAX + EPS) {
    reasons.push(`相邻称量差 ${diffPct.toFixed(3)}% > ${DIFF_PCT_MAX}%`);
  }
  return { valid: reasons.length === 0, reasons, diffPct };
}

/**
 * 该克重周期是否已完成回潮平衡：
 * 至少有 2 次称量，且最后一次合格（环境合格 + 相邻差合格）即视为恒重。
 * 只追加不改写：早期不合格的称量仍保留在记录中，不影响最后一次合格的效力。
 */
export function isBalanced(era: Era): boolean {
  const last = era.weighings[era.weighings.length - 1];
  return era.weighings.length >= 2 && !!last && last.valid;
}

/** 首个合格结果生效：一旦已有判级结果，后续补测/复测均不得覆盖 */
export function canGrade(era: Era): boolean {
  return era.grading === null && isBalanced(era);
}

// —— 色差：CIE Lab ΔE76 ——
export function colorDiff(std: Lab, sample: Lab) {
  const dL = sample.L - std.L;
  const da = sample.a - std.a;
  const db = sample.b - std.b;
  const dE = Math.sqrt(dL * dL + da * da + db * db);
  return { dL, da, db, dE };
}

/**
 * 变色灰卡级数（GB/T 250 风格的 5 级 9 档）：
 * 5 / 4-5 / 4 / 3-4 / 3 / 2-3 / 2 / 1-2 / 1
 * 阈值取自常见 ΔE 对照表。
 */
const GREY_SCALE: { grade: string; max: number }[] = [
  { grade: "5", max: 0.2 },
  { grade: "4-5", max: 0.6 },
  { grade: "4", max: 1.2 },
  { grade: "3-4", max: 2.0 },
  { grade: "3", max: 3.0 },
  { grade: "2-3", max: 4.1 },
  { grade: "2", max: 5.4 },
  { grade: "1-2", max: 6.9 },
  { grade: "1", max: Infinity },
];

export function greyGrade(dE: number): string {
  return GREY_SCALE.find((g) => dE <= g.max)?.grade ?? "1";
}

export function makeGrading(
  std: Lab,
  sample: Lab,
  dELimit: number,
  now = Date.now()
): GradingResult {
  const { dL, da, db, dE } = colorDiff(std, sample);
  return {
    id: `gr_${now}_${Math.random().toString(36).slice(2, 8)}`,
    time: now,
    std: { ...std },
    sample: { ...sample },
    dL: round3(dL),
    da: round3(da),
    db: round3(db),
    dE: round3(dE),
    grade: greyGrade(dE),
    verdict: dE <= dELimit ? "合格" : "不合格",
    limit: dELimit,
  };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

// —— 批次派生状态：列表、详情、Lab 对比共用同一函数 ——
export type BatchStatus = "待复测" | "可判级" | "已判级";

export interface BatchDerived {
  currentEra: Era;
  status: BatchStatus;
  /** 待复测原因（环境 / 恒重未达成），可判级与已判级时为空 */
  pendingReasons: string[];
  grading: GradingResult | null;
  lastWeighing: WeighingRecord | null;
  weighingCount: number;
}

export function deriveBatch(batch: Batch): BatchDerived {
  const era = batch.eras[batch.eras.length - 1];
  const last = era.weighings[era.weighings.length - 1] ?? null;

  let status: BatchStatus;
  const pendingReasons: string[] = [];

  if (era.grading) {
    status = "已判级";
  } else if (isBalanced(era)) {
    status = "可判级";
  } else {
    status = "待复测";
    if (era.weighings.length === 0) {
      pendingReasons.push("尚无回潮称量记录");
    } else if (era.weighings.length === 1) {
      pendingReasons.push("仅 1 次称量，需再次称量确认恒重");
    }
    if (last && !last.valid) pendingReasons.push(...last.reasons);
  }

  return {
    currentEra: era,
    status,
    pendingReasons,
    grading: era.grading,
    lastWeighing: last,
    weighingCount: era.weighings.length,
  };
}

/** 克重是否可改：任何状态都可改；改了就开新世代（由 store 处理） */
export function gsmChanged(batch: Batch, nextGsm: number): boolean {
  return batch.gsm !== nextGsm;
}
