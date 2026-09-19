// 纯状态内核：无 React 依赖，可在 Node 中直接做集成测试
import type { AppState, Batch, Era, Lab, Settings } from "./types";
import { canGrade, evaluateWeighing, makeGrading } from "./rules";

export const STORAGE_KEY = "moisture-bench-v1";
export const DEFAULT_LIMIT = 1.5;

let seqCounter = 0;
export function newId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${seqCounter}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

// —— 演示数据：覆盖典型状态 ——
export function seed(): AppState {
  const now = Date.now();
  const H = 3600_000;

  const mkWeighing = (
    eraId: string,
    seq: number,
    time: number,
    temp: number,
    humidity: number,
    weight: number,
    prevWeight: number | null
  ) => {
    const r = evaluateWeighing({ temp, humidity, weight, prevWeight });
    return {
      id: `${eraId}_w${seq}`,
      seq,
      time,
      temp,
      humidity,
      weight,
      prevWeight,
      diffPct: r.diffPct === null ? null : Math.round(r.diffPct * 1000) / 1000,
      valid: r.valid,
      reasons: r.reasons,
    };
  };

  // A：回潮中，末次环境超标 → 待复测
  const aEra: Era = {
    id: "seed_a_e1",
    gsm: 180,
    createdAt: now - 30 * H,
    note: "初始克重",
    weighings: [
      mkWeighing("seed_a_e1", 1, now - 8 * H, 20.1, 64, 10.0, null),
      mkWeighing("seed_a_e1", 2, now - 2 * H, 23.4, 58, 9.98, 10.0),
    ],
    grading: null,
  };

  // B：两次合格、恒重达成 → 可判级
  const bEra: Era = {
    id: "seed_b_e1",
    gsm: 120,
    createdAt: now - 26 * H,
    note: "初始克重",
    weighings: [
      mkWeighing("seed_b_e1", 1, now - 7 * H, 20.0, 65, 8.2, null),
      mkWeighing("seed_b_e1", 2, now - 1 * H, 20.3, 66, 8.18, 8.2),
    ],
    grading: null,
  };

  // C：已判级，合格
  const cEra: Era = {
    id: "seed_c_e1",
    gsm: 220,
    createdAt: now - 50 * H,
    note: "初始克重",
    weighings: [
      mkWeighing("seed_c_e1", 1, now - 20 * H, 19.8, 63, 12.5, null),
      mkWeighing("seed_c_e1", 2, now - 12 * H, 20.1, 65, 12.47, 12.5),
    ],
    grading: makeGrading(
      { L: 62.4, a: 3.1, b: -18.2 },
      { L: 62.0, a: 3.3, b: -17.6 },
      DEFAULT_LIMIT,
      now - 10 * H
    ),
  };

  // D：已判级不合格
  const dEra: Era = {
    id: "seed_d_e1",
    gsm: 160,
    createdAt: now - 40 * H,
    note: "初始克重",
    weighings: [
      mkWeighing("seed_d_e1", 1, now - 18 * H, 20.4, 64, 9.4, null),
      mkWeighing("seed_d_e1", 2, now - 11 * H, 19.9, 65, 9.41, 9.4),
    ],
    grading: makeGrading(
      { L: 71.0, a: -2.0, b: 14.0 },
      { L: 72.8, a: -1.1, b: 16.3 },
      DEFAULT_LIMIT,
      now - 9 * H
    ),
  };

  // E：改过克重 —— 旧世代判级保留可查，当前世代待复测
  const eOld: Era = {
    id: "seed_e_e1",
    gsm: 130,
    createdAt: now - 60 * H,
    note: "初始克重",
    weighings: [
      mkWeighing("seed_e_e1", 1, now - 48 * H, 20.0, 65, 7.6, null),
      mkWeighing("seed_e_e1", 2, now - 40 * H, 20.2, 64, 7.59, 7.6),
    ],
    grading: makeGrading(
      { L: 55.2, a: 8.4, b: -6.1 },
      { L: 55.0, a: 8.2, b: -5.8 },
      DEFAULT_LIMIT,
      now - 38 * H
    ),
  };
  const eNew: Era = {
    id: "seed_e_e2",
    gsm: 135,
    createdAt: now - 5 * H,
    note: "客户追加克重规格，旧判级作废",
    weighings: [mkWeighing("seed_e_e2", 1, now - 3 * H, 21.5, 57, 7.9, null)],
    grading: null,
  };

  const batches: Batch[] = [
    { id: "seed_a", batchNo: "LAB-2601", fabric: "棉府绸", customer: "华贸纺织", gsm: 180, createdAt: now - 30 * H, eras: [aEra] },
    { id: "seed_b", batchNo: "LAB-2602", fabric: "涤纶针织", customer: "鼎信服饰", gsm: 120, createdAt: now - 26 * H, eras: [bEra] },
    { id: "seed_c", batchNo: "LAB-2603", fabric: "锦纶塔丝隆", customer: "华贸纺织", gsm: 220, createdAt: now - 50 * H, eras: [cEra] },
    { id: "seed_d", batchNo: "LAB-2604", fabric: "涤棉混纺斜纹", customer: "广越户外", gsm: 160, createdAt: now - 40 * H, eras: [dEra] },
    { id: "seed_e", batchNo: "LAB-2605", fabric: "棉弹力汗布", customer: "鼎信服饰", gsm: 135, createdAt: now - 60 * H, eras: [eOld, eNew] },
  ];

  return { version: 1, batches, settings: { dELimit: DEFAULT_LIMIT } };
}

// —— Reducer：所有写操作都是"追加"，从不修改/删除历史记录 ——
export type Action =
  | {
      type: "addBatch";
      id: string;
      eraId: string;
      batchNo: string;
      fabric: string;
      customer: string;
      gsm: number;
    }
  | { type: "addWeighing"; batchId: string; temp: number; humidity: number; weight: number }
  | { type: "addGrading"; batchId: string; std: Lab; sample: Lab }
  | { type: "changeGsm"; batchId: string; gsm: number; note: string }
  | { type: "updateSettings"; settings: Partial<Settings> }
  | { type: "resetAll" };

function mutateBatch(state: AppState, batchId: string, fn: (b: Batch) => Batch): AppState {
  return {
    ...state,
    batches: state.batches.map((b) => (b.id === batchId ? fn(b) : b)),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "addBatch": {
      const now = Date.now();
      const era: Era = {
        id: action.eraId,
        gsm: action.gsm,
        createdAt: now,
        note: "初始克重",
        weighings: [],
        grading: null,
      };
      const batch: Batch = {
        id: action.id,
        batchNo: action.batchNo.trim(),
        fabric: action.fabric.trim(),
        customer: action.customer.trim() || "未指定客户",
        gsm: action.gsm,
        createdAt: now,
        eras: [era],
      };
      return { ...state, batches: [batch, ...state.batches] };
    }

    case "addWeighing": {
      return mutateBatch(state, action.batchId, (b) => {
        const eraIdx = b.eras.length - 1;
        const era = b.eras[eraIdx];
        const prev = era.weighings[era.weighings.length - 1] ?? null;
        const prevWeight = prev ? prev.weight : null;
        const r = evaluateWeighing({
          temp: action.temp,
          humidity: action.humidity,
          weight: action.weight,
          prevWeight,
        });
        const record = {
          id: newId("w"),
          seq: era.weighings.length + 1,
          time: Date.now(),
          temp: action.temp,
          humidity: action.humidity,
          weight: action.weight,
          prevWeight,
          diffPct: r.diffPct === null ? null : Math.round(r.diffPct * 1000) / 1000,
          valid: r.valid,
          reasons: r.reasons,
        };
        const eras = b.eras.slice();
        eras[eraIdx] = { ...era, weighings: [...era.weighings, record] };
        return { ...b, eras };
      });
    }

    case "addGrading": {
      return mutateBatch(state, action.batchId, (b) => {
        const eraIdx = b.eras.length - 1;
        const era = b.eras[eraIdx];
        // 门控：未恒重不能判；已有结果（首个合格结果）锁定不可覆盖
        if (!canGrade(era)) return b;
        const grading = makeGrading(action.std, action.sample, state.settings.dELimit);
        const eras = b.eras.slice();
        eras[eraIdx] = { ...era, grading };
        return { ...b, eras };
      });
    }

    case "changeGsm": {
      return mutateBatch(state, action.batchId, (b) => {
        if (!Number.isFinite(action.gsm) || action.gsm <= 0 || action.gsm === b.gsm) return b;
        // 追加新世代：旧判级留在旧世代可查，当前立即回到待复测
        const era: Era = {
          id: newId("era"),
          gsm: action.gsm,
          createdAt: Date.now(),
          note: action.note.trim() || `克重由 ${b.gsm} 改为 ${action.gsm} g/m²`,
          weighings: [],
          grading: null,
        };
        return { ...b, gsm: action.gsm, eras: [...b.eras, era] };
      });
    }

    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case "resetAll":
      return seed();

    default:
      return state;
  }
}
