import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaim, checkConditions, splitConditions, swanStates, timeLeft } from "../src/logic.js";

const C1 = "A Port Avery harbour notice reports the ferry suspended for at least one full day in 2026.";
const C2 = "The Port Avery Ferry Company announces the cancellation of a scheduled winter crossing in 2026.";

test("valid claim has no errors", () => {
  assert.deepEqual(checkClaim({ title: "Ferry", statement: "The ferry runs every crossing in winter 2026.", conditions: [C1, C2], bounty: "10", deadlineDays: "30" }), []);
});

test("form catches the same problems the contract rejects", () => {
  assert.equal(checkConditions([C1]).length, 1);
  assert.match(checkConditions([C1, C1.toUpperCase()]).join(), /repeats/);
  assert.match(checkConditions([C1, "Any news story, unless I think it is unfair to me."]).join(), /always fails/);
  const errs = checkClaim({ title: "x", statement: "short", conditions: [C1, C2], bounty: "1.5", deadlineDays: "400" });
  assert.equal(errs.length, 4);
});

test("splitConditions drops blank lines and trims", () => {
  assert.deepEqual(splitConditions(`  ${C1}\n\n${C2}  \n`), [C1, C2]);
});

test("swans reflect the strongest finding per condition", () => {
  const claim = { conditions: [C1, C2, C1 + "x"], challenges: [
    { rows: [{ status: "PARTIAL", verified: true }, { status: "NOT_MET" }, { status: "MET", verified: false }] },
    { rows: [{ status: "MET", verified: true }, { status: "NOT_MET" }, { status: "NOT_MET" }] },
  ] };
  assert.deepEqual(swanStates(claim), ["met", "white", "white"]);
});

test("timeLeft wording", () => {
  assert.equal(timeLeft(100, 200), "deadline passed");
  assert.equal(timeLeft(86400 * 3 + 10, 0), "3 days left");
  assert.equal(timeLeft(7200 + 600, 0), "2 h 10 min left");
});
