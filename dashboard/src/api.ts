export type Status = "waiting" | "in_progress" | "awaiting_signoff" | "decided";
export type DecisionKind = "approve" | "decline" | "refer";

export interface ClaimSummary {
  claim_id: string;
  customer_name: string;
  claim_type: string;
  summary: string;
  submitted_on: string;
  amount_claimed: number;
  status: Status;
  decision: DecisionKind | null;
  payout: number | null;
}

export interface Item {
  description: string;
  category: string;
  amount: number;
}

export interface ClaimDocument {
  name: string;
  type: string;
  content: string;
}

export interface Decision {
  decision: DecisionKind;
  payout: number;
  reasons: string;
  policy_section: string;
  decided_at: string;
}

export interface Claim {
  claim_id: string;
  policy_id: string;
  customer_id: string;
  claim_type: string;
  submitted_on: string;
  incident_date: string;
  incident_location: string;
  summary: string;
  story: string;
  items: Item[];
  amount_claimed: number;
  documents: ClaimDocument[];
  status: Status;
  decision: Decision | null;
  payment: { amount: number; paid_at: string } | null;
  sign_off: {
    handler_id: string;
    handler_name: string;
    signed_at: string;
  } | null;
}

export interface Policy {
  policy_id: string;
  plan: string;
  purchased_on: string;
  trip: {
    destination: string;
    departs_on: string;
    returns_on: string;
    trip_cost: number;
  };
  travelers: string[];
  plan_details: { name: string };
  add_on_details: { add_on: string; name: string }[];
}

export interface PreviousClaim {
  claim_id: string;
  filed_on: string;
  claim_type: string;
  summary: string;
  outcome: string;
  amount_paid: number;
}

export interface Customer {
  customer_id: string;
  name: string;
  customer_since: string;
  previous_claims: PreviousClaim[];
}

export interface Step {
  step_id: number;
  kind: "tool_call" | "tool_result" | "message" | "error";
  text: string;
  created_at: string;
}

export interface Handler {
  handler_id: string;
  name: string;
  role: string;
}

async function request<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const { detail } = (await response.json()) as { detail: unknown };
    throw new Error(String(detail));
  }
  return (await response.json()) as T;
}

export const api = {
  listClaims: () => request<ClaimSummary[]>("/api/claims"),
  getClaim: (claimId: string) => request<Claim>(`/api/claims/${claimId}`),
  getPolicy: (policyId: string) => request<Policy>(`/api/policies/${policyId}`),
  getCustomer: (customerId: string) =>
    request<Customer>(`/api/customers/${customerId}`),
  listSteps: (claimId: string) =>
    request<Step[]>(`/api/claims/${claimId}/steps`),
  listHandlers: () => request<Handler[]>("/api/handlers"),
  getInstructions: async () =>
    (await request<{ instructions: string }>("/api/instructions")).instructions,
  runClaim: (claimId: string) =>
    request<Claim>(`/api/claims/${claimId}/run`, "POST"),
  runQueue: () => request<{ claims: number }>("/api/queue/run", "POST"),
  signOff: (claimId: string, handlerId: string) =>
    request<Claim>(`/api/claims/${claimId}/sign-off`, "POST", {
      handler_id: handlerId,
    }),
};
