import { useMemo, useState } from "react";
import { useStore } from "../logic/store";
import { colorDiff, deriveBatch, greyGrade } from "../logic/rules";
import type { Era } from "../logic/types";
import { parseNum } from "../utils/format";
import { VerdictTag } from "./Badges";

interface Row {
  batchNo: string;
  fabric: string;
  customer: string;
  era: Era;
  eraIndex: number; // 0 = 最旧
  eraCount: number;
  effective: boolean; // 是否当前克重周期（生效中）
}

export function LabCompare() {
  const { state, dispatch } = useStore();

  // 所有判级行：当前周期 = 生效；旧周期 = 已失效但可查。全部来自同一份 state
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const b of state.batches) {
      const d = deriveBatch(b);
      b.eras.forEach((era, i) => {
        if (era.grading) {
          out.push({
            batchNo: b.batchNo,
            fabric: b.fabric,
            customer: b.customer,
            era,
            eraIndex: i,
            eraCount: b.eras.length,
            effective: era.id === d.currentEra.id,
          });
        }
      });
    }
    // 生效在前，同批次按世代倒序
    return out.sort((a, b) => {
      if (a.effective !== b.effective) return a.effective ? -1 : 1;
      if (a.batchNo !== b.batchNo) return a.batchNo.localeCompare(b.batchNo);
      return b.eraIndex - a.eraIndex;
    });
  }, [state.batches]);

  const effCount = rows.filter((r) => r.effective).length;
  const invalidCount = rows.length - effCount;

  return (
    <div className="lab-page">
      <section className="panel lab-header">
        <div>
          <h2>Lab 色差对比</h2>
          <p>
            与批次列表同源数据：共 {rows.length} 份判级（生效 {effCount} · 旧克重失效留档{" "}
            {invalidCount}）。刷新页面后状态保持一致。
          </p>
        </div>
        <div className="limit-setting">
          <label>
            <span>判级 ΔE 限值</span>
            <input
              type="number"
              step="0.1"
              min="0"
              value={state.settings.dELimit}
              onChange={(e) => {
                const v = parseNum(e.target.value);
                if (v > 0) dispatch({ type: "updateSettings", settings: { dELimit: v } });
              }}
            />
          </label>
          <small>仅影响此后的新判级；历史结果保留判定时的限值快照。</small>
        </div>
      </section>

      <section className="panel">
        {rows.length === 0 ? (
          <p className="muted-text">尚无任何判级结果。请先在批次判级台完成回潮恒重并判级。</p>
        ) : (
          <div className="table-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>批次</th>
                  <th>面料 / 客户</th>
                  <th>克重周期</th>
                  <th>标样 L*/a*/b*</th>
                  <th>试样 L*/a*/b*</th>
                  <th>ΔL/Δa/Δb</th>
                  <th>ΔE*</th>
                  <th>灰卡</th>
                  <th>判定</th>
                  <th>限值</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = r.era.grading!;
                  const dd = colorDiff(g.std, g.sample);
                  return (
                    <tr key={g.id} className={r.effective ? "" : "row-superseded"}>
                      <td>
                        {r.effective ? (
                          <span className="effective-chip">生效中</span>
                        ) : (
                          <span className="invalid-chip">已失效</span>
                        )}
                      </td>
                      <td>
                        <b>{r.batchNo}</b>
                      </td>
                      <td>
                        {r.fabric}
                        <br />
                        <span className="muted-text">{r.customer}</span>
                      </td>
                      <td>
                        {r.era.gsm} g/m²
                        <br />
                        <span className="muted-text">
                          世代 {r.eraIndex + 1}/{r.eraCount}
                        </span>
                      </td>
                      <td className="num">
                        {g.std.L.toFixed(2)} / {g.std.a.toFixed(2)} / {g.std.b.toFixed(2)}
                      </td>
                      <td className="num">
                        {g.sample.L.toFixed(2)} / {g.sample.a.toFixed(2)} /{" "}
                        {g.sample.b.toFixed(2)}
                      </td>
                      <td className="num">
                        {dd.dL >= 0 ? "+" : ""}
                        {dd.dL.toFixed(2)} / {dd.da >= 0 ? "+" : ""}
                        {dd.da.toFixed(2)} / {dd.db >= 0 ? "+" : ""}
                        {dd.db.toFixed(2)}
                      </td>
                      <td className="num">
                        <b>{g.dE.toFixed(3)}</b>
                      </td>
                      <td>{g.grade}</td>
                      <td>
                        <VerdictTag verdict={g.verdict} />
                      </td>
                      <td className="muted-text">≤ {g.limit}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <LabCalculator limit={state.settings.dELimit} />
    </div>
  );
}

function LabCalculator({ limit }: { limit: number }) {
  const [std, setStd] = useState({ L: "60", a: "2", b: "-15" });
  const [sample, setSample] = useState({ L: "60.8", a: "2.4", b: "-14.2" });

  const result = useMemo(() => {
    const s = { L: parseNum(std.L), a: parseNum(std.a), b: parseNum(std.b) };
    const p = { L: parseNum(sample.L), a: parseNum(sample.a), b: parseNum(sample.b) };
    if (![s.L, s.a, s.b, p.L, p.a, p.b].every(Number.isFinite)) return null;
    const d = colorDiff(s, p);
    return { ...d, grade: greyGrade(d.dE), pass: d.dE <= limit };
  }, [std, sample, limit]);

  return (
    <section className="panel calculator">
      <h3>ΔE 速算器（不落库）</h3>
      <div className="calc-grid">
        <CalcGroup title="标样" value={std} onChange={setStd} />
        <CalcGroup title="试样" value={sample} onChange={setSample} />
        <div className={`calc-result ${result ? (result.pass ? "preview-ok" : "preview-bad") : ""}`}>
          <div>
            <small>ΔE* CIE76</small>
            <strong>{result ? result.dE.toFixed(3) : "—"}</strong>
          </div>
          <div>
            <small>灰卡级数</small>
            <strong>{result ? result.grade : "—"}</strong>
          </div>
          <div>
            <small>判定（限值 ≤ {limit}）</small>
            <strong className={result ? (result.pass ? "ok-text" : "bad-text") : ""}>
              {result ? (result.pass ? "合格" : "不合格") : "—"}
            </strong>
          </div>
        </div>
      </div>
    </section>
  );
}

function CalcGroup({
  title,
  value,
  onChange,
}: {
  title: string;
  value: { L: string; a: string; b: string };
  onChange: (v: { L: string; a: string; b: string }) => void;
}) {
  return (
    <div className="calc-group">
      <span>{title}</span>
      <div className="calc-inputs">
        {(["L", "a", "b"] as const).map((k) => (
          <label key={k}>
            <span>{k}*</span>
            <input
              type="number"
              step="0.01"
              value={value[k]}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
