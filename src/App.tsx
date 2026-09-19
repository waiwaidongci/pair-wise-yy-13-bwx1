import { useMemo, useState } from "react";
import "./styles.css";
import { DetailPanel } from "./components/DetailPanel";
import { LabCompare } from "./components/LabCompare";
import { LedgerView } from "./components/LedgerView";
import { ListView } from "./components/ListView";
import { fold, viewOf, viewsOf, HUM_MAX, HUM_MIN, TEMP_MAX, TEMP_MIN } from "./domain/engine";
import { store, useEvents, useSettings } from "./state/store";
import type { BatchStatus } from "./domain/types";

type Tab = "list" | "lab" | "ledger";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "list", label: "批次列表" },
  { key: "lab", label: "Lab 对比" },
  { key: "ledger", label: "判级台账" },
];

export default function App() {
  const events = useEvents();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState(String(settings.limit));

  const views = useMemo(() => viewsOf(events), [events]);
  const selected = useMemo(
    () => (selectedId ? fold(events).find((b) => b.id === selectedId) : undefined),
    [events, selectedId],
  );
  const selectedView = selected ? viewOf(selected) : null;

  const stats = useMemo(() => {
    const count = (s: BatchStatus) => views.filter((v) => v.status === s).length;
    const blocked = count("CONDITIONING") + count("RETEST");
    const graded = views.filter((v) => v.status === "GRADED");
    const pass = graded.filter((v) => v.activeGrade?.pass).length;
    const passRate = graded.length ? Math.round((pass / graded.length) * 100) : 0;
    return { total: views.length, blocked, pass, passRate };
  }, [views]);

  const selectBatch = (id: string) => {
    setSelectedId(id);
    setTab("list");
  };

  return (
    <main className="app">
      <header className="topbar panel">
        <div>
          <p className="kicker">纺织染整实验室</p>
          <h1>小样回潮判级台</h1>
          <p className="muted">
            先回潮后判色 · 环境 {TEMP_MIN}~{TEMP_MAX}℃ / {HUM_MIN}~{HUM_MAX}%RH ·
            相邻称量差 ≤0.5% · 补测仅追加，首个合格生效 · 改克重旧判级即废
          </p>
        </div>
        <div className="topbar-tools">
          <label className="limit-set">
            合格 ΔE00 上限
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
            />
            <button
              onClick={() => {
                const n = Number(limitDraft);
                if (n > 0) store.setSettings({ limit: n });
              }}
            >
              应用
            </button>
          </label>
          <button onClick={() => store.resetToSeed()}>恢复演示数据</button>
          <button onClick={() => store.clearAll()}>清空</button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>批次总数</small>
          <strong>{stats.total}</strong>
        </article>
        <article>
          <small>回潮中/待复测（不可判色）</small>
          <strong className="warn-num">{stats.blocked}</strong>
        </article>
        <article>
          <small>已判级合格</small>
          <strong className="ok-num">{stats.pass}</strong>
        </article>
        <article>
          <small>判级通过率</small>
          <strong>{stats.passRate}%</strong>
        </article>
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "tab active" : "tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="layout">
        <div className="layout-main">
          {tab === "list" && (
            <ListView views={views} selectedId={selectedId} onSelect={setSelectedId} />
          )}
          {tab === "lab" && <LabCompare events={events} onSelect={selectBatch} />}
          {tab === "ledger" && <LedgerView events={events} onSelect={selectBatch} />}
        </div>
        <div className="layout-side">
          <DetailPanel view={selectedView} onClose={() => setSelectedId(null)} />
        </div>
      </div>

      <footer className="footnote muted">
        数据保存在浏览器 localStorage（事件溯源，append-only）；刷新页面、同一浏览器多标签页之间状态保持一致。
      </footer>
    </main>
  );
}
