import { useMemo, useState } from "react";
import type { BatchView } from "../domain/engine";
import { viewsOf } from "../domain/engine";
import type { DomainEvent, GradeRecord } from "../domain/types";
import { useSettings } from "../state/store";
import { fmt, fmtTime } from "./format";
import { Pill, StatusBadge } from "./StatusBadge";

interface Row {
  batchId: string;
  no: string;
  fabric: string;
  gen: number;
  grade: GradeRecord;
  active: boolean;
  status: string;
}

export function LabCompare({
  events,
  onSelect,
}: {
  events: DomainEvent[];
  onSelect: (id: string) => void;
}) {
  const settings = useSettings();
  const [showDead, setShowDead] = useState(false);

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const v of viewsOf(events)) {
      for (const g of v.batch.generations) {
        if (!g.grade) continue;
        const active = g.gen === v.gen.gen && v.status === "GRADED";
        if (!active && !showDead) continue;
        out.push({
          batchId: v.batch.id,
          no: v.batch.no,
          fabric: v.batch.fabric,
          gen: g.gen,
          grade: g.grade,
          active,
          status: active ? "生效中" : "已作废（改克重）",
        });
      }
      // 未判级批次也要出现在对比视图中（与列表状态一致）
    }
    out.sort((a, b) => b.grade.at - a.grade.at);
    return out;
  }, [events, showDead]);

  const pending = useMemo(
    () => viewsOf(events).filter((v) => !v.activeGrade),
    [events],
  );

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>Lab 对比</p>
            <h2>色差分色（CIEDE2000 · ISO 105-A02 灰卡）</h2>
          </div>
          <label className="switch">
            <input type="checkbox" checked={showDead} onChange={(e) => setShowDead(e.target.checked)} />
            显示已作废历史判级
          </label>
        </div>

        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>批次</th>
                <th>克重(判级时)</th>
                <th>标样 L/a/b</th>
                <th>试样 L/a/b</th>
                <th>ΔE00</th>
                <th>灰卡</th>
                <th>判定（上限 {settings.limit}）</th>
                <th>判级时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.batchId}-${r.gen}`}
                  className={r.active ? "" : "dead-row"}
                  onClick={() => onSelect(r.batchId)}
                >
                  <td className="mono strong">{r.no}</td>
                  <td>{r.grade.gsm}</td>
                  <td className="mono muted">
                    {fmt(r.grade.std.l)} / {fmt(r.grade.std.a)} / {fmt(r.grade.std.b)}
                  </td>
                  <td className="mono">
                    {fmt(r.grade.smp.l)} / {fmt(r.grade.smp.a)} / {fmt(r.grade.smp.b)}
                  </td>
                  <td className="strong">{fmt(r.grade.de, 3)}</td>
                  <td>{r.grade.level} 级</td>
                  <td>
                    <Pill tone={r.grade.pass ? "ok" : "bad"}>
                      {r.grade.pass ? "合格" : "超限"}
                    </Pill>
                  </td>
                  <td className="muted">{fmtTime(r.grade.at)}</td>
                  <td>
                    {r.active ? <Pill tone="ok">生效中</Pill> : <Pill tone="bad">{r.status}</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>未判级批次（与列表同一数据源）</p>
            <h2>门控未通过或尚未判色差（{pending.length}）</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>批次</th>
                <th>面料</th>
                <th>当前状态</th>
                <th>称量</th>
                <th>门控</th>
                <th>不可判级原因</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((v) => (
                <tr key={v.batch.id} onClick={() => onSelect(v.batch.id)}>
                  <td className="mono strong">{v.batch.no}</td>
                  <td>{v.batch.fabric}</td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>{v.gen.weighings.length} 次</td>
                  <td>
                    {v.gate.anchored ? <Pill tone="ok">已通过（首个合格生效）</Pill> : <Pill tone="bad">未通过</Pill>}
                  </td>
                  <td className="muted small">
                    {v.status === "READY"
                      ? "门控已通过，等待录入 Lab 判级"
                      : v.gate.reasons.join("；")}
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted center">
                    全部批次均已判级
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
