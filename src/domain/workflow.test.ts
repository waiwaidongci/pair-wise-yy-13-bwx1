// 端到端工作流模拟：完全按 UI 会调用的命令序列驱动，验证业务规则闭环
import {
  appendWeighing,
  changeGsm,
  createBatch,
  recordGrade,
  viewOf,
  fold,
} from "./engine";
import type { DomainEvent } from "./types";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function expectThrow(name: string, fn: () => unknown, fragment: string) {
  try {
    fn();
    check(name, false, "应被拒绝");
  } catch (e) {
    check(name, (e as Error).message.includes(fragment), (e as Error).message);
  }
}

// 场景 1：新批次 → 环境失败只能复测 → 补测合格 → 判级 → 改克重全链作废
let evs: DomainEvent[] = [];
evs.push(createBatch(evs, { no: "E2E-1", fabric: "棉", gsm: 150 }));
const id = () => fold(evs).find((b) => b.no === "E2E-1")!.id;
const v = () => viewOf(fold(evs).find((b) => b.no === "E2E-1")!);

check("初始回潮中", v().status === "CONDITIONING");
expectThrow("未称量禁止判级", () =>
  recordGrade(evs, id(), { std: { l: 50, a: 0, b: 0 }, smp: { l: 50, a: 0, b: 0 }, limit: 1 }), "回潮未合格");
evs.push(appendWeighing(evs, id(), { temp: 20, humidity: 65, grams: 10 }));
evs.push(appendWeighing(evs, id(), { temp: 22.6, humidity: 71, grams: 10.001 }));
check("环境超限待复测", v().status === "RETEST" && !v().canGrade);
evs.push(appendWeighing(evs, id(), { temp: 19.5, humidity: 66, grams: 10.04 }));
check("相邻差 0.39% 仍失败（与上一条差）", v().status === "RETEST");
evs.push(appendWeighing(evs, id(), { temp: 20.2, humidity: 64.5, grams: 10.044 })); // 0.04%
check("补测合格待判级", v().status === "READY" && v().canGrade);
evs.push(
  recordGrade(evs, id(), {
    std: { l: 50, a: 2.6772, b: -79.7751 },
    smp: { l: 50, a: 0, b: -82.7485 },
    limit: 1,
  }),
);
check("判级完成（ΔE2.04 超限）", v().status === "GRADED" && v().activeGrade?.pass === false);
const deadGrade = v().activeGrade!;
expectThrow("禁止重复判级", () =>
  recordGrade(evs, id(), { std: { l: 50, a: 0, b: 0 }, smp: { l: 50, a: 0, b: 0 }, limit: 1 }), "不能重复判级");
evs.push(changeGsm(evs, id(), 155));
check("改克重立即待复测", v().status === "RETEST");
check("旧结果可查", v().superseded[0]?.id === deadGrade.id);
check("列表/对比所用派生数据一致（重放幂等）", JSON.stringify(v()) === JSON.stringify(viewOf(fold([...evs]).find((b) => b.no === "E2E-1")!)));

// 场景 2：补测只追加——合格后再补失败记录，首个合格不动
let e2: DomainEvent[] = [];
e2.push(createBatch(e2, { no: "E2E-2", fabric: "涤", gsm: 100 }));
const id2 = fold(e2)[0].id;
e2.push(appendWeighing(e2, id2, { temp: 20, humidity: 65, grams: 20 }));
e2.push(appendWeighing(e2, id2, { temp: 20, humidity: 65, grams: 20.01 })); // 0.05% 合格
const anchor = viewOf(fold(e2)[0]).gate.firstQualifiedPair;
e2.push(appendWeighing(e2, id2, { temp: 30, humidity: 90, grams: 25 })); // 后续失败
const v2 = viewOf(fold(e2)[0]);
check("后续失败不改变首个合格锚点", v2.gate.firstQualifiedPair === anchor && v2.canGrade);
check("称量记录全部保留（仅追加）", v2.gen.weighings.length === 3);

// 场景 3：边界值
let e3: DomainEvent[] = [];
e3.push(createBatch(e3, { no: "E2E-3", fabric: "锦", gsm: 80 }));
const id3 = fold(e3)[0].id;
e3.push(appendWeighing(e3, id3, { temp: 18, humidity: 60, grams: 10 }));
e3.push(appendWeighing(e3, id3, { temp: 22, humidity: 70, grams: 10.05 })); // 0.50% 边界、环境边界
check("环境边界+0.5%整 → 合格", viewOf(fold(e3)[0]).canGrade);

// 场景 4：改克重后新一代完全独立，旧代称量数不受影响
evs.push(appendWeighing(evs, id(), { temp: 20, humidity: 65, grams: 12 }));
const batch = fold(evs).find((b) => b.no === "E2E-1")!;
check("旧代称量仍保留", batch.generations[0].weighings.length === 4);
check("新代称量独立", batch.generations[1].weighings.length === 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
