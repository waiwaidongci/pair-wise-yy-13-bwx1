import type { BatchStatus } from "../logic/rules";

const STATUS_LABEL: Record<BatchStatus, string> = {
  待复测: "待复测",
  可判级: "可判级",
  已判级: "已判级",
};

export function StatusBadge({ status }: { status: BatchStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function VerdictTag({ verdict }: { verdict: "合格" | "不合格" }) {
  return <span className={`tag tag-${verdict}`}>{verdict}</span>;
}
