import { useState } from "react";
import { useStore } from "../logic/store";
import {
  DIFF_PCT_MAX,
  HUM_MAX,
  HUM_MIN,
  TEMP_MAX,
  TEMP_MIN,
  canGrade,
  checkEnv,
  colorDiff,
  deriveBatch,
} from "../logic/rules";
import type { Batch, Era, Lab } from "../logic/types";
import { fmtNum, fmtTime, parseNum } from "../utils/format";
import { StatusBadge, VerdictTag } from "./Badges";
import { GradingForm } from "./GradingForm";

interface Props {
  batch: Batch;
  onClose: () => void;
}

export function BatchDetail({ batch, onClose }: Props) {
  const { state, dispatch } = useStore();
  const d = deriveBatch(batch);
  const era = d.currentEra;
  const dELimit = state.settings.dELimit;

  // 回潮称量录入
  const [temp, setTemp] = useState("20.0");
  const [humidity, setHumidity] = useState("65");
  const [weight, setWeight] = useState("");
  const [wError, setWError] = useState("");

  // 改克重
  const [gsmInput, setGsmInput] = useState("");
  const [gsmNote, setGsmNote] = useState("");
  const [confirmGsm, setConfirmGsm] = useState(false);

  function submitWeighing() {
    const t = parseNum(temp);
    const h = parseNum(humidity);
    const w = parseNum(weight);
    if (!(t >= -50 && t <= 100)) return setWError("温度数值不合理");
    if (!(h >= 0 && h <= 100)) return setWError("湿度需在 0~100 之间");
    if (!(w > 0)) return setWError("称量值需为大于 0 的数字（g）");
    setWError("");
    dispatch({ type: "addWeighing", batchId: batch.id, temp: t, humidity: h, weight: w });
    setWeight("");
  }

  function doChangeGsm() {
    const g = parseNum(gsmInput);
    if (!(g > 0)) return;
    if (g === batch.gsm) {
      setConfirmGsm(false);
      return;
    }
    dispatch({ type: "changeGsm", batchId: batch.id, gsm: g, note: gsmNote });
    setGsmInput("");
    setGsmNote("");
    setConfirmGsm(false);
  }

  const oldEras = batch.eras.slice(0, -1).reverse();

  return (
    <section className="panel detail">
      <div className="detail-head">
        <div>
          <div className="detail-title-row">
            <h2>{batch.batchNo}</h2>
            <StatusBadge status={d.status} />
          </div>
          <p className="detail-meta">
            {batch.fabric} · {batch.customer} · 当前克重 <b>{batch.gsm} g/m²</b> · 建档{" "}
            {fmtTime(batch.createdAt)}
          </p>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      {/* 状态提示条 */}
      {d.status === "待复测" && (
        <div className="notice notice-warn">
          <b>待复测 —— 暂不能判色差。</b>
          <ul>
            {d.pendingReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <span className="notice-rule">
            门控：温度 {TEMP_MIN}~{TEMP_MAX}℃、湿度 {HUM_MIN}~{HUM_MAX}%、相邻称量差 ≤ {DIFF_PCT_MAX}%。
            补测只追加记录，不覆盖任何历史数据。
          </span>
        </div>
      )}
      {d.status === "可判级" && (
        <div className="notice notice-ok">
          <b>恒重已达成（末次称量环境合格且相邻差 ≤ {DIFF_PCT_MAX}%），可判色差。</b>
          <span>判级结果为本克重周期首个（唯一）有效结果，提交后锁定；此后补测只追加、不改变判级。</span>
        </div>
      )}
      {d.status === "已判级" && (
        <div className="notice notice-locked">
          <b>首个合格结果已生效并锁定。</b>
          <span>可继续追加称量留痕，但不会改变当前判级；修改克重将使该结果立即失效并回到待复测。</span>
        </div>
      )}

      {/* 当前克重周期 */}
      <div className="era-current">
        <div className="subhead">
          <h3>当前克重周期：{era.gsm} g/m²</h3>
          <span className="muted-text">
            {era.note} · 始于 {fmtTime(era.createdAt)}
          </span>
        </div>

        <div className="detail-grid">
          {/* 左：称量 */}
          <div className="card-block">
            <h4>回潮称量（追加记录）</h4>
            <div className="weigh-form">
              <label>
                <span>温度 ℃</span>
                <input
                  type="number"
                  step="0.1"
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                />
              </label>
              <label>
                <span>湿度 %RH</span>
                <input
                  type="number"
                  step="1"
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                />
              </label>
              <label>
                <span>称量 g</span>
                <input
                  type="number"
                  step="0.001"
                  placeholder="如 10.000"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </label>
              <button className="primary" onClick={submitWeighing}>
                追加称量
              </button>
            </div>
            {wError && <p className="form-error">{wError}</p>}
            <WeighingTable era={era} />
          </div>

          {/* 右：判级 */}
          <div className="card-block">
            <h4>色差判级（Lab）</h4>
            {era.grading ? (
              <GradingLocked era={era} />
            ) : canGrade(era) ? (
              <GradingForm batchId={batch.id} limit={dELimit} />
            ) : (
              <div className="grade-blocked">
                <p>回潮恒重未达成，色差判级入口关闭。</p>
                <span>完成合格的末次称量后自动解锁。</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 改克重 */}
      <div className="gsm-block">
        <h4>修改克重</h4>
        {!confirmGsm ? (
          <div className="gsm-inline">
            <input
              type="number"
              placeholder={`新克重，当前 ${batch.gsm}`}
              value={gsmInput}
              onChange={(e) => setGsmInput(e.target.value)}
            />
            <input
              placeholder="变更原因（可选）"
              value={gsmNote}
              onChange={(e) => setGsmNote(e.target.value)}
            />
            <button
              onClick={() => {
                const g = parseNum(gsmInput);
                if (g > 0 && g !== batch.gsm) setConfirmGsm(true);
              }}
            >
              应用新克重
            </button>
          </div>
        ) : (
          <div className="notice notice-warn">
            <b>
              确认将克重 {batch.gsm} → {parseNum(gsmInput)} g/m²？
            </b>
            <span>
              当前判级{era.grading ? `（ΔE ${era.grading.dE.toFixed(2)} / ${era.grading.verdict}）` : ""}
              将立即失效，批次回到「待复测」；全部旧称量与旧判级仍保留在下方历史中可查。
            </span>
            <div className="confirm-row">
              <button onClick={() => setConfirmGsm(false)}>取消</button>
              <button className="danger" onClick={doChangeGsm}>
                确认修改
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 历史克重周期（旧结果可查） */}
      {oldEras.length > 0 && (
        <div className="history-block">
          <h4>历史克重周期（{oldEras.length}）—— 旧结果已失效，仅留档查询</h4>
          <div className="era-history">
            {oldEras.map((e) => (
              <EraHistory key={e.id} era={e} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WeighingTable({ era }: { era: Era }) {
  if (era.weighings.length === 0) {
    return <p className="muted-text empty-hint">本周期尚无称量记录。</p>;
  }
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>时间</th>
          <th>温度℃</th>
          <th>湿度%</th>
          <th>称量g</th>
          <th>相邻差%</th>
          <th>判定</th>
        </tr>
      </thead>
      <tbody>
        {[...era.weighings].reverse().map((w) => {
          const env = checkEnv(w.temp, w.humidity);
          return (
            <tr key={w.id} className={w.valid ? "" : "row-invalid"}>
              <td>{w.seq}</td>
              <td>{fmtTime(w.time)}</td>
              <td className={env.tempOk ? "" : "cell-bad"}>{w.temp}</td>
              <td className={env.humOk ? "" : "cell-bad"}>{w.humidity}</td>
              <td>{fmtNum(w.weight, 3)}</td>
              <td
                className={
                  w.diffPct === null || w.diffPct <= DIFF_PCT_MAX ? "" : "cell-bad"
                }
              >
                {fmtNum(w.diffPct, 3)}
              </td>
              <td>
                {w.valid ? (
                  <span className="ok-text">合格</span>
                ) : (
                  <span className="bad-text" title={w.reasons.join("；")}>
                    不合格 ✕
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GradingLocked({ era }: { era: Era }) {
  const g = era.grading!;
  const preview = colorDiff(g.std, g.sample);
  return (
    <div className="grade-locked">
      <div className="grade-result">
        <div className="grade-big">
          <span className={`grade-verdict ${g.verdict === "合格" ? "ok-text" : "bad-text"}`}>
            {g.verdict}
          </span>
          <span className="grade-grade">灰卡 {g.grade} 级</span>
        </div>
        <div className="lab-readout">
          <div>
            <small>ΔE* (CIE76)</small>
            <strong>{g.dE.toFixed(3)}</strong>
          </div>
          <div>
            <small>ΔL / Δa / Δb</small>
            <strong>
              {preview.dL >= 0 ? "+" : ""}
              {preview.dL.toFixed(2)} / {preview.da >= 0 ? "+" : ""}
              {preview.da.toFixed(2)} / {preview.db >= 0 ? "+" : ""}
              {preview.db.toFixed(2)}
            </strong>
          </div>
          <div>
            <small>限值（判定时快照）</small>
            <strong>ΔE ≤ {g.limit}</strong>
          </div>
        </div>
      </div>
      <LabTable std={g.std} sample={g.sample} />
      <p className="muted-text">判级时间 {fmtTime(g.time)} · 已锁定，补测不可更改。</p>
    </div>
  );
}

function LabTable({ std, sample }: { std: Lab; sample: Lab }) {
  return (
    <table className="lab-table">
      <thead>
        <tr>
          <th></th>
          <th>L*</th>
          <th>a*</th>
          <th>b*</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>标样</td>
          <td>{std.L.toFixed(2)}</td>
          <td>{std.a.toFixed(2)}</td>
          <td>{std.b.toFixed(2)}</td>
        </tr>
        <tr>
          <td>试样</td>
          <td>{sample.L.toFixed(2)}</td>
          <td>{sample.a.toFixed(2)}</td>
          <td>{sample.b.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function EraHistory({ era }: { era: Era }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="era-old">
      <button className="era-old-head" onClick={() => setOpen((v) => !v)}>
        <span>
          <b>{era.gsm} g/m²</b> · {fmtTime(era.createdAt)} · {era.note}
        </span>
        <span className="era-old-right">
          {era.grading ? (
            <>
              <VerdictTag verdict={era.grading.verdict} />
              <span className="muted-text">
                ΔE {era.grading.dE.toFixed(2)} / 灰卡 {era.grading.grade}
              </span>
            </>
          ) : (
            <span className="muted-text">未判级（称量 {era.weighings.length} 次）</span>
          )}
          <span className="invalid-chip">已失效</span>
          <span className="caret">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="era-old-body">
          <WeighingTable era={era} />
          {era.grading ? (
            <GradingLocked era={era} />
          ) : (
            <p className="muted-text">该周期未形成判级结果。</p>
          )}
        </div>
      )}
    </div>
  );
}
