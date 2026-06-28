import { describe, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("dbg2", () => {
  it("dumps raw segment lines for day 1", () => {
    const t = fs.readFileSync(path.join(__dirname, "__fixtures__", "lee-4-day.txt"), "utf-8");
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const day1Start = lines.findIndex((l) => /^Day 1: Chest & Back & arms A$/i.test(l) || /^Day 1: Chest & Back & arms ATempo/i.test(l));
    const day2Start = lines.findIndex((l, i) => i > day1Start && /^Day 2:/i.test(l));
    const seg = lines.slice(day1Start, day2Start);
    const ts = seg.findIndex((l) => /Tracking Sheet/i.test(l));
    const before = ts >= 0 ? seg.slice(0, ts) : seg;
    console.log("before-tracking lines:", before.length);
    for (const l of before) console.log(JSON.stringify(l));
  });
});
