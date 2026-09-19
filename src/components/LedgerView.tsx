import { useMemo } from "react";
import type { DomainEvent } from "../domain/types";
import { fold } from "../domain/engine";
import { fmt, fmtTime } from "./format";
import { Pill } from "./StatusBadge";

const TYPE_LABEL: Record<DomainEvent["type"], string> = {
  BATCH_CREATED: "登记批次",
  GSM_CHANGED: "修改克重（旧判级作废）",
  WEIGHING_APPENDED: "追加回潮称量",
  GRADE_RECORDED: "判级",
};

export function LedgerView({
  events,
  onSelect,
}: {
  events: DomainEvent[];
  onSelect: (id: string) => void;
}) {
  const batches = useMemo(() => fold(events), [events]);
  const noOf = new Map(batches.map((b) => [b.id, b.no]));

  const grades = events
    .filter((e): e is Extract<DomainEvent, { type: "GRADE_RECORDED" }> => e.type === "GRADE_RECORDED")
    .map((e) => {
      const b = batches.find((x) => x.id === e.batchId);
      const currentGen = b ? b.generations[b.generations.length - 1].gen : -1;
      const active = currentGen === e.gen;
      return { e, no: noOf.get(e.batchId) ?? "?", active };
    })
    .sort((x, y) => y.e.at - x.e.at);

  return (
    <div className="stack">
      <section className="panel">
        <div className="heading">
          <div>
            <p>判级台账</p>
            <h2>所有判级结果（含已作废，仅追加不删除）</h2>
          </div>
          <Pill tone="warn">规则：仅首个合格回潮结果可判级；改克重后旧判级作废但可查</Pill>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>时间</th>
                <th>批次</th>
                <th>轮次</th>
                <th>克重</th>
                <th>ΔE00</th>
                <th>灰卡</th>
                <th>结论</th>
                <th>效力</th>
              </tr>
            </thead>
            <tbody>
              {grades.map(({ e, no, active }) => (
                <tr
                  key={e.id}
                  className={active ? "" : "dead-row"}
                  onClick={() => onSelect(e.batchId)}
                >
                  <td className="muted">{fmtTime(e.at)}</td>
                  <td className="mono strong">{no}</td>
                  <td>第 {e.gen + 1} 轮</td>
                  <td>{e.grade.gsm} g/m²</td>
                  <td className="strong">{fmt(e.grade.de, 3)}</td>
                  <td>{e.grade.level} 级</td>
                  <td>
                    <Pill tone={e.grade.pass ? "ok" : "bad"}>
                      {e.grade.pass ? `合格 ≤ ${e.grade.limit}` : `超限 > ${e.grade.limit}`}
                    </Pill>
                  </td>
                  <td>
                    {active ? <Pill tone="ok">生效中</Pill> : <Pill tone="bad">已作废（改克重）</Pill>}
                  </td>
                </tr>
              ))}
              {grades.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted center">
                    暂无判级记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>审计流水</p>
            <h2>事件日志（append-only，刷新/多标签页一致）</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>时间</th>
                <th>批次</th>
                <th>操作</th>
                <th>轮次</th>
                <th>明细</th>
              </tr>
            </thead>
            <tbody>
              {[...events]
                .sort((a, b) => b.at - a.at)
                .map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{fmtTime(e.at)}</td>
                    <td className="mono">{noOf.get(e.batchId) ?? "—"}</td>
                    <td>{TYPE_LABEL[e.type]}</td>
                    <td>{e.type === "BATCH_CREATED" ? "—" : `第 ${e.gen + 1} 轮`}</td>
                    <td className="muted small">{describe(e)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function describe(e: DomainEvent): string {
  switch (e.type) {
    case "BATCH_CREATED":
      return `${e.fabric} · 初始克重 ${e.gsm} g/m²`;
    case "GSM_CHANGED":
      return `${e.from} → ${e.to} g/m²，开新轮回潮，旧判级立即作废`;
    case "WEIGHING_APPENDED":
      return `${e.weighing.temp}℃ / ${e.weighing.humidity}%RH · ${e.weighing.grams} g`;
    case "GRADE_RECORDED":
      return `ΔE00 ${e.grade.de.toFixed(3)} · ${e.grade.level}级 · ${e.grade.pass ? "合格" : "超限"}`;
  }
}
