import { useMemo, useState } from "react";
import { useStore } from "../logic/store";
import { deriveBatch } from "../logic/rules";
import type { BatchStatus } from "../logic/rules";
import { BatchList } from "./BatchList";
import { BatchDetail } from "./BatchDetail";
import { LabCompare } from "./LabCompare";
import { CreateBatch } from "./CreateBatch";

type Tab = "bench" | "lab";

function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set: React.Dispatch<React.SetStateAction<T>> = (updater) => {
    setV((prev) => {
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return [v, set];
}

export function Bench() {
  const { state } = useStore();
  const [tab, setTab] = usePersistentState<Tab>("mb-ui-tab", "bench");
  const [selectedId, setSelectedId] = usePersistentState<string | null>("mb-ui-selected", null);
  const [customer, setCustomer] = useState("全部客户");
  const [statusFilter, setStatusFilter] = useState<"全部" | BatchStatus>("全部");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const customers = useMemo(
    () => Array.from(new Set(state.batches.map((b) => b.customer))).sort(),
    [state.batches]
  );

  const stats = useMemo(() => {
    let pending = 0;
    let ready = 0;
    let pass = 0;
    let fail = 0;
    let invalidated = 0;
    for (const b of state.batches) {
      const d = deriveBatch(b);
      if (d.status === "待复测") pending += 1;
      else if (d.status === "可判级") ready += 1;
      else if (d.grading?.verdict === "合格") pass += 1;
      else fail += 1;
      // 旧克重周期中存在判级 → 该结果已因改克重失效
      if (b.eras.slice(0, -1).some((e) => e.grading)) invalidated += 1;
    }
    return { total: state.batches.length, pending, ready, pass, fail, invalidated };
  }, [state.batches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.batches.filter((b) => {
      if (customer !== "全部客户" && b.customer !== customer) return false;
      if (statusFilter !== "全部" && deriveBatch(b).status !== statusFilter) return false;
      if (q && !`${b.batchNo} ${b.fabric} ${b.customer}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [state.batches, customer, statusFilter, query]);

  const selected = state.batches.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="layout">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">回</span>
          <div>
            <h1>纺织染整小样 · 回潮判级台</h1>
            <p>先回潮恒重，后判色差 · 改克重旧判级立即失效 · 补测仅追加，首个合格结果生效</p>
          </div>
        </div>
        <nav className="tabs">
          <button className={tab === "bench" ? "active" : ""} onClick={() => setTab("bench")}>
            批次判级台
          </button>
          <button className={tab === "lab" ? "active" : ""} onClick={() => setTab("lab")}>
            Lab 色差对比
          </button>
        </nav>
      </header>

      <section className="stats">
        <div className="stat"><small>批次总数</small><strong>{stats.total}</strong></div>
        <div className="stat stat-pending"><small>待复测</small><strong>{stats.pending}</strong></div>
        <div className="stat stat-ready"><small>可判级</small><strong>{stats.ready}</strong></div>
        <div className="stat stat-pass"><small>判级合格</small><strong>{stats.pass}</strong></div>
        <div className="stat stat-fail"><small>判级不合格</small><strong>{stats.fail}</strong></div>
        <div className="stat stat-old"><small>旧判级已失效</small><strong>{stats.invalidated}</strong></div>
      </section>

      {tab === "lab" ? (
        <LabCompare />
      ) : (
        <>
          <section className="toolbar panel">
            <div className="filters">
              <input
                className="search"
                placeholder="搜索批次号 / 面料 / 客户"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
                <option>全部客户</option>
                {customers.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "全部" | BatchStatus)}
              >
                <option>全部</option>
                <option>待复测</option>
                <option>可判级</option>
                <option>已判级</option>
              </select>
            </div>
            <button className="primary" onClick={() => setShowCreate(true)}>
              + 新建批次
            </button>
          </section>

          <div className="bench-grid">
            <BatchList
              batches={filtered}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelectedId(id)}
            />
            {selected ? (
              <BatchDetail batch={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <section className="panel detail-empty">
                <p>← 从列表选择一个批次</p>
                <span>在此录入回潮称量、追加复测、判定色差，或修改克重开新周期。</span>
              </section>
            )}
          </div>
        </>
      )}

      {showCreate && (
        <CreateBatch
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            setSelectedId(id);
            setTab("bench");
          }}
        />
      )}
    </div>
  );
}
