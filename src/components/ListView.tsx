import { useState } from "react";
import type { BatchView } from "../domain/engine";
import { HUM_MAX, HUM_MIN, TEMP_MAX, TEMP_MIN } from "../domain/engine";
import { store } from "../state/store";
import { createBatch } from "../domain/engine";
import { fmtTime } from "./format";
import { Pill, StatusBadge } from "./StatusBadge";

export function ListView({
  views,
  selectedId,
  onSelect,
}: {
  views: BatchView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [no, setNo] = useState("");
  const [fabric, setFabric] = useState("");
  const [gsm, setGsm] = useState("");
  const [err, setErr] = useState("");

  const submit = () => {
    try {
      const ev = createBatch(store.getEvents(), {
        no,
        fabric,
        gsm: Number(gsm),
      });
      store.append(ev);
      setNo("");
      setFabric("");
      setGsm("");
      setErr("");
      onSelect(ev.batchId);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>新建批次</p>
            <h2>批次必须先回潮，合格后方可判色差</h2>
          </div>
        </div>
        <div className="form-row">
          <label>
            <span>批次号</span>
            <input value={no} placeholder="如 TS-2408" onChange={(e) => setNo(e.target.value)} />
          </label>
          <label>
            <span>面料描述</span>
            <input
              value={fabric}
              placeholder="如 全棉斜纹"
              onChange={(e) => setFabric(e.target.value)}
            />
          </label>
          <label>
            <span>克重 g/m²</span>
            <input
              value={gsm}
              type="number"
              min="1"
              placeholder="如 150"
              onChange={(e) => setGsm(e.target.value)}
            />
          </label>
          <div className="form-action">
            <button className="primary" onClick={submit}>
              登记批次
            </button>
          </div>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>回潮判级台账 · 列表</p>
            <h2>小样批次（{views.length}）</h2>
          </div>
          <Pill tone="warn">
            门控：{TEMP_MIN}~{TEMP_MAX}℃ / {HUM_MIN}~{HUM_MAX}%RH · 相邻称量差 ≤0.5%
          </Pill>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>批次号</th>
                <th>面料</th>
                <th>当前克重</th>
                <th>状态</th>
                <th>称量次数</th>
                <th>首个合格</th>
                <th>当前判级</th>
                <th>登记时间</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {views.map((v) => (
                <tr
                  key={v.batch.id}
                  className={v.batch.id === selectedId ? "selected" : ""}
                  onClick={() => onSelect(v.batch.id)}
                >
                  <td className="mono strong">{v.batch.no}</td>
                  <td>{v.batch.fabric}</td>
                  <td>{v.gen.gsm} g/m²</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>{v.gen.weighings.length}</td>
                  <td>
                    {v.gate.anchored ? (
                      <Pill tone="ok">已生效</Pill>
                    ) : (
                      <Pill>未达成</Pill>
                    )}
                  </td>
                  <td>
                    {v.activeGrade ? (
                      <Pill tone={v.activeGrade.pass ? "ok" : "bad"}>
                        ΔE {v.activeGrade.de.toFixed(2)} · {v.activeGrade.level}级 ·{" "}
                        {v.activeGrade.pass ? "合格" : "超限"}
                      </Pill>
                    ) : v.superseded.length > 0 ? (
                      <Pill tone="warn">旧判级已作废 ×{v.superseded.length}</Pill>
                    ) : (
                      <Pill>未判级</Pill>
                    )}
                  </td>
                  <td className="muted">{fmtTime(v.batch.createdAt)}</td>
                  <td>
                    <button
                      className="link"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(v.batch.id);
                      }}
                    >
                      详情 →
                    </button>
                  </td>
                </tr>
              ))}
              {views.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted center">
                    暂无批次，请先登记
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
