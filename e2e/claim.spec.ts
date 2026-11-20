import { type APIRequestContext, expect, test } from "@playwright/test";

// These tests play the agent's part through the API, so no model is called.
// Each test works on a claim of its own.

async function decide(
  request: APIRequestContext,
  claimId: string,
  decision: object,
) {
  expect((await request.post(`/api/claims/${claimId}/start`)).ok()).toBe(true);
  const response = await request.post(`/api/claims/${claimId}/decision`, {
    data: decision,
  });
  expect(response.ok()).toBe(true);
}

test("a claim shows its story, items and documents", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "CLM-1001" }).click();
  await expect(page.getByText(/My flight home from Rome/)).toBeVisible();
  await expect(page.getByText("Airport hotel, one night")).toBeVisible();
  await expect(
    page.getByText("Meridian Air cancellation notice"),
  ).toBeVisible();
  await expect(page.getByText("UnderCover Premium")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run the agent" }),
  ).toBeVisible();
});

test("the agent's steps appear as it works", async ({ page, request }) => {
  await page.goto("/#/claims/CLM-1005");
  await expect(page.getByText("No decision yet.")).toBeVisible();
  await request.post("/api/claims/CLM-1005/start");
  await request.post("/api/claims/CLM-1005/steps", {
    data: { kind: "tool_call", text: 'get_claim({"claim_id": "CLM-1005"})' },
  });
  await expect(
    page.getByText("The agent is working on this claim."),
  ).toBeVisible();
  await expect(
    page.getByText('get_claim({"claim_id": "CLM-1005"})'),
  ).toBeVisible();
  await request.post("/api/claims/CLM-1005/steps", {
    data: { kind: "message", text: "Reading the policy wording." },
  });
  await expect(page.getByText("Reading the policy wording.")).toBeVisible();
});

test("a payout over $1,000 waits for a handler's sign-off", async ({
  page,
  request,
}) => {
  await decide(request, "CLM-1003", {
    decision: "approve",
    payout: 1250,
    reasons: "The treatment was necessary and is covered.",
    policy_section: "Section 7, Emergency Medical",
  });
  const refused = await request.post("/api/claims/CLM-1003/payments", {
    data: { amount: 1250 },
  });
  expect(refused.status()).toBe(403);

  await page.goto("/#/claims/CLM-1003");
  await expect(page.getByText("Waiting for sign-off")).toBeVisible();
  await expect(page.getByText(/waits for a handler to sign off/)).toBeVisible();
  await page.getByLabel("Handler").selectOption({ label: "Dana Whitfield" });
  await page.getByRole("button", { name: "Sign off and pay" }).click();
  await expect(
    page.getByText(/Paid \$1,250\.00 on .*, signed off by Dana Whitfield\./),
  ).toBeVisible();
  await expect(page.getByText("Decided", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to the queue" }).click();
  const row = page.getByRole("row").filter({ hasText: "CLM-1003" });
  await expect(row).toContainText("Decided");
  await expect(row).toContainText("Approved");
  await expect(row).toContainText("$1,250.00");
});

test("a decline shows its reasons and policy section", async ({
  page,
  request,
}) => {
  await decide(request, "CLM-1006", {
    decision: "decline",
    payout: 0,
    reasons: "The injury happened outside the dates of the covered trip.",
    policy_section: "Section 9, General exclusions",
  });
  await page.goto("/#/claims/CLM-1006");
  await expect(page.getByText("Declined")).toBeVisible();
  await expect(
    page.getByText(
      "The injury happened outside the dates of the covered trip.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Section 9, General exclusions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run the agent" })).toHaveCount(
    0,
  );
});
