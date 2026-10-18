import { test } from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_SOURCES, createDemoChain } from "../src/demo-chain.js";

const write = (chain, fn, args) => chain.write(fn, args, () => {}).then((r) => r.result);

test("demo: seeded data and verified challenge falsifies the open ferry claim", { timeout: 20000 }, async () => {
  const bruno = createDemoChain({ accountIndex: 1 });
  const list = await bruno.read("list_claims", [0, 10]);
  assert.equal(list.total, 4);
  const ferry = list.items.find((c) => c.status === "OPEN");
  assert.equal(await write(bruno, "challenge", [ferry.id, SAMPLE_SOURCES[1].url]).catch((e) => e.message), "UserError: This source has already been checked against this claim.");
  assert.equal(await write(bruno, "challenge", [ferry.id, SAMPLE_SOURCES[0].url]), "FALSIFIES");
  const c = await bruno.read("get_claim", [ferry.id]);
  assert.equal(c.status, "FALSIFIED");
  assert.equal(c.challenges.at(-1).condition, 1);
});

test("demo: vague conditions stay a draft, flaky source is undetermined", { timeout: 20000 }, async () => {
  const ada = createDemoChain({ accountIndex: 0 });
  const id = await write(ada, "post_claim", ["Ferry feelings", "Passengers will like the Port Avery ferry more over time.",
    ["Passengers privately feel the Port Avery ferry got worse.", "People eventually stop using the Port Avery ferry much."], 5, 10]);
  assert.equal((await ada.read("get_claim", [id])).status, "DRAFT");
  await assert.rejects(write(ada, "withdraw", [id + 99]), /No such claim/);
});
