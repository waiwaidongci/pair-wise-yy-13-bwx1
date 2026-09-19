import { useMemo, useState } from "react";
import { useStore } from "../logic/store";
import { colorDiff, greyGrade } from "../logic/rules";
import { parseNum } from "../utils/format";

interface Props {
  batchId: string;
  limit: number;
}

function LabInputs({
  title,
  values,
  onChange,
}: {
  title: string;
  values: { L: string; a: string; b: string };
  onChange: (v: { L: string; a: string; b: string }) => void;
}) {
  return (
    <div className="lab-inputs">
      <span>{title}</span>
      <div>
        {(["L", "a", "b"] as const).map((k) => (
          <label key={k}>
            <span>{k}*</span>
            <input
              type="number"
              step="0.01"
              value={values[k]}
              onChange={(e) => onChange({ ...values, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export function GradingForm({ batchId, limit }: Props) {
  const { dispatch } = useStore();
  const [std, setStd] = useState({ L: "", a: "", b: "" });
  const [sample, setSample] = useState({ L: "", a: "", b: "" });
  const [error, setError] = useState("");

  // 实时预览，提交判级前即可在详情侧看到 ΔE
  const preview = useMemo(() => {
    const s = { L: parseNum(std.L), a: parseNum(std.a), b: parseNum(std.b) };
    const p = { L: parseNum(sample.L), a: parseNum(sample.a), b: parseNum(sample.b) };
    if (![s.L, s.a, s.b, p.L, p.a, p.b].every(Number.isFinite)) return null;
    const d = colorDiff(s, p);
    return { ...d, grade: greyGrade(d.dE), pass: d.dE <= limit };
  }, [std, sample, limit]);

  function submit() {
    const s = { L: parseNum(std.L), a: parseNum(std.a), b: parseNum(std.b) };
    const p = { L: parseNum(sample.L), a: parseNum(sample.a), b: parseNum(sample.b) };
    if (![s.L, s.a, s.b, p.L, p.a, p.b].every(Number.isFinite))
      return setError("请完整填写标样与试样的 L*/a*/b*");
    setError("");
    dispatch({ type: "addGrading", batchId, std: s, sample: p });
  }

  return (
    <div className="grade-form">
      <LabInputs title="标样 Lab" values={std} onChange={setStd} />
      <LabInputs title="试样 Lab" values={sample} onChange={setSample} />

      {preview && (
        <div className={`preview ${preview.pass ? "preview-ok" : "preview-bad"}`}>
          <div>
            <small>ΔE* 预览</small>
            <strong>{preview.dE.toFixed(3)}</strong>
          </div>
          <div>
            <small>灰卡</small>
            <strong>{preview.grade} 级</strong>
          </div>
          <div>
            <small>对照限值 ΔE ≤ {limit}</small>
            <strong className={preview.pass ? "ok-text" : "bad-text"}>
              {preview.pass ? "合格" : "不合格"}
            </strong>
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      <button className="primary" onClick={submit}>
        提交判级（锁定首个结果）
      </button>
      <p className="muted-text hint">提交后该克重周期判级即锁定，无法改判；请核对后提交。</p>
    </div>
  );
}
