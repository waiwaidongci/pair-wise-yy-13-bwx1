// 纺织染整小样回潮判级台 —— 领域模型

export interface Lab {
  L: number;
  a: number;
  b: number;
}

/** 单次称量（回潮）记录：一经写入不可修改、不可删除，只能继续追加 */
export interface WeighingRecord {
  id: string;
  seq: number; // 该克重周期内的序号，从 1 开始
  time: number;
  temp: number; // ℃
  humidity: number; // %RH
  weight: number; // g
  prevWeight: number | null; // 上一次称量值 g（首次为 null）
  diffPct: number | null; // 与上一次的相对差 %（首次为 null）
  valid: boolean; // 写入时按门控规则判定：环境合格且相邻差合格
  reasons: string[]; // 不合格原因（合格时为空）
}

/** 色差判级结果：同一克重周期仅一份，判定后锁定 */
export interface GradingResult {
  id: string;
  time: number;
  std: Lab; // 标样
  sample: Lab; // 试样
  dL: number;
  da: number;
  db: number;
  dE: number; // CIE76 色差
  grade: string; // 变色灰卡级，如 "4-5"
  verdict: "合格" | "不合格";
  limit: number; // 判定时采用的 ΔE 限值（快照，改设置不追溯旧结果）
}

/**
 * 克重周期（世代）。
 * 修改克重 = 追加一个新世代：旧世代原样保留可查，新世代从待复测重新走流程。
 */
export interface Era {
  id: string;
  gsm: number; // g/m²
  createdAt: number;
  note: string;
  weighings: WeighingRecord[];
  grading: GradingResult | null;
}

export interface Batch {
  id: string;
  batchNo: string;
  fabric: string;
  customer: string;
  gsm: number; // 当前克重（恒等于最后一个世代的 gsm）
  createdAt: number;
  eras: Era[];
}

export interface Settings {
  dELimit: number; // 合格 ΔE 上限
}

export interface AppState {
  version: 1;
  batches: Batch[];
  settings: Settings;
}
