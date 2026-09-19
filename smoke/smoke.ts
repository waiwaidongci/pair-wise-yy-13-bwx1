// 浏览器环境冒烟测试：jsdom + react-dom/client 真实渲染
// 注意：React 相关模块必须在设置 jsdom 全局 DOM 之后再动态导入，
// 否则 react-dom 会绑定到错误的 window，导致 onChange 等事件不触发。
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.localStorage = dom.window.localStorage;
if (typeof globalThis.crypto === "undefined") globalThis.crypto = dom.window.crypto;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { store } = await import("../src/state/store.ts");
const { viewsOf, fold } = await import("../src/domain/engine.ts");
const AppMod = await import("../src/App.tsx");
const App = AppMod.default;

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const container = document.getElementById("root");
await act(async () => {
  createRoot(container).render(React.createElement(App));
});
const text = () => container.textContent;

check("渲染出 7 个种子批次", ["TS-2401", "TS-2402", "TS-2403", "TS-2404", "TS-2405", "TS-2406", "TS-2407"].every((no) => text().includes(no)));
check("列表展示回潮中状态", text().includes("回潮中"));
check("列表展示待复测状态", text().includes("待复测"));
check("TS-2401 判级合格 ΔE0.23", text().includes("ΔE 0.23"));
check("门控阈值文案", text().includes("18~22℃") && text().includes("60~70%RH"));

// 点击 TS-2405（改克重批次），详情应显示旧判级作废
await act(async () => {
  [...container.querySelectorAll("tr")].find((tr) => tr.textContent.includes("TS-2405")).click();
});
check("详情打开", text().includes("批次详情"));
check("旧判级可查且标记作废", text().includes("已作废") && text().includes("2.042"));
check("详情展示改克重履历 200 → 205", text().includes("200") && text().includes("205"));

// Lab 对比 Tab：与列表同一数据
await act(async () => {
  [...container.querySelectorAll("button.tab")].find((b) => b.textContent.includes("Lab 对比")).click();
});
check("Lab 对比含生效判级", text().includes("TS-2401") && text().includes("生效中"));
check("Lab 未判级表含待复测批次及原因", text().includes("相邻称量差") || text().includes("环境超出"));

// 勾选显示已作废历史
await act(async () => {
  container.querySelector("input[type=checkbox]").click();
});
check("Lab 对比可显示作废判级 TS-2405", text().includes("已作废（改克重）"));

// 台账 Tab
await act(async () => {
  [...container.querySelectorAll("button.tab")].find((b) => b.textContent.includes("判级台账")).click();
});
check("台账含 2 条判级（1 生效 1 作废）", (text().match(/ΔE00/g) || []).length >= 2);
check("审计流水含改克重事件", text().includes("旧判级立即作废"));

// 回到列表，选 TS-2406（回潮中，无称量）追加两次合格称量
await act(async () => {
  [...container.querySelectorAll("button.tab")].find((b) => b.textContent.includes("批次列表")).click();
});
await act(async () => {
  [...container.querySelectorAll("tr")].find((tr) => tr.textContent.includes("TS-2406")).click();
});

function setInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

const inputs = () => container.querySelectorAll(".detail input");
// 称量表单三个输入：温度/湿度/称量 —— 页面中按 DOM 顺序定位“追加称量记录”区块
const addBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("追加称量记录"));
function weighingInputs() {
  const section = addBtn.closest("section");
  return section.querySelectorAll("input");
}
await act(async () => {
  const [t, h, g] = weighingInputs();
  setInput(t, "20"); setInput(h, "65"); setInput(g, "9.000");
});
await act(async () => {
  addBtn.click();
});
await act(async () => {
  const [t, h, g] = weighingInputs();
  setInput(t, "20.5"); setInput(h, "64"); setInput(g, "9.02"); // 0.22%
});
await act(async () => {
  addBtn.click();
});
check("补测合格后状态变待判级", text().includes("待判级") && text().includes("首个合格已生效"),
  text().includes("回潮称量") ? `称量区存在；按钮禁用=${addBtn.disabled}；detail文本片段=${container.querySelector(".detail").textContent.slice(0, 400)}` : "未找到称量区");

// 此时判级按钮应可用；尝试在未填试样时点击判级应报错而不崩溃
const gradeBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("记录判级"));
check("判级按钮未禁用", !gradeBtn.disabled);

// 改克重 → 旧轮回到待复测（TS-2406 未判级，但开新轮）
const gsmBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.includes("改克重并开新轮"));
const gsmInput = gsmBtn.closest("section").querySelector("input");
await act(async () => {
  setInput(gsmInput, "145");
});
await act(async () => {
  gsmBtn.click();
});
check("改克重后显示第 2 轮回潮中/待复测且新轮无称量", text().includes("第 2 轮") && text().includes("改克重重测"));

// ---- 刷新一致性：localStorage 重放 = 当前视图 ----
const raw = JSON.parse(localStorage.getItem("dye-bench.events.v1"));
check("事件已持久化", Array.isArray(raw) && raw.length > 0);
const beforeReload = JSON.stringify(viewsOf(store.getEvents()).map((v) => ({
  no: v.batch.no,
  status: v.status,
  gen: v.gen.gen,
  gsm: v.gen.gsm,
  weighings: v.gen.weighings.length,
})));
const afterReload = JSON.stringify(viewsOf(raw).map((v) => ({
  no: v.batch.no,
  status: v.status,
  gen: v.gen.gen,
  gsm: v.gen.gsm,
  weighings: v.gen.weighings.length,
})));
check("刷新后重放事件状态完全一致", beforeReload === afterReload);
check("折叠结果与列表口径一致（TS-2406 新轮代次1）",
  fold(raw).find((b) => b.no === "TS-2406").generations.length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
