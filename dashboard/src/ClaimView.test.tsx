import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Claim } from "./api";
import { ClaimView } from "./ClaimView";
import { claim, customer, mockApi, policy, steps } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const handlers = [
  { handler_id: "HND-01", name: "Dana Whitfield", role: "Senior" },
];

function routes(shown: Claim, extra: Record<string, unknown> = {}) {
  return {
    "GET /api/claims/CLM-1001": shown,
    "GET /api/claims/CLM-1001/steps": steps,
    "GET /api/policies/POL-2001": policy,
    "GET /api/customers/CUS-3001": customer,
    "GET /api/handlers": handlers,
    ...extra,
  };
}

const approved: Claim = {
  ...claim,
  status: "awaiting_signoff",
  decision: {
    decision: "approve",
    payout: 1250,
    reasons: "The trip was cut short by a covered sickness.",
    policy_section: "Section 2, Trip Cancellation and Interruption",
    decided_at: "2026-11-20 13:00:00",
  },
};

it("shows the claim in full", async () => {
  mockApi(routes(claim));
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    await screen.findByText("My flight home from Rome was canceled."),
  ).toBeDefined();
  expect(screen.getByText("Airport hotel")).toBeDefined();
  expect(screen.getByText("Accommodation")).toBeDefined();
  expect(screen.getByText("Hotel receipt")).toBeDefined();
  expect(screen.getByText("One night. Total paid: $245.00.")).toBeDefined();
  expect(screen.getByText("Jun 18, 2026, Rome, Italy")).toBeDefined();
  expect(await screen.findByText("UnderCover Premium")).toBeDefined();
  expect(screen.getByText("Electronics Plus")).toBeDefined();
  expect(
    screen.getByText("Rome, Italy, Jun 10, 2026 to Jun 18, 2026"),
  ).toBeDefined();
  expect(await screen.findByText("Customer since Apr 11, 2023")).toBeDefined();
  expect(screen.getByText(/Checked bag arrived 30 hours late/)).toBeDefined();
  expect(screen.getByText("No decision yet.")).toBeDefined();
  expect(screen.getByText("Waiting")).toBeDefined();
});

it("shows what the agent did, in order", async () => {
  mockApi(routes(claim));
  render(<ClaimView claimId="CLM-1001" />);
  const call = await screen.findByText('get_claim({"claim_id": "CLM-1001"})');
  const error = screen.getByText(
    "The agent stopped with an error: the model is down",
  );
  expect(call.compareDocumentPosition(error)).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(error.closest("li")?.className).toBe("step-error");
});

it("says when the agent has not worked on a claim", async () => {
  mockApi({ ...routes(claim), "GET /api/claims/CLM-1001/steps": [] });
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    await screen.findByText("The agent hasn't worked on this claim yet."),
  ).toBeDefined();
});

it("runs the agent on a waiting claim", async () => {
  const fetchMock = mockApi(
    routes(claim, {
      "POST /api/claims/CLM-1001/run": { ...claim, status: "in_progress" },
    }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run the agent" }));
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/claims/CLM-1001/run",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

it("says why the agent could not be run", async () => {
  mockApi(
    routes(claim, {
      "POST /api/claims/CLM-1001/run": new Error("CLM-1001 is in_progress"),
    }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  fireEvent.click(await screen.findByRole("button", { name: "Run the agent" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Error: CLM-1001 is in_progress",
  );
});

it("shows that the agent is working", async () => {
  mockApi(routes({ ...claim, status: "in_progress" }));
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    await screen.findByText("The agent is working on this claim."),
  ).toBeDefined();
  expect(screen.queryByRole("button", { name: "Run the agent" })).toBeNull();
});

it("shows a decline with its reasons and section", async () => {
  mockApi(
    routes({
      ...claim,
      status: "decided",
      decision: {
        decision: "decline",
        payout: 0,
        reasons: "The loss happened after the trip ended.",
        policy_section: "Section 9, General exclusions",
        decided_at: "2026-11-20 13:00:00",
      },
    }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  expect((await screen.findByText("Declined")).parentElement?.className).toBe(
    "decision-decline",
  );
  expect(screen.getByText("$0.00")).toBeDefined();
  expect(
    screen.getByText("The loss happened after the trip ended."),
  ).toBeDefined();
  expect(screen.getByText("Section 9, General exclusions")).toBeDefined();
});

it("signs off a payout over the limit", async () => {
  const fetchMock = mockApi(
    routes(approved, { "POST /api/claims/CLM-1001/sign-off": approved }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    await screen.findByText(/waits for a handler to sign off/),
  ).toBeDefined();
  const button = screen.getByRole("button", { name: "Sign off and pay" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.change(screen.getByLabelText("Handler"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(button);
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/claims/CLM-1001/sign-off",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ handler_id: "HND-01" }),
      }),
    );
  });
});

it("says why a sign-off failed", async () => {
  mockApi(
    routes(approved, {
      "POST /api/claims/CLM-1001/sign-off": new Error("Already decided"),
    }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  await screen.findByRole("option", { name: "Dana Whitfield" });
  fireEvent.change(screen.getByLabelText("Handler"), {
    target: { value: "HND-01" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign off and pay" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Error: Already decided",
  );
});

it("shows the payment and who signed it off", async () => {
  mockApi(
    routes({
      ...approved,
      status: "decided",
      payment: { amount: 1250, paid_at: "2026-11-20 13:05:00" },
      sign_off: {
        handler_id: "HND-01",
        handler_name: "Dana Whitfield",
        signed_at: "2026-11-20 13:05:00",
      },
    }),
  );
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    (await screen.findByText(/signed off by Dana Whitfield/)).textContent,
  ).toBe("Paid $1,250.00 on Nov 20, 2026, signed off by Dana Whitfield.");
  expect(screen.queryByRole("button", { name: "Sign off and pay" })).toBeNull();
});

it("shows a customer with no earlier claims", async () => {
  mockApi({
    ...routes(claim),
    "GET /api/customers/CUS-3001": { ...customer, previous_claims: [] },
  });
  render(<ClaimView claimId="CLM-1001" />);
  expect(await screen.findByText("None.")).toBeDefined();
});

it("says when the claim cannot be found", async () => {
  mockApi({});
  render(<ClaimView claimId="CLM-1001" />);
  expect(
    await screen.findByText("Error: GET /api/claims/CLM-1001 not found"),
  ).toBeDefined();
});
