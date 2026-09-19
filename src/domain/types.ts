// 领域模型：纺织染整小样回潮判级台
// 规则要点：
// 1) 批次必须先回潮；环境须满足 20±2℃、65±5%RH，相邻两次称量差 ≤0.5% 才算回潮合格；
// 2) 不满足时批次只能处于“待复测”，禁止判色差；
// 3) 补测只追加称量记录，仅首个合格结果生效；
// 4) 判级后修改克重：立即开新轮回潮（旧判级作废，批次回到待复测），历史仍可查。

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export interface Weighing {
  id: string;
  at: number;
  temp: number; // ℃
  humidity: number; // %RH
  grams: number; // 试样称量 g
}

export interface GradeRecord {
  id: string;
  at: number;
  std: Lab; // 标样
  smp: Lab; // 试样
  de: number; // ΔE00
  level: number; // 变色灰卡等级 1 ~ 5（含半级）
  limit: number; // 判级时采用的合格 ΔE 上限
  pass: boolean;
  gsm: number; // 判级时该轮回潮所用克重（快照）
}

export type GenReason = "create" | "gsm";

export interface Generation {
  gen: number; // 代次，0 = 新建批次；每次改克重 +1
  gsm: number; // 本代克重 g/m²
  reason: GenReason;
  weighings: Weighing[]; // 仅追加
  grade: GradeRecord | null; // 本代判级（一代仅一次）
  gsmFrom: number | null; // reason=gsm 时的旧克重
}

export interface Batch {
  id: string;
  no: string;
  fabric: string;
  createdAt: number;
  generations: Generation[];
}

// 批次状态
export type BatchStatus = "CONDITIONING" | "RETEST" | "READY" | "GRADED";

export const STATUS_LABEL: Record<BatchStatus, string> = {
  CONDITIONING: "回潮中",
  RETEST: "待复测",
  READY: "待判级",
  GRADED: "已判级",
};

// 事件溯源：所有变更都是不可变事件
export type DomainEvent =
  | {
      type: "BATCH_CREATED";
      id: string;
      at: number;
      batchId: string;
      no: string;
      fabric: string;
      gsm: number;
    }
  | {
      type: "GSM_CHANGED";
      id: string;
      at: number;
      batchId: string;
      gen: number;
      from: number;
      to: number;
    }
  | {
      type: "WEIGHING_APPENDED";
      id: string;
      at: number;
      batchId: string;
      gen: number;
      weighing: Weighing;
    }
  | {
      type: "GRADE_RECORDED";
      id: string;
      at: number;
      batchId: string;
      gen: number;
      grade: GradeRecord;
    };
