import { describe, expect, it } from "vitest";
import { dateWithYear, passedCount, seasonSpan } from "../../src/app/dates";

describe("season span", () => {
  it("shows the year once when both ends share it", () => {
    expect(seasonSpan(["2027-08-07", "2027-04-09", "2027-05-01"])).toBe("Apr 9 – Aug 7, 2027");
  });
  it("shows both years across New Year", () => {
    expect(seasonSpan(["2026-11-06", "2027-03-26"])).toBe("Nov 6, 2026 – Mar 26, 2027");
  });
  it("handles one date and none", () => {
    expect(seasonSpan(["2027-04-09"])).toBe("Apr 9, 2027");
    expect(seasonSpan([])).toBe("");
    expect(dateWithYear("2026-11-06")).toBe("Nov 6, 2026");
  });
  it("counts nights before today, not today itself", () => {
    expect(passedCount(["2026-10-19", "2026-10-20", "2026-10-21"], "2026-10-20")).toBe(1);
  });
});
