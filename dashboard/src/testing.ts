import { vi } from "vitest";
import type { Claim, ClaimSummary, Customer, Policy, Step } from "./api";

type Routes = Record<string, unknown>;

/** Stub fetch so each "METHOD /path" returns its JSON, and others a 404. */
export function mockApi(routes: Routes) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    const body = routes[key];
    if (body instanceof Error) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: body.message }), { status: 409 }),
      );
    }
    if (body === undefined) {
      return Promise.resolve(
        new Response(JSON.stringify({ detail: `${key} not found` }), {
          status: 404,
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export const summary: ClaimSummary = {
  claim_id: "CLM-1001",
  customer_name: "Maya Patel",
  claim_type: "trip_delay",
  summary: "Flight home canceled by the airline",
  submitted_on: "2026-06-24",
  amount_claimed: 420,
  status: "waiting",
  decision: null,
  payout: null,
};

export const decidedSummary: ClaimSummary = {
  ...summary,
  claim_id: "CLM-1002",
  customer_name: "Tom Okafor",
  status: "decided",
  decision: "approve",
  payout: 1250,
};

export const claim: Claim = {
  claim_id: "CLM-1001",
  policy_id: "POL-2001",
  customer_id: "CUS-3001",
  claim_type: "trip_delay",
  submitted_on: "2026-06-24",
  incident_date: "2026-06-18",
  incident_location: "Rome, Italy",
  summary: "Flight home canceled by the airline",
  story: "My flight home from Rome was canceled.",
  items: [
    { description: "Airport hotel", category: "accommodation", amount: 245 },
  ],
  amount_claimed: 245,
  documents: [
    {
      name: "Hotel receipt",
      type: "receipt",
      content: "One night. Total paid: $245.00.",
    },
  ],
  status: "waiting",
  decision: null,
  payment: null,
  sign_off: null,
};

export const policy: Policy = {
  policy_id: "POL-2001",
  plan: "premium",
  purchased_on: "2026-04-22",
  trip: {
    destination: "Rome, Italy",
    departs_on: "2026-06-10",
    returns_on: "2026-06-18",
    trip_cost: 3100,
  },
  travelers: ["Maya Patel"],
  plan_details: { name: "UnderCover Premium" },
  add_on_details: [{ add_on: "electronics_plus", name: "Electronics Plus" }],
};

export const customer: Customer = {
  customer_id: "CUS-3001",
  name: "Maya Patel",
  customer_since: "2023-04-11",
  previous_claims: [
    {
      claim_id: "CLM-0412",
      filed_on: "2024-08-19",
      claim_type: "baggage_delay",
      summary: "Checked bag arrived 30 hours late",
      outcome: "approved",
      amount_paid: 140,
    },
  ],
};

export const steps: Step[] = [
  {
    step_id: 1,
    kind: "tool_call",
    text: 'get_claim({"claim_id": "CLM-1001"})',
    created_at: "2026-11-20 13:00:00",
  },
  {
    step_id: 2,
    kind: "error",
    text: "The agent stopped with an error: the model is down",
    created_at: "2026-11-20 13:00:01",
  },
];
