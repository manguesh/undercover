import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { decidedSummary, mockApi, summary } from "./testing";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it("shows the queue with each claim's state", async () => {
  mockApi({ "GET /api/claims": [summary, decidedSummary] });
  render(<App />);
  const row = (await screen.findByRole("link", { name: "CLM-1002" })).closest(
    "tr",
  );
  if (!row) throw new Error("no row");
  expect(within(row).getByText("Tom Okafor")).toBeDefined();
  expect(within(row).getByText("Decided")).toBeDefined();
  expect(within(row).getByText("Approved")).toBeDefined();
  expect(within(row).getByText("$1,250.00")).toBeDefined();
  expect(within(row).getByText("Trip delay")).toBeDefined();
  expect(within(row).getByText("Jun 24, 2026")).toBeDefined();
  const counts = screen.getByRole("list", { name: "Claims by state" });
  expect(within(counts).getByText("Waiting").nextSibling?.textContent).toBe(
    "1",
  );
  expect(
    within(counts).getByText("Waiting for sign-off").nextSibling?.textContent,
  ).toBe("0");
});

it("works the queue", async () => {
  const fetchMock = mockApi({
    "GET /api/claims": [summary],
    "POST /api/queue/run": { claims: 1 },
  });
  render(<App />);
  (await screen.findByRole("button", { name: "Work the queue" })).click();
  expect(
    await screen.findByText("The agent is working through 1 claims."),
  ).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith("/api/queue/run", expect.anything());
});

it("says why the queue could not be worked", async () => {
  mockApi({
    "GET /api/claims": [summary],
    "POST /api/queue/run": new Error("The backend is busy"),
  });
  render(<App />);
  (await screen.findByRole("button", { name: "Work the queue" })).click();
  expect(await screen.findByText("Error: The backend is busy")).toBeDefined();
});

it("turns off working the queue when nothing is waiting", async () => {
  mockApi({ "GET /api/claims": [decidedSummary] });
  render(<App />);
  const button = await screen.findByRole("button", { name: "Work the queue" });
  expect((button as HTMLButtonElement).disabled).toBe(true);
});

it("says when the backend cannot be reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByText("Error: offline")).toBeDefined();
});

it("refreshes the queue while it is open", async () => {
  vi.useFakeTimers();
  const fetchMock = mockApi({ "GET /api/claims": [summary] });
  render(<App />);
  await act(() => vi.advanceTimersByTimeAsync(4100));
  expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  vi.useRealTimers();
});

it("shows the agent's instructions, read only", async () => {
  mockApi({
    "GET /api/claims": [summary],
    "GET /api/instructions": { instructions: "# The UnderCover Agent" },
  });
  render(<App />);
  await act(async () => {
    window.location.hash = "#/instructions";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await Promise.resolve();
  });
  expect(await screen.findByText("# The UnderCover Agent")).toBeDefined();
  expect(screen.getByText("Read only")).toBeDefined();
  expect(
    screen
      .getByRole("link", { name: "Instructions" })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(screen.queryByRole("textbox")).toBeNull();
});
