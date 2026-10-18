import { test } from "node:test";
import assert from "node:assert/strict";
import { createTracker } from "../src/tx.js";

function fakeChain(script) {
  return {
    async write(fn, args, onStage) {
      for (const step of script) {
        if (step instanceof Error) throw step;
        onStage(...step);
        await null;
      }
      return { result: `${fn}:${args.join(",")}`, finalized: false };
    },
  };
}

const HAPPY = [["signing"], ["submitted", { hash: "0xabc" }], ["status", { status: "PENDING" }], ["status", { status: "PROPOSING" }],
  ["status", { status: "COMMITTING" }], ["status", { status: "REVEALING" }], ["status", { status: "ACCEPTED" }]];

test("happy path records every stage in order", async () => {
  const snapshots = [];
  const t = createTracker((txs) => snapshots.push(txs[0]?.state));
  const tx = await t.run("Post claim", fakeChain(HAPPY), "post_claim", [1]);
  assert.equal(tx.state, "accepted");
  assert.equal(tx.hash, "0xabc");
  assert.deepEqual(tx.stages.map((s) => s.key), ["signing", "submitted", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "awaiting-finality"]);
  assert.ok(snapshots.includes("pending"));
});

test("repeated statuses are not duplicated", async () => {
  const t = createTracker();
  const s = [["submitted", { hash: "0x1" }], ["status", { status: "PROPOSING" }], ["status", { status: "PROPOSING" }]];
  const tx = await t.run("x", fakeChain(s), "f", []);
  assert.equal(tx.stages.filter((x) => x.key === "PROPOSING").length, 1);
});

test("late finality replaces the pending note", async () => {
  let later;
  const chain = {
    async write(fn, args, onStage) {
      onStage("submitted", { hash: "0x2" });
      later = () => onStage("finalized");
      return { finalized: false };
    },
  };
  const t = createTracker();
  const tx = await t.run("x", chain, "f", []);
  later();
  assert.equal(tx.state, "finalized");
  assert.deepEqual(tx.stages.slice(-2).map((s) => s.key), ["ACCEPTED", "FINALIZED"]);
});

for (const [name, err, expected] of [
  ["declined signature", new Error("User rejected the request."), /declined the signature/],
  ["undetermined", new Error("UNDETERMINED"), /could not agree/],
  ["timeout", new Error("Timed out waiting for validators."), /did not confirm in time/],
  ["contract rejection", new Error("UserError: You cannot challenge your own claim."), /You cannot challenge your own claim\.$/],
]) {
  test(`failure: ${name}`, async () => {
    const t = createTracker();
    await assert.rejects(t.run("x", fakeChain([["submitted", { hash: "0x3" }], err]), "f", []), expected);
    const [tx] = t.list();
    assert.equal(tx.state, "failed");
    assert.match(tx.error, expected);
    assert.ok(!tx.error.startsWith("Error") && !tx.error.startsWith("UserError"));
    assert.equal(tx.stages.at(-1).key, "failed");
  });
}

test("dismiss removes a transaction", async () => {
  const t = createTracker();
  const tx = await t.run("x", fakeChain(HAPPY), "f", []);
  t.dismiss(tx.id);
  assert.equal(t.list().length, 0);
});
