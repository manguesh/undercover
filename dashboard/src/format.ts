import type { DecisionKind, Status } from "./api";

export const STATUSES: Status[] = [
  "waiting",
  "in_progress",
  "awaiting_signoff",
  "decided",
];

export const STATUS_LABELS: Record<Status, string> = {
  waiting: "Waiting",
  in_progress: "In progress",
  awaiting_signoff: "Waiting for sign-off",
  decided: "Decided",
};

export const DECISION_LABELS: Record<DecisionKind, string> = {
  approve: "Approved",
  decline: "Declined",
  refer: "Referred",
};

export function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function words(name: string): string {
  const text = name.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function day(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00`).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
}
