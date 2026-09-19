import { useState } from "react";
import type { BatchView } from "../domain/engine";
import { appendWeighing, changeGsm, evaluate, recordGrade, type WeighingPair } from "../domain/engine";
import type { Batch, Generation } from "../domain/types";
import { store, useSettings } from "../state/store";
import { deltaE2000 } from "../domain/color";
import { fmt, fmtTime } from "./format";
import { Pill, StatusBadge } from "./StatusBadge";

export function DetailPanel({ view, onClose }: { view: BatchView | null; onClose: () => void }) {
  if (!view) {
    return (
      <aside className="panel detail empty-detail">
        <h2>批次详情</h2>
        <p className="muted">在左侧列表选择一个批次，查看回潮记录、补测与判级。</p>
      </aside>
    );
  }
  return <DetailBody key={view.batch.id} view={view} onClose={onClose} />;
}

function DetailBody({ view, onClose }: { view: BatchView; onClose: () => void }) {
  const { batch } = view;
  return (
    <aside className="panel detail">
      <div className="detail-head">
        <div>
          <p className="kicker">批次详情</p>
          <h2 className="mono">{batch.no}</h2>
          <p className="muted">{batch.fabric}</p>
        </div>
        <button className="link" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="detail-status">
        <StatusBadge status={view.status} />
        <span className="muted">第 {view.gen.gen + 1} 轮回潮 · 当前克重 {view.gen.gsm} g/m²</span>
      </div>

      {view.status !== "GRADED" && (
        <div className={`callout ${view.canGrade ? "ok" : "warn"}`}>
          {view.canGrade ? (
            <>
              <strong>回潮门控已通过：</strong>
              首个合格的相邻称量结果已生效，可以判色差；继续补测不会推翻该结果。
            </>
          ) : (
            <>
              <strong>只能待复测，不能判色差：</strong>
              <ul>
                {view.gate.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <GsmChange key={`gsm-${batch.id}`} view={view} />
      <WeighingForm key={`w-${batch.id}-${view.gen.gen}`} view={view} />
      <GradeForm key={`g-${batch.id}-${view.gen.gen}`} view={view} />

      <Generations batch={batch} currentGen={view.gen.gen} />
    </aside>
  );
}

function GsmChange({ view }: { view: BatchView }) {
  const [gsm, setGsm] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    try {
      const ev = changeGsm(store.getEvents(), view.batch.id, Number(gsm));
      store.append(ev);
      setGsm("");
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="block">
      <h3>修改克重</h3>
      <p className="hint">
        {view.activeGrade
          ? "当前已有生效判级：保存后旧判级立即作废，批次回到待复测，历史结果仍可在下方与判级台账查询。"
          : "保存后开新轮回潮，需重新完成称量门控后才能判色差。"}
      </p>
      <div className="inline-form">
        <input
          type="number"
          min="1"
          placeholder={`新克重（当前 ${view.gen.gsm}）`}
          value={gsm}
          onChange={(e) => setGsm(e.target.value)}
        />
        <button onClick={submit}>改克重并开新轮</button>
      </div>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function WeighingForm({ view }: { view: BatchView }) {
  const [temp, setTemp] = useState("20");
  const [hum, setHum] = useState("65");
  const [grams, setGrams] = useState("");
  const [err, setErr] = useState("");
  const disabled = !view.canAppend;

  const submit = () => {
    try {
      const ev = appendWeighing(store.getEvents(), view.batch.id, {
        temp: Number(temp),
        humidity: Number(hum),
        grams: Number(grams),
      });
      store.append(ev);
      setGrams("");
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section className="block">
      <h3>
        回潮称量（补测只追加）
        {view.gate.anchored && <Pill tone="ok">首个合格已生效</Pill>}
      </h3>
      <div className="inline-form three">
        <label>
          <span>温度 ℃</span>
          <input type="number" value={temp} disabled={disabled} onChange={(e) => setTemp(e.target.value)} />
        </label>
        <label>
          <span>湿度 %RH</span>
          <input type="number" value={hum} disabled={disabled} onChange={(e) => setHum(e.target.value)} />
        </label>
        <label>
          <span>称量 g</span>
          <input type="number" step="0.001" value={grams} disabled={disabled} placeholder="如 10.000" onChange={(e) => setGrams(e.target.value)} />
        </label>
      </div>
      <button className="primary" disabled={disabled} onClick={submit}>
        追加称量记录
      </button>
      {disabled && <p className="hint">本轮已判级，称量记录锁定；如需重测请修改克重开新轮。</p>}
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function GradeForm({ view }: { view: BatchView }) {
  const settings = useSettings();
  const [l1, setL1] = useState("50");
  const [a1, setA1] = useState("0");
  const [b1, setB1] = useState("0");
  const [l2, setL2] = useState("");
  const [a2, setA2] = useState("");
  const [b2, setB2] = useState("");
  const [err, setErr] = useState("");

  const std = { l: Number(l1), a: Number(a1), b: Number(b1) };
  const smp = { l: Number(l2), a: Number(a2), b: Number(b2) };
  const preview = [l2, a2, b2].every((x) => x !== "" && Number.isFinite(Number(x)))
    ? deltaE2000(std, smp)
    : null;

  const submit = () => {
    try {
      const ev = recordGrade(store.getEvents(), view.batch.id, { std, smp, limit: settings.limit });
      store.append(ev);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section className="block">
      <h3>
        Lab 判色差
        <Pill>合格上限 ΔE00 ≤ {settings.limit}</Pill>
      </h3>
      {!view.canGrade && (
        <p className="hint">回潮门控未通过 / 本轮已判级，判级按钮锁定。</p>
      )}
      <div className="lab-grid">
        <div>
          <span className="col-head">标样</span>
          <div className="inline-form three">
            <input type="number" value={l1} onChange={(e) => setL1(e.target.value)} aria-label="标样 L" />
            <input type="number" value={a1} onChange={(e) => setA1(e.target.value)} aria-label="标样 a" />
            <input type="number" value={b1} onChange={(e) => setB1(e.target.value)} aria-label="标样 b" />
          </div>
        </div>
        <div>
          <span className="col-head">试样</span>
          <div className="inline-form three">
            <input type="number" value={l2} placeholder="L" onChange={(e) => setL2(e.target.value)} aria-label="试样 L" />
            <input type="number" value={a2} placeholder="a" onChange={(e) => setA2(e.target.value)} aria-label="试样 a" />
            <input type="number" value={b2} placeholder="b" onChange={(e) => setB2(e.target.value)} aria-label="试样 b" />
          </div>
        </div>
      </div>
      {preview !== null && (
        <p className="preview">
          预览 ΔE00 = <b>{fmt(preview, 3)}</b> · 预计{preview <= settings.limit ? "合格" : "超限"}
        </p>
      )}
      <button className="primary" disabled={!view.canGrade} onClick={submit}>
        记录判级（首个结果生效，不可更改）
      </button>
      {err && <p className="error">{err}</p>}
    </section>
  );
}

function Generations({ batch, currentGen }: { batch: Batch; currentGen: number }) {
  return (
    <section className="block">
      <h3>回潮/判级履历（不可变）</h3>
      <div className="gens">
        {[...batch.generations].reverse().map((g) => (
          <GenCard key={g.gen} gen={g} batchNo={batch.no} current={g.gen === currentGen} />
        ))}
      </div>
    </section>
  );
}

function GenCard({ gen, batchNo, current }: { gen: Generation; batchNo: string; current: boolean }) {
  const gate = evaluate(gen.weighings);
  return (
    <div className={`gen-card ${current ? "" : "superseded-gen"}`}>
      <div className="gen-head">
        <b>
          第 {gen.gen + 1} 轮 · {gen.gsm} g/m²
        </b>
        {gen.reason === "create" ? (
          <Pill>批次创建</Pill>
        ) : (
          <Pill tone="warn">克重 {gen.gsmFrom} → {gen.gsm} 改克重重测</Pill>
        )}
        {current ? <Pill tone="ok">当前轮</Pill> : <Pill tone="bad">已作废轮次</Pill>}
      </div>

      <ul className="weigh-list">
        {gen.weighings.map((w, i) => {
          const pair = gate.pairs.find((p) => p.curr.id === w.id);
          return (
            <li key={w.id}>
              <span className="mono">#{i + 1}</span>
              <span>{fmtTime(w.at)}</span>
              <span>
                {w.temp}℃ / {w.humidity}%
              </span>
              <span>{fmt(w.grams, 3)} g</span>
              {pair ? <PairTag pair={pair} /> : <Pill>首次称量</Pill>}
            </li>
          );
        })}
        {gen.weighings.length === 0 && <li className="muted">本轮尚无称量记录</li>}
      </ul>

      {gen.grade && (
        <div className={`grade-card ${gen.grade.pass ? "pass" : "fail"} ${current ? "" : "dead"}`}>
          <div>
            <b>
              ΔE00 {fmt(gen.grade.de, 3)} · 灰卡 {gen.grade.level} 级
            </b>
            <Pill tone={gen.grade.pass ? "ok" : "bad"}>
              {gen.grade.pass ? `合格（≤ ${gen.grade.limit}）` : `超限（> ${gen.grade.limit}）`}
            </Pill>
            {!current && <Pill tone="bad">已作废（{batchNo} 改克重）</Pill>}
          </div>
          <p className="muted small">
            标样 L{fmt(gen.grade.std.l, 2)} a{fmt(gen.grade.std.a, 2)} b{fmt(gen.grade.std.b, 2)} ·
            试样 L{fmt(gen.grade.smp.l, 2)} a{fmt(gen.grade.smp.a, 2)} b{fmt(gen.grade.smp.b, 2)} ·{" "}
            {fmtTime(gen.grade.at)}
          </p>
        </div>
      )}
    </div>
  );
}

function PairTag({ pair }: { pair: WeighingPair }) {
  if (pair.ok) {
    return (
      <Pill tone="ok">
        {pair.relPct.toFixed(2)}% 合格{pair.firstQualified ? " · 首个生效" : ""}
      </Pill>
    );
  }
  if (!pair.envOk) return <Pill tone="bad">{pair.relPct.toFixed(2)}% · 环境超限</Pill>;
  return <Pill tone="bad">{pair.relPct.toFixed(2)}% &gt; 0.5%</Pill>;
}
