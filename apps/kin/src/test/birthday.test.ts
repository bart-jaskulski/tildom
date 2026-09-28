import { describe, expect, it } from "vitest";
import { birthdayParts, birthdayValue, daysInBirthdayMonth, formatBirthday } from "../lib/birthday";

describe("birthdays", () => {
  it("stores complete and partial birthdays without inventing missing information", () => {
    expect(birthdayValue({ day: "17", month: "3", year: "1991" })).toBe("1991-03-17");
    expect(birthdayValue({ day: "17", month: "3", year: "" })).toBe("--03-17");
    expect(birthdayValue({ day: "", month: "", year: "1991" })).toBe("1991");
  });

  it("reads existing values and leaves legacy text intact", () => {
    expect(birthdayParts("--03-17")).toEqual({ day: "17", month: "3", year: "" });
    expect(birthdayParts("17 March")).toEqual({ day: "", month: "", year: "" });
    expect(formatBirthday("17 March")).toBe("17 March");
  });

  it("does not offer impossible days", () => {
    expect(daysInBirthdayMonth("2", "2024")).toBe(29);
    expect(daysInBirthdayMonth("2", "2023")).toBe(28);
  });
});
