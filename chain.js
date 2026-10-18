// Live chain adapter over genlayer-js. The demo build swaps this for demo-chain.js,
// which implements the same interface: { mode, network, account, read, write, ... }.

import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet, localnet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { DONE, FAILED } from "./tx.js";

export const NETWORKS = {
  studionet: { label: "GenLayer Studio", chain: studionet },
  testnetBradbury: { label: "Testnet Bradbury", chain: testnetBradbury },
  testnetAsimov: { label: "Testnet Asimov", chain: testnetAsimov },
  localnet: { label: "Local network", chain: localnet },
};

const KEY_STORE = "popper.key";
const POLL_MS = 2500;
const ACCEPT_TIMEOUT_MS = 6 * 60 * 1000;
const FINAL_TIMEOUT_MS = 45 * 60 * 1000;

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null;
  }
}

export function loadOrCreateKey() {
  let key = store(KEY_STORE);
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    key = generatePrivateKey();
    store(KEY_STORE, key);
  }
  return key;
}

export function importKey(key) {
  key = key.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("A private key is 0x followed by 64 hex characters.");
  store(KEY_STORE, key);
  return key;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function statusName(tx) {
  return String(tx?.statusName || tx?.status_name || tx?.status || "").toUpperCase();
}

/** Best-effort extraction of a contract error message from a receipt. */
export function receiptError(tx) {
  const result = String(tx?.txExecutionResultName || tx?.resultName || "");
  if (!/ERROR|FAIL/i.test(result)) return null;
  const text = JSON.stringify(tx);
  const m = /(?:UserError|user error)[^"\\]*?[:(]\s*['\\"]*([^"\\']{3,200})/i.exec(text);
  return m ? m[1].trim() : "The contract rejected this transaction.";
}

export function createLiveChain({ network = "studionet", address, privateKey }) {
  const net = NETWORKS[network] || NETWORKS.studionet;
  const account = createAccount(privateKey || loadOrCreateKey());
  const client = createClient({ chain: net.chain, account });

  async function read(functionName, args = []) {
    if (!address) throw new Error("Set the contract address in settings first.");
    const raw = await client.readContract({ address, functionName, args });
    return typeof raw === "string" && /^[[{]/.test(raw) ? JSON.parse(raw) : raw;
  }

  async function write(functionName, args, onStage = () => {}) {
    if (!address) throw new Error("Set the contract address in settings first.");
    onStage("signing");
    const hash = await client.writeContract({ address, functionName, args, value: 0n });
    onStage("submitted", { hash });

    const start = Date.now();
    let tx;
    for (;;) {
      if (Date.now() - start > ACCEPT_TIMEOUT_MS) throw new Error("Timed out waiting for validators.");
      try {
        tx = await client.getTransaction({ hash });
      } catch {
        tx = null; // not indexed yet
      }
      const s = statusName(tx);
      if (s) onStage("status", { status: s });
      if (FAILED.has(s)) throw new Error(s);
      if (DONE.has(s)) break;
      await wait(POLL_MS);
    }

    const err = receiptError(tx);
    if (err) throw new Error(`UserError: ${err}`);

    const finalized = statusName(tx) === "FINALIZED";
    if (!finalized) watchFinality(hash, onStage);
    return { hash, finalized, result: tx };
  }

  async function watchFinality(hash, onStage) {
    const start = Date.now();
    while (Date.now() - start < FINAL_TIMEOUT_MS) {
      await wait(POLL_MS * 4);
      try {
        const tx = await client.getTransaction({ hash });
        if (statusName(tx) === "FINALIZED") return onStage("finalized");
      } catch {
        /* keep polling */
      }
    }
  }

  return {
    mode: "live",
    network,
    networkLabel: net.label,
    contract: address,
    account: account.address.toLowerCase(),
    explorerTx: (hash) => (net.chain.blockExplorers?.default?.url ? `${net.chain.blockExplorers.default.url}/tx/${hash}` : ""),
    now: () => Math.floor(Date.now() / 1000),
    read,
    write,
  };
}
