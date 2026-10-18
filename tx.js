// Transaction lifecycle: a small state machine the tray renders. Kept free of DOM code
// so the lifecycle can be tested against a fake chain (tests/tx.test.js).

import { readableError } from "./logic.js";

export const STATUS_TEXT = {
  PENDING: "Queued for a leader",
  PROPOSING: "Leader is proposing a result",
  COMMITTING: "Validators are committing votes",
  REVEALING: "Validators are revealing votes",
  APPEAL_COMMITTING: "Appeal: validators committing",
  APPEAL_REVEALING: "Appeal: validators revealing",
  READY_TO_FINALIZE: "Ready to finalize",
  ACCEPTED: "Accepted by validators",
  FINALIZED: "Finalized",
};

export const FAILED = new Set(["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
export const DONE = new Set(["ACCEPTED", "FINALIZED"]);

let nextId = 1;

export function createTracker(onChange = () => {}) {
  const txs = [];

  function emit() {
    onChange(txs.slice());
  }

  /** Runs chain.write and records each stage. Resolves with the final tx record. */
  async function run(label, chain, fn, args) {
    const tx = {
      id: nextId++,
      label,
      fn,
      state: "signing", // signing | pending | accepted | finalized | failed
      hash: "",
      stages: [{ key: "signing", text: "Waiting for your signature", at: Date.now() }],
      error: "",
    };
    txs.unshift(tx);
    emit();

    const push = (key, text) => {
      const last = tx.stages[tx.stages.length - 1];
      if (last && last.key === key) return;
      tx.stages.push({ key, text, at: Date.now() });
      emit();
    };

    try {
      const outcome = await chain.write(fn, args, (stage, info = {}) => {
        if (stage === "submitted") {
          tx.hash = info.hash || "";
          tx.state = "pending";
          push("submitted", "Submitted to the network");
        } else if (stage === "status") {
          const s = info.status;
          if (DONE.has(s)) return;
          push(s, STATUS_TEXT[s] || s);
        } else if (stage === "finalized") {
          // May arrive after acceptance, while finality is polled in the background.
          const last = tx.stages[tx.stages.length - 1];
          if (last?.key === "awaiting-finality") tx.stages.pop();
          tx.state = "finalized";
          push("FINALIZED", STATUS_TEXT.FINALIZED);
        }
      });
      if (tx.state !== "finalized") {
        tx.state = "accepted";
        push("ACCEPTED", STATUS_TEXT.ACCEPTED);
        if (outcome?.finalized) {
          tx.state = "finalized";
          push("FINALIZED", STATUS_TEXT.FINALIZED);
        } else {
          push("awaiting-finality", "Finality pending (appeal window open)");
        }
      }
      tx.result = outcome?.result;
      emit();
      return tx;
    } catch (err) {
      tx.state = "failed";
      tx.error = readableError(err);
      push("failed", tx.error);
      emit();
      throw Object.assign(new Error(tx.error), { tx });
    }
  }

  function dismiss(id) {
    const i = txs.findIndex((t) => t.id === id);
    if (i >= 0) txs.splice(i, 1);
    emit();
  }

  return { run, dismiss, list: () => txs.slice() };
}
