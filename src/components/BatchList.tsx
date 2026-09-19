import { deriveBatch } from "../logic/rules";
import type { Batch } from "../logic/types";
import { StatusBadge } from "./Badges";

interface Props {
  batches: Batch[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function BatchList({ batches, selectedId, onSelect }: Props) {
  if (batches.length === 0) {
    return (
      <section className="panel list-empty">
        <p>没有符合条件的批次</p>
      </section>
    );
  }

  return (
    <section className="batch-list">
      {batches.map((b) => {
        const d = deriveBatch(b);
        const supersededCount = b.eras.slice(0, -1).filter((e) => e.grading).length;
        return (
          <button
            key={b.id}
            className={`batch-card panel ${selectedId === b.id ? "selected" : ""}`}
            onClick={() => onSelect(b.id)}
          >
            <div className="batch-card-head">
              <strong>{b.batchNo}</strong>
              <StatusBadge status={d.status} />
            </div>
            <p className="batch-meta">
              {b.fabric} · {b.customer} · {b.gsm} g/m²
            </p>
            <div className="batch-card-foot">
              <span>称量 {d.weighingCount} 次</span>
              {d.status === "已判级" && d.grading && (
                <span className={d.grading.verdict === "合格" ? "ok-text" : "bad-text"}>
                  ΔE {d.grading.dE.toFixed(2)} · 灰卡 {d.grading.grade} · {d.grading.verdict}
                </span>
              )}
              {d.status === "待复测" && d.pendingReasons.length > 0 && (
                <span className="warn-text">{d.pendingReasons[0]}</span>
              )}
              {d.status === "可判级" && <span className="ok-text">恒重已达成，可判色差</span>}
              {supersededCount > 0 && (
                <span className="muted-text">含 {supersededCount} 份旧判级（已失效，可查）</span>
              )}
            </div>
          </button>
        );
      })}
    </section>
  );
}
