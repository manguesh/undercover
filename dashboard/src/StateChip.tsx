import type { Status } from "./api";
import { STATUS_LABELS } from "./format";

export function StateChip({ status }: Readonly<{ status: Status }>) {
  return <span className={`chip chip-${status}`}>{STATUS_LABELS[status]}</span>;
}
