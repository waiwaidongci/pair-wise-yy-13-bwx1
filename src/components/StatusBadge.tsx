import type { ReactNode } from "react";
import { STATUS_LABEL, type BatchStatus } from "../domain/types";

const STATUS_CLASS: Record<BatchStatus, string> = {
  CONDITIONING: "badge conditioning",
  RETEST: "badge retest",
  READY: "badge ready",
  GRADED: "badge graded",
};

export function StatusBadge({ status }: { status: BatchStatus }) {
  return <span className={STATUS_CLASS[status]}>{STATUS_LABEL[status]}</span>;
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "bad" | "warn";
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
