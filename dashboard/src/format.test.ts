import { expect, it } from "vitest";
import { day, money, words } from "./format";

it("formats money in US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
  expect(money(33.5)).toBe("$33.50");
});

it("turns names into words", () => {
  expect(words("trip_delay")).toBe("Trip delay");
  expect(words("baggage")).toBe("Baggage");
});

it("formats dates and timestamps as days", () => {
  expect(day("2026-06-24")).toBe("Jun 24, 2026");
  expect(day("2026-11-20 13:32:01")).toBe("Nov 20, 2026");
});
