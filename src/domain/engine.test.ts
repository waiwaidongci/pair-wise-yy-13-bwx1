import { deltaE2000, grayScaleLevel } from "./color";
import {
  appendWeighing,
  changeGsm,
  createBatch,
  envOk,
  fold,
  gateOf,
  MAX_REL_DIFF,
  recordGrade,
  statusOf,
  viewOf,
  viewsOf,
} from "./engine";
import type { DomainEvent } from "./types";

let passed = 0;
let failed = 0;

function approx(a: number, b: number, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function throws(name: string, fn: () => unknown, expect?: string) {
  try {
    fn();
    check(name, false, "应抛出错误");
  } catch (e) {
    const msg = (e as Error).message;
    check(name, expect ? msg.includes(expect) : true, msg);
  }
}

// ---------- CIEDE2000 标准向量（Sharma 2005 10 组中的关键组） ----------
const stdVectors: Array<[[number, number, number], [number, number, number], number]> = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425], // Sharma 2005 第 1 组
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615], // 第 2 组
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[61.2901, 35.0788, 1.0196], [35.0831, -44.1164, 3.5249], 63.7897],
  [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
];
for (const [s, m, want] of stdVectors) {
  const de = deltaE2000(
    { l: s[0], a: s[1], b: s[2] },
    { l: m[0], a: m[1], b: m[2] },
  );
  check(`ΔE00 向量 ${want}`, approx(de, want, 1e-3), `got ${de}`);
}
check("ΔE00 相同色 = 0", approx(deltaE2000({ l: 40, a: 10, b: -20 }, { l: 40, a: 10, b: -20 }), 0, 1e-12));
check("灰卡等级边界", grayScaleLevel(0.05) === 5 && grayScaleLevel(0.5) === 3 && grayScaleLevel(3) === 1);

// ---------- 环境门控 ----------
check("环境 20.0/65 合格", envOk(20.0, 65));
check("环境边界 18.0/60 合格", envOk(18, 60));
check("温度 22.1 不合格", !envOk(22.1, 65));
check("湿度 70.1 不合格", !envOk(20, 70.1));

// ---------- 完整规则走查 ----------
let evs: DomainEvent[] = [];
evs.push(createBatch(evs, { no: "B1", fabric: "棉", gsm: 100 }));
const bId = () => fold(evs)[0].id;

check("新建批次 = 回潮中", statusOf(fold(evs)[0]) === "CONDITIONING");

// 仅 1 次称量 → 待复测
evs.push(appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 10 }));
check("1 次称量 = 待复测", statusOf(fold(evs)[0]) === "RETEST");

// 环境超限 → 待复测，禁止判级
evs.push(appendWeighing(evs, bId(), { temp: 23, humidity: 65, grams: 10.01 }));
check("环境超限 = 待复测", statusOf(fold(evs)[0]) === "RETEST");
throws("环境超限禁止判级", () =>
  recordGrade(evs, bId(), { std: { l: 50, a: 0, b: 0 }, smp: { l: 50, a: 0, b: 0 }, limit: 1 }), "回潮未合格");

// 补测：环境恢复但相邻差 >0.5% → 仍待复测
evs.push(appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 10.2 }));
let v = viewOf(fold(evs)[0]);
check("相邻差 1.9% 待复测", v.status === "RETEST" && !v.canGrade);
check("门控原因提示相邻差", v.gate.reasons.some((r) => r.includes("0.5%")));

// 补测合格（差 0.2%）→ 待判级，首个合格结果生效
evs.push(appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 10.22 }));
v = viewOf(fold(evs)[0]);
check("补测合格 = 待判级", v.status === "READY" && v.canGrade);
check("首个合格对已锁定", v.gate.firstQualifiedPair === 2);

// 合格后再补一条失败称量 → 门控不被推翻（仅首个合格生效）
evs.push(appendWeighing(evs, bId(), { temp: 25, humidity: 80, grams: 11 }));
v = viewOf(fold(evs)[0]);
check("后续补测失败不推翻首个合格", v.status === "READY" && v.canGrade);

// 判级 → 已判级，不能重复判级/补称
evs.push(
  recordGrade(evs, bId(), {
    std: { l: 50, a: 2.6772, b: -79.7751 },
    smp: { l: 50, a: 0, b: -82.7485 },
    limit: 1.0,
  }),
);
v = viewOf(fold(evs)[0]);
check("判级后 = 已判级", v.status === "GRADED");
check("ΔE 2.0425 判不合格", v.activeGrade?.pass === false && approx(v.activeGrade!.de, 2.0425, 1e-3));
throws("已判级禁止再判级", () =>
  recordGrade(evs, bId(), { std: { l: 50, a: 0, b: 0 }, smp: { l: 50, a: 0, b: 0 }, limit: 1 }), "不能重复判级");
throws("已判级禁止补称量", () => appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 11 }), "已判级");

// 旧判级可查
check("旧判级记录不可变", evs.filter((e) => e.type === "GRADE_RECORDED").length === 1);

// 改克重 → 立即作废、回待复测，旧结果仍可查
const oldGradeAt = v.activeGrade!.at;
evs.push(changeGsm(evs, bId(), 110));
v = viewOf(fold(evs)[0]);
check("改克重后 = 待复测", v.status === "RETEST");
check("新轮代次 = 1", v.gen.gen === 1 && v.gen.gsm === 110);
check("新轮无称量无判级", v.gen.weighings.length === 0 && v.activeGrade === null);
check("旧判级进入 superseded 仍可查", v.superseded.length === 1 && v.superseded[0].at === oldGradeAt);
check("canGrade=false", !v.canGrade);

// 新轮独立走一遍：仍须先回潮
evs.push(appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 5 }));
evs.push(appendWeighing(evs, bId(), { temp: 20, humidity: 65, grams: 5.001 }));
v = viewOf(fold(evs)[0]);
check("新轮合格后可重新判级", v.canGrade && v.status === "READY");
evs.push(
  recordGrade(evs, bId(), {
    std: { l: 50, a: 0, b: 0 },
    smp: { l: 50, a: 0, b: 0 },
    limit: 1,
  }),
);
v = viewOf(fold(evs)[0]);
check("新轮判级 ΔE0 合格 5 级", v.status === "GRADED" && v.activeGrade?.pass === true && v.activeGrade.level === 5);
check("旧结果仍保留可查（共 2 次判级）", v.superseded.length === 1);

// ---------- 0.5% 边界：正好 0.5% 合格，超过 0.5% 不合格 ----------
let e2: DomainEvent[] = [];
e2.push(createBatch(e2, { no: "B2", fabric: "涤", gsm: 90 }));
const id2 = fold(e2).find((b) => b.no === "B2")!.id;
e2.push(appendWeighing(e2, id2, { temp: 20, humidity: 65, grams: 100 }));
e2.push(appendWeighing(e2, id2, { temp: 20, humidity: 65, grams: 100.5 })); // 0.50%
check("相邻差正好 0.5% 合格", gateOf(fold(e2)[0]).anchored);

let e3: DomainEvent[] = [];
e3.push(createBatch(e3, { no: "B3", fabric: "锦", gsm: 90 }));
const id3 = fold(e3).find((b) => b.no === "B3")!.id;
e3.push(appendWeighing(e3, id3, { temp: 20, humidity: 65, grams: 100 }));
e3.push(appendWeighing(e3, id3, { temp: 20, humidity: 65, grams: 100.501 })); // >0.5%
check("相邻差略超 0.5% 不合格", !gateOf(fold(e3)[0]).anchored);
check("常量 = 0.005", MAX_REL_DIFF === 0.005);

// ---------- 输入校验 ----------
throws("批次号不可重复", () => createBatch(e3, { no: "B3", fabric: "x", gsm: 1 }), "已存在");
throws("克重非法", () => createBatch(e3, { no: "BX", fabric: "x", gsm: 0 }), "正数");
throws("湿度越界", () => appendWeighing(e3, id3, { temp: 20, humidity: 101, grams: 1 }), "湿度");
throws("称量非法", () => appendWeighing(e3, id3, { temp: 20, humidity: 65, grams: -1 }), "正数");
throws("改成相同克重拒绝", () => changeGsm(e2, id2, 90), "相同");
throws("不存在批次", () => changeGsm(e2, "nope", 100), "不存在");

// ---------- 列表派生一致性（viewsOf 与事件重放） ----------
check("viewsOf 数量正确", viewsOf(evs).length === 1);
check("重新折叠状态一致", JSON.stringify(viewOf(fold(evs)[0])) === JSON.stringify(viewOf(fold([...evs])[0])));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
