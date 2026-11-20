import { expect, test } from "@playwright/test";

test("the queue shows the 25 claims", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Claims queue" }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  const first = page.getByRole("row").filter({ hasText: "CLM-1001" });
  await expect(first).toContainText("Maya Patel");
  await expect(first).toContainText("$420.00");
});

test("the instructions are shown, read only", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Instructions" }).click();
  await expect(page.getByText("# The UnderCover Agent")).toBeVisible();
  await expect(page.getByText("Read only")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
});
