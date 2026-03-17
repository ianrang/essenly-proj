import { describe, it, expect } from "vitest";
import { getRemainingDays, checkDowntimeSafety } from "./date";

describe("getRemainingDays", () => {
  it("returns days until end date", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 5);
    const result = getRemainingDays(tomorrow.toISOString().split("T")[0], null);
    expect(result).toBe(5);
  });

  it("returns stayDays as fallback", () => {
    expect(getRemainingDays(null, 7)).toBe(7);
  });

  it("returns null when no data", () => {
    expect(getRemainingDays(null, null)).toBeNull();
  });

  it("returns 0 for past end date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = getRemainingDays(yesterday.toISOString().split("T")[0], null);
    expect(result).toBe(0);
  });
});

describe("checkDowntimeSafety", () => {
  it("returns 'excluded' when downtime > remaining", () => {
    expect(checkDowntimeSafety(5, 3)).toBe("excluded");
  });

  it("returns 'warning' when downtime >= 50% of remaining", () => {
    expect(checkDowntimeSafety(3, 6)).toBe("warning");
  });

  it("returns 'safe' when downtime < 50% of remaining", () => {
    expect(checkDowntimeSafety(1, 7)).toBe("safe");
  });

  it("returns 'unknown' with null inputs", () => {
    expect(checkDowntimeSafety(null, 5)).toBe("unknown");
    expect(checkDowntimeSafety(3, null)).toBe("unknown");
  });
});
