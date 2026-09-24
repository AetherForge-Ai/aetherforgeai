import { describe, expect, it } from "vitest";
import { alertsToArchive, positionIsClosed } from "@/lib/alert-lifecycle";

const clw = { _id: "a1", ticker: "CLW", status: "active" };
const sol = { _id: "a2", ticker: "SOL", status: "active" };
const archived = { _id: "a3", ticker: "CLW", status: "archived" };

describe("alert auto-close", () => {
  it("archives stock and crypto alerts when quantity reaches zero", () => {
    expect(positionIsClosed(0)).toBe(true);
    expect(alertsToArchive([clw, sol], "CLW", 0).map((a) => a._id)).toEqual(["a1"]);
    expect(alertsToArchive([clw, sol], "sol", 0).map((a) => a._id)).toEqual(["a2"]);
  });

  it("leaves alerts active on a partial sell and skips rows already archived", () => {
    expect(positionIsClosed(4)).toBe(false);
    expect(alertsToArchive([clw, sol], "CLW", 2)).toEqual([]);
    expect(alertsToArchive([archived], "CLW", 0)).toEqual([]);
  });
});
