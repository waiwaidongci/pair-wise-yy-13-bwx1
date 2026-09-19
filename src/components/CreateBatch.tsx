import { useState } from "react";
import { newId, useStore } from "../logic/store";
import { parseNum } from "../utils/format";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export function CreateBatch({ onClose, onCreated }: Props) {
  const { state, dispatch } = useStore();
  const [batchNo, setBatchNo] = useState("");
  const [fabric, setFabric] = useState("");
  const [customer, setCustomer] = useState("");
  const [gsm, setGsm] = useState("");
  const [error, setError] = useState("");

  function submit() {
    const g = parseNum(gsm);
    if (!batchNo.trim()) return setError("请填写批次号");
    if (!fabric.trim()) return setError("请填写面料成分/名称");
    if (!(g > 0)) return setError("克重需为大于 0 的数字");
    if (state.batches.some((b) => b.batchNo === batchNo.trim()))
      return setError("该批次号已存在");

    const id = newId("batch");
    dispatch({
      type: "addBatch",
      id,
      eraId: newId("era"),
      batchNo,
      fabric,
      customer,
      gsm: g,
    });
    onCreated(id);
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>新建小样批次</h2>
        <p className="modal-hint">新批次从「待复测」开始，必须先完成回潮恒重才能判色差。</p>
        <label>
          <span>批次号 *</span>
          <input
            autoFocus
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            placeholder="如 LAB-2606"
          />
        </label>
        <label>
          <span>面料成分/名称 *</span>
          <input value={fabric} onChange={(e) => setFabric(e.target.value)} placeholder="如 棉府绸" />
        </label>
        <label>
          <span>客户订单</span>
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="如 华贸纺织" />
        </label>
        <label>
          <span>克重 g/m² *</span>
          <input type="number" value={gsm} onChange={(e) => setGsm(e.target.value)} placeholder="如 180" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
