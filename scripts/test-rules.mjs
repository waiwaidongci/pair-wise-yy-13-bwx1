// 领域规则端到端测试：用 esbuild（vite 自带依赖）即时转译，零新增依赖。
// 用法：node scripts/test-rules.mjs
import { build } from "esbuild";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

const ENTRY = fileURLToPath(new URL("./_entry.ts", import.meta.url));
const outPath = fileURLToPath(new URL("./.bundle.mjs", import.meta.url));

await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: outPath,
});

const mod = await import(pathToFileURL(outPath).href);
const R = mod.R;
const C = mod.C;

// 构造批次的小工具
function makeBatch(gsm = 180) {
  const now = 1_000_000;
  return {
    id: "b1",
    batchNo: "T-1",
    fabric: "棉",
    customer: "客户甲",
    gsm,
    createdAt: now,
    eras: [{ id: "e1", gsm, createdAt: now, note: "初始克重", weighings: [], grading: null }],
  };
}

function addW(batch, t, h, w) {
  const era = batch.eras[batch.eras.length - 1];
  const prev = era.weighings[era.weighings.length - 1] ?? null;
  const r = R.evaluateWeighing({ temp: t, humidity: h, weight: w, prevWeight: prev ? prev.weight : null });
  era.weighings.push({
    id: `w${era.weighings.length + 1}`,
    seq: era.weighings.length + 1,
    time: Date.now(),
    temp: t,
    humidity: h,
    weight: w,
    prevWeight: prev ? prev.weight : null,
    diffPct: r.diffPct,
    valid: r.valid,
    reasons: r.reasons,
  });
}

// —— 门控规则 ——
test("环境门控：温度边界 18/22、湿度边界 60/70", () => {
  assert.deepEqual(R.checkEnv(20, 65), { tempOk: true, humOk: true });
  assert.deepEqual(R.checkEnv(18, 60), { tempOk: true, humOk: true });
  assert.deepEqual(R.checkEnv(22, 70), { tempOk: true, humOk: true });
  assert.equal(R.checkEnv(17.9, 65).tempOk, false);
  assert.equal(R.checkEnv(22.1, 65).tempOk, false);
  assert.equal(R.checkEnv(20, 59.9).humOk, false);
  assert.equal(R.checkEnv(20, 70.1).humOk, false);
});

test("相邻称量差：0.5% 边界（≤0.5 合格，>0.5 不合格）", () => {
  const ok = R.evaluateWeighing({ temp: 20, humidity: 65, weight: 10.05, prevWeight: 10 });
  assert.equal(ok.valid, true); // 0.5% 恰好合格
  const bad = R.evaluateWeighing({ temp: 20, humidity: 65, weight: 10.06, prevWeight: 10 });
  assert.equal(bad.valid, false);
  assert.match(bad.reasons.join(), /0\.6/);
  const first = R.evaluateWeighing({ temp: 20, humidity: 65, weight: 10, prevWeight: null });
  assert.equal(first.valid, true); // 首次称量无相邻差
});

test("环境超标的称量即使差值合格也不合格", () => {
  const r = R.evaluateWeighing({ temp: 25, humidity: 65, weight: 10.01, prevWeight: 10 });
  assert.equal(r.valid, false);
  assert.equal(r.reasons.length, 1);
  assert.match(r.reasons[0], /温度/);
});

// —— 状态机 ——
test("批次先回潮：无称量/单次/末次不合格 → 待复测且不能判级", () => {
  let b = makeBatch();
  assert.equal(R.deriveBatch(b).status, "待复测");
  assert.equal(R.canGrade(b.eras[0]), false);

  addW(b, 20, 65, 10);
  assert.equal(R.deriveBatch(b).status, "待复测");
  assert.equal(R.canGrade(b.eras[0]), false);

  // 末次环境超标 → 待复测
  addW(b, 23, 58, 9.99);
  const d = R.deriveBatch(b);
  assert.equal(d.status, "待复测");
  assert.equal(R.canGrade(b.eras[0]), false);
  assert.ok(d.pendingReasons.some((x) => x.includes("温度")));
});

test("末次称量合格即恒重 → 可判级；早期不合格记录保留不影响", () => {
  const b = makeBatch();
  addW(b, 20, 65, 10);
  addW(b, 23, 58, 10.02); // 中间一次不合格
  addW(b, 20.2, 64, 10.03); // 末次合格（差 0.1%）
  const era = b.eras[0];
  assert.equal(era.weighings.length, 3);
  assert.equal(era.weighings[1].valid, false);
  assert.equal(R.isBalanced(era), true);
  assert.equal(R.deriveBatch(b).status, "可判级");
  assert.equal(R.canGrade(era), true);
});

// —— 首个合格结果生效 ——
test("判级后锁定：补测只追加，状态保持已判级，结果不变", () => {
  const b = makeBatch();
  addW(b, 20, 65, 10);
  addW(b, 20, 65, 10.01);
  const g = R.makeGrading({ L: 60, a: 0, b: 0 }, { L: 60.5, a: 0, b: 0 }, 1.5);
  b.eras[0].grading = g;

  assert.equal(R.deriveBatch(b).status, "已判级");
  assert.equal(R.canGrade(b.eras[0]), false);

  // 之后无论追加多少次称量（哪怕不合格），状态与判级都不变
  addW(b, 30, 90, 12);
  addW(b, 20, 65, 12.01);
  assert.equal(b.eras[0].weighings.length, 4);
  assert.equal(R.deriveBatch(b).status, "已判级");
  assert.equal(b.eras[0].grading.id, g.id);
});

// —— 改克重：旧判级失效、回待复测、旧结果可查 ——
test("改克重：追加新世代，旧判级保留可查，当前立即待复测", () => {
  const b = makeBatch(180);
  addW(b, 20, 65, 10);
  addW(b, 20, 65, 10.01);
  b.eras[0].grading = R.makeGrading({ L: 60, a: 0, b: 0 }, { L: 60.4, a: 0, b: 0 }, 1.5);
  assert.equal(R.deriveBatch(b).status, "已判级");

  // 模拟 store.changeGsm
  const oldEraCount = b.eras.length;
  b.gsm = 190;
  b.eras.push({ id: "e2", gsm: 190, createdAt: 2_000_000, note: "改克重", weighings: [], grading: null });

  assert.equal(b.eras.length, oldEraCount + 1);
  const d = R.deriveBatch(b);
  assert.equal(d.status, "待复测");
  assert.equal(b.gsm, 190);
  // 旧结果仍在
  assert.ok(b.eras[0].grading);
  assert.equal(b.eras[0].grading.dE, 0.4);
  assert.equal(b.eras[b.eras.length - 1].grading, null);
  assert.equal(R.canGrade(b.eras[b.eras.length - 1]), false);
});

// —— ΔE 与灰卡 ——
test("ΔE76 计算与合格判定", () => {
  const d = R.colorDiff({ L: 60, a: 2, b: -10 }, { L: 61, a: 4, b: -7 });
  assert.ok(Math.abs(d.dE - Math.sqrt(1 + 4 + 9)) < 1e-9);
  assert.equal(R.greyGrade(0), "5");
  assert.equal(R.greyGrade(0.5), "4-5");
  assert.equal(R.greyGrade(1.2), "4");
  assert.equal(R.greyGrade(10), "1");
  const g = R.makeGrading({ L: 60, a: 0, b: 0 }, { L: 62, a: 0, b: 0 }, 1.5);
  assert.equal(g.verdict, "不合格");
  assert.equal(g.limit, 1.5);
  const g2 = R.makeGrading({ L: 60, a: 0, b: 0 }, { L: 61, a: 0, b: 0 }, 1.5);
  assert.equal(g2.verdict, "合格");
});

test("改 ΔE 限值不追溯：旧判级保留判定时限值快照", () => {
  const g = R.makeGrading({ L: 60, a: 0, b: 0 }, { L: 62, a: 0, b: 0 }, 3.0);
  assert.equal(g.verdict, "合格");
  assert.equal(g.limit, 3.0);
  // 限值后来改为 1.0（store 设置层），但 g 本身不变
});

// ————————————————————————————————————————————————
// store-core 集成测试：驱动真实 reducer，等价于 UI 上的完整操作流
// ————————————————————————————————————————————————

function findBatch(state, no) {
  return state.batches.find((b) => b.batchNo === no);
}

test("集成：种子批次派生状态符合预期", () => {
  const s = C.seed();
  assert.equal(R.deriveBatch(findBatch(s, "LAB-2601")).status, "待复测");
  assert.equal(R.deriveBatch(findBatch(s, "LAB-2602")).status, "可判级");
  assert.equal(R.deriveBatch(findBatch(s, "LAB-2603")).status, "已判级");
  assert.equal(R.deriveBatch(findBatch(s, "LAB-2604")).grading.verdict, "不合格");
  // 2605 改了克重 → 当前待复测，旧判级仍在
  const e = findBatch(s, "LAB-2605");
  assert.equal(R.deriveBatch(e).status, "待复测");
  assert.ok(e.eras[0].grading);
});

test("集成：待复测时强行判级被 reducer 拒绝", () => {
  let s = C.seed();
  const a = findBatch(s, "LAB-2601");
  s = C.reducer(s, {
    type: "addGrading",
    batchId: a.id,
    std: { L: 60, a: 0, b: 0 },
    sample: { L: 60, a: 0, b: 0 },
  });
  assert.equal(findBatch(s, "LAB-2601").eras[0].grading, null);
});

test("集成：补测→判级→再补测，首个合格结果始终生效", () => {
  let s = C.seed();
  const a0 = findBatch(s, "LAB-2601");
  // 1) 末次合格的补测 → 可判级
  s = C.reducer(s, { type: "addWeighing", batchId: a0.id, temp: 20.1, humidity: 65, weight: 9.97 });
  const a1 = findBatch(s, "LAB-2601");
  assert.equal(R.deriveBatch(a1).status, "可判级");
  assert.equal(a1.eras[0].weighings.length, 3); // 只追加

  // 2) 判级
  s = C.reducer(s, {
    type: "addGrading",
    batchId: a0.id,
    std: { L: 60, a: 0, b: 0 },
    sample: { L: 60.4, a: 0, b: 0 },
  });
  const a2 = findBatch(s, "LAB-2601");
  const gId = a2.eras[0].grading.id;
  assert.equal(R.deriveBatch(a2).status, "已判级");

  // 3) 试图用更优 Lab 再判一次 → 被拒绝，首个结果不变
  s = C.reducer(s, {
    type: "addGrading",
    batchId: a0.id,
    std: { L: 60, a: 0, b: 0 },
    sample: { L: 60, a: 0, b: 0 },
  });
  const a3 = findBatch(s, "LAB-2601");
  assert.equal(a3.eras[0].grading.id, gId);
  assert.equal(a3.eras[0].grading.dE, 0.4);

  // 4) 追加环境严重超标的称量 → 只留痕，状态不变
  s = C.reducer(s, { type: "addWeighing", batchId: a0.id, temp: 40, humidity: 90, weight: 13 });
  const a4 = findBatch(s, "LAB-2601");
  assert.equal(a4.eras[0].weighings.length, 4);
  assert.equal(a4.eras[0].weighings[3].valid, false);
  assert.equal(R.deriveBatch(a4).status, "已判级");
  assert.equal(a4.eras[0].grading.id, gId);
});

test("集成：改克重后旧判级立即失效回待复测，旧记录完整可查，且仍不可判", () => {
  let s = C.seed();
  const c0 = findBatch(s, "LAB-2603");
  assert.equal(R.deriveBatch(c0).status, "已判级");
  const oldGrading = c0.eras[0].grading;
  const oldWeighingCount = c0.eras[0].weighings.length;

  s = C.reducer(s, { type: "changeGsm", batchId: c0.id, gsm: 230, note: "客户改规格" });
  const c1 = findBatch(s, "LAB-2603");
  assert.equal(c1.gsm, 230);
  assert.equal(c1.eras.length, 2);
  assert.equal(R.deriveBatch(c1).status, "待复测");
  // 旧世代原样保留
  assert.equal(c1.eras[0].grading.id, oldGrading.id);
  assert.equal(c1.eras[0].weighings.length, oldWeighingCount);
  assert.equal(c1.eras[1].grading, null);
  assert.equal(c1.eras[1].weighings.length, 0);
  // 新周期同样不能跳过回潮直接判
  s = C.reducer(s, {
    type: "addGrading",
    batchId: c0.id,
    std: { L: 1, a: 1, b: 1 },
    sample: { L: 1, a: 1, b: 1 },
  });
  assert.equal(findBatch(s, "LAB-2603").eras[1].grading, null);
});

test("集成：JSON 序列化/反序列化后（模拟刷新）所有派生状态一致", () => {
  let s = C.seed();
  const a = findBatch(s, "LAB-2601");
  s = C.reducer(s, { type: "addWeighing", batchId: a.id, temp: 20.1, humidity: 65, weight: 9.97 });
  s = C.reducer(s, {
    type: "addGrading",
    batchId: a.id,
    std: { L: 60, a: 0, b: 0 },
    sample: { L: 60.4, a: 0, b: 0 },
  });
  s = C.reducer(s, { type: "changeGsm", batchId: a.id, gsm: 185, note: "" });

  // 刷新 = 落盘再读盘
  const restored = JSON.parse(JSON.stringify(s));
  for (const b1 of s.batches) {
    const b2 = restored.batches.find((x) => x.id === b1.id);
    assert.deepEqual(R.deriveBatch(b2).status, R.deriveBatch(b1).status);
    assert.deepEqual(
      R.deriveBatch(b2).pendingReasons,
      R.deriveBatch(b1).pendingReasons
    );
    assert.equal(b2.eras.length, b1.eras.length);
  }
  const a2 = restored.batches.find((x) => x.id === a.id);
  assert.equal(a2.gsm, 185);
  assert.equal(R.deriveBatch(a2).status, "待复测");
  assert.ok(a2.eras[0].grading.verdict === "合格");
});

test("集成：列表视图与 Lab 对比视图同源，生效/失效计数一致", () => {
  // 模拟 Bench 列表统计 + LabCompare 行构造的同一派生口径
  const s = C.seed();
  let effective = 0;
  let superseded = 0;
  const labRows = [];
  for (const b of s.batches) {
    const d = R.deriveBatch(b);
    if (d.grading) effective++;
    b.eras.slice(0, -1).forEach((era) => {
      if (era.grading) superseded++;
    });
    b.eras.forEach((era, i) => {
      if (era.grading) labRows.push({ batchNo: b.batchNo, effective: era.id === d.currentEra.id, i });
    });
  }
  // 种子：生效判级 2 份（2603、2604），失效留档 1 份（2605 旧世代）
  assert.equal(effective, 2);
  assert.equal(superseded, 1);
  assert.equal(labRows.length, 3);
  assert.equal(labRows.filter((r) => r.effective).length, 2);
  assert.equal(labRows.filter((r) => !r.effective).length, 1);
  assert.ok(labRows.some((r) => r.batchNo === "LAB-2605" && !r.effective));
});

test("集成：新建批次从待复测开始，两次合格称量后才能判级", () => {
  let s = C.seed();
  s = C.reducer(s, {
    type: "addBatch",
    id: "b_new",
    eraId: "e_new",
    batchNo: "LAB-9001",
    fabric: "新布",
    customer: "新客",
    gsm: 100,
  });
  const b = findBatch(s, "LAB-9001");
  assert.equal(R.deriveBatch(b).status, "待复测");
  s = C.reducer(s, { type: "addWeighing", batchId: b.id, temp: 20, humidity: 65, weight: 5 });
  assert.equal(R.deriveBatch(findBatch(s, "LAB-9001")).status, "待复测"); // 仅 1 次
  s = C.reducer(s, { type: "addWeighing", batchId: b.id, temp: 20, humidity: 65, weight: 5.01 });
  assert.equal(R.deriveBatch(findBatch(s, "LAB-9001")).status, "可判级");
});

test("集成：改 ΔE 限值只影响新判级，历史结果快照不变", () => {
  let s = C.seed();
  const d0 = findBatch(s, "LAB-2604");
  const oldLimit = d0.eras[0].grading.limit;
  s = C.reducer(s, { type: "updateSettings", settings: { dELimit: 5 } });
  const d1 = findBatch(s, "LAB-2604");
  assert.equal(d1.eras[0].grading.limit, oldLimit);
  assert.equal(d1.eras[0].grading.verdict, "不合格"); // 历史判定不改写
});

process.on("exit", () => {
  for (const f of [outPath, fileURLToPath(new URL("./rules.js", import.meta.url)), fileURLToPath(new URL("./store-core.js", import.meta.url))]) {
    try {
      rmSync(f);
    } catch {}
  }
});
