// Simulated chain for `npm run dev:demo`. It mirrors the contract's rules, but its
// "validators" are simple keyword checks, and it can only open the sample sources below.
// The interface says so on screen whenever this adapter is active.

import { FLAGS, LIMITS, cleanLine, checkClaim, checkConditions, escapeHatchHits, normalizeText, normalizeUrl } from "./logic.js";

const STORE = "popper.demo.v1";
const DAY = 86400;

export const DEMO_ACCOUNTS = [
  { name: "Ada", address: "0xada0000000000000000000000000000000000ada" },
  { name: "Bruno", address: "0xb2000000000000000000000000000000000000b2" },
  { name: "Chiara", address: "0xc3000000000000000000000000000000000000c3" },
];

export const SAMPLE_SOURCES = [
  {
    url: "https://demo.popper.example/harbour-notice-41",
    title: "Harbour notice 41 (states a suspension)",
    text: "Port Avery Harbour Office. Harbour notice 41: the Port Avery ferry is suspended for one full day on 3 November 2026 because of storm warnings. Crossings resume on the normal winter timetable the following morning.",
  },
  {
    url: "https://demo.popper.example/ferry-hybrid-boat",
    title: "New hybrid ferry (related, does not refute)",
    text: "The Port Avery Ferry Company unveiled a new hybrid boat this week and said its winter timetable is unchanged. The boat enters service in the spring after sea trials in the bay.",
  },
  {
    url: "https://demo.popper.example/flaky-live-blog",
    title: "Live blog that changes between reads",
    text: null, // validators see different text: the result is UNDETERMINED
  },
  {
    url: "https://demo.popper.example/tram-opening-delayed",
    title: "Tram opening delayed",
    text: "The Port Avery Transit Authority has set a new passenger opening date for the tram line: 14 September 2026, after signalling tests overran by several months.",
  },
];

const STOP = new Set("the a an and or of to in on at for by with from is are was were be been any one more least that this its it as than into over under after before".split(" "));

function words(s) {
  return normalizeText(s).replace(/[^a-z0-9% ]/g, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
}

function fakeAudit(statement, conditions) {
  const claimWords = new Set(words(statement));
  return conditions.map((c) => {
    const row = {
      VAGUE: !/\d/.test(c),
      UNOBSERVABLE: /\b(feel|feels|believe|believes|secretly|privately|intends?|deep down|someday|eventually|happier)\b/i.test(c),
      IRRELEVANT: !words(c).some((w) => claimWords.has(w)),
      ESCAPE_HATCH: escapeHatchHits(c).length > 0,
    };
    row.passed = !FLAGS.some((f) => row[f]);
    return row;
  });
}

function fakeChallenge(conditions, text) {
  const sentences = text.split(/(?<=\.)\s+/);
  const rows = conditions.map((c) => {
    const cw = new Set(words(c));
    let best = { score: 0, s: "" };
    for (const s of sentences) {
      const sw = new Set(words(s));
      const score = [...cw].filter((w) => sw.has(w)).length / Math.max(1, cw.size);
      if (score > best.score) best = { score, s };
    }
    if (best.score >= 0.6) return { status: "MET", quote: best.s.trim(), verified: true };
    if (best.score >= 0.35) return { status: "PARTIAL", quote: best.s.trim(), verified: true };
    return { status: "NOT_MET", quote: "", verified: false };
  });
  const verdict = rows.some((r) => r.status === "MET" && r.verified) ? "FALSIFIES" : "DOES_NOT_FALSIFY";
  return { rows, verdict };
}

function seed(now) {
  const mk = (o) => ({ opened_at: 0, deadline: 0, resolved_at: 0, audits: [], challenges: [], falsified_by: null, winner: "", ...o });
  const clean = (n) => Array.from({ length: n }, () => ({ VAGUE: false, UNOBSERVABLE: false, IRRELEVANT: false, ESCAPE_HATCH: false, passed: true }));
  const [ada, bruno, chiara] = DEMO_ACCOUNTS.map((a) => a.address);

  const ferryConds = [
    "The Port Avery Ferry Company announces the cancellation of one or more scheduled winter crossings in 2026.",
    "A Port Avery harbour notice reports the ferry suspended for at least one full day before 31 December 2026.",
  ];
  const tramConds = [
    "The Port Avery Transit Authority announces a passenger opening date for the tram line after 1 June 2026.",
    "A Port Avery news report says the tram line is still closed to passengers on 1 June 2026.",
  ];
  const bridgeConds = [
    "A Halden council notice reports the Halden Bridge closed to all traffic on any day in September 2026.",
    "A Halden news report says the Halden Bridge was shut to vehicles for repairs during September 2026.",
  ];
  const vague = [
    "People generally feel worse about remote work after some years.",
    "Research eventually shows remote work is not so great after all.",
  ];
  const flagged = (n) => clean(n).map((r) => ({ ...r, VAGUE: true, UNOBSERVABLE: true, passed: false }));

  return [
    mk({
      id: 0, title: "Halden Bridge stays open", claimant: chiara, status: "SURVIVED", bounty: 250, deadline_days: 30,
      statement: "The Halden Bridge stays open to traffic every day in September 2026.",
      conditions: bridgeConds, created_at: now - 50 * DAY, opened_at: now - 50 * DAY, deadline: now - 20 * DAY, resolved_at: now - 19 * DAY,
      audits: [{ attempt: 1, at: now - 50 * DAY, conditions: bridgeConds, rows: clean(2), passed: true }],
      challenges: [{ n: 0, challenger: bruno, url: "https://demo.popper.example/halden-traffic-report", at: now - 30 * DAY, verdict: "DOES_NOT_FALSIFY",
        rows: [{ status: "PARTIAL", quote: "Lane restrictions applied on the Halden Bridge overnight on 12 September.", verified: true }, { status: "NOT_MET", quote: "", verified: false }] }],
    }),
    mk({
      id: 1, title: "Port Avery tram opens by June", claimant: bruno, status: "FALSIFIED", bounty: 500, deadline_days: 120,
      statement: "Port Avery's new tram line opens to passengers before 1 June 2026.",
      conditions: tramConds, created_at: now - 40 * DAY, opened_at: now - 40 * DAY, deadline: now + 80 * DAY, resolved_at: now - 12 * DAY,
      audits: [{ attempt: 1, at: now - 40 * DAY, conditions: tramConds, rows: clean(2), passed: true }],
      challenges: [{ n: 0, challenger: ada, url: SAMPLE_SOURCES[3].url, at: now - 12 * DAY, verdict: "FALSIFIES", condition: 0,
        rows: fakeChallenge(tramConds, SAMPLE_SOURCES[3].text).rows }],
      falsified_by: 0, winner: ada,
    }),
    mk({
      id: 2, title: "Remote work and happiness", claimant: bruno, status: "UNFALSIFIABLE", bounty: 100, deadline_days: 60,
      statement: "Remote work makes people less happy in the long run than office work does.",
      conditions: vague, created_at: now - 9 * DAY, resolved_at: now - 8 * DAY,
      audits: [1, 2, 3].map((n) => ({ attempt: n, at: now - 9 * DAY + n * 3600, conditions: vague, rows: flagged(2), passed: false })),
    }),
    mk({
      id: 3, title: "Port Avery ferry keeps its winter timetable", claimant: ada, status: "OPEN", bounty: 1000, deadline_days: 75,
      statement: "The Port Avery ferry runs every scheduled crossing on its winter timetable through 31 December 2026.",
      conditions: ferryConds, created_at: now - 2 * DAY, opened_at: now - 2 * DAY, deadline: now + 73 * DAY,
      audits: [{ attempt: 1, at: now - 2 * DAY, conditions: ferryConds, rows: clean(2), passed: true }],
      challenges: [{ n: 0, challenger: chiara, url: SAMPLE_SOURCES[1].url, at: now - DAY, ...fakeChallenge(ferryConds, SAMPLE_SOURCES[1].text) }],
    }),
  ];
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const userError = (m) => new Error(`UserError: ${m}`);

export function createDemoChain({ accountIndex = 0 } = {}) {
  let state;
  try {
    state = JSON.parse(localStorage.getItem(STORE) || "null");
  } catch {
    state = null;
  }
  if (!state) state = { offset: 0, claims: seed(Math.floor(Date.now() / 1000)) };
  const save = () => {
    try {
      localStorage.setItem(STORE, JSON.stringify(state));
    } catch {
      /* private window: state lives in memory only */
    }
  };
  const now = () => Math.floor(Date.now() / 1000) + state.offset;
  const account = DEMO_ACCOUNTS[accountIndex]?.address || DEMO_ACCOUNTS[0].address;
  const get = (id) => {
    const c = state.claims[Number(id)];
    if (!c) throw userError("No such claim.");
    return c;
  };

  function applyAudit(c, conds, rows) {
    const passed = rows.every((r) => r.passed);
    c.audits.push({ attempt: c.audits.length + 1, at: now(), conditions: conds, rows, passed });
    c.conditions = conds;
    if (passed) Object.assign(c, { status: "OPEN", opened_at: now(), deadline: now() + c.deadline_days * DAY });
    else if (c.audits.length >= LIMITS.maxAuditAttempts) Object.assign(c, { status: "UNFALSIFIABLE", resolved_at: now() });
  }

  const methods = {
    post_claim(title, statement, conditions, bounty, deadlineDays) {
      const conds = conditions.map(cleanLine).filter(Boolean);
      const errs = checkClaim({ title, statement, conditions: conds, bounty, deadlineDays }).filter((e) => !/always fails/.test(e));
      if (errs.length) throw userError(errs[0]);
      const c = {
        id: state.claims.length, title: cleanLine(title), claimant: account, statement: cleanLine(statement), conditions: conds,
        bounty: Number(bounty), deadline_days: Number(deadlineDays), status: "DRAFT", created_at: now(), opened_at: 0, deadline: 0,
        resolved_at: 0, audits: [], challenges: [], falsified_by: null, winner: "",
      };
      applyAudit(c, conds, fakeAudit(c.statement, conds));
      state.claims.push(c);
      return c.id;
    },
    revise_conditions(id, conditions) {
      const c = get(id);
      if (c.claimant !== account) throw userError("Only the claimant can revise conditions.");
      if (c.status !== "DRAFT") throw userError("Only a draft claim can be revised.");
      const conds = conditions.map(cleanLine).filter(Boolean);
      const errs = checkConditions(conds).filter((e) => !/always fails/.test(e));
      if (errs.length) throw userError(errs[0]);
      applyAudit(c, conds, fakeAudit(c.statement, conds));
      return c.status;
    },
    withdraw(id) {
      const c = get(id);
      if (c.claimant !== account) throw userError("Only the claimant can withdraw.");
      if (c.status !== "DRAFT") throw userError("An open claim cannot be withdrawn; it stands until its deadline.");
      Object.assign(c, { status: "WITHDRAWN", resolved_at: now() });
    },
    challenge(id, url) {
      const c = get(id);
      if (c.status !== "OPEN") throw userError("This claim is not open for challenges.");
      if (now() >= c.deadline) throw userError("The deadline has passed; close the claim instead.");
      if (account === c.claimant) throw userError("You cannot challenge your own claim.");
      try {
        url = normalizeUrl(url);
      } catch (e) {
        throw userError(e.message);
      }
      if (c.challenges.filter((x) => x.challenger === account).length >= LIMITS.maxChallengesPerAddress)
        throw userError(`Each address may challenge a claim at most ${LIMITS.maxChallengesPerAddress} times.`);
      if (c.challenges.some((x) => x.url === url)) throw userError("This source has already been checked against this claim.");
      const src = SAMPLE_SOURCES.find((s) => s.url === url);
      if (src && src.text === null) throw new Error("UNDETERMINED");
      const res = src ? fakeChallenge(c.conditions, src.text) : { rows: [], verdict: "UNREACHABLE" };
      const entry = { n: c.challenges.length, challenger: account, url, at: now(), ...res };
      c.challenges.push(entry);
      if (res.verdict === "FALSIFIES") {
        entry.condition = res.rows.findIndex((r) => r.status === "MET" && r.verified);
        Object.assign(c, { status: "FALSIFIED", falsified_by: entry.n, winner: account, resolved_at: now() });
      }
      return res.verdict;
    },
    close_claim(id) {
      const c = get(id);
      if (c.status !== "OPEN") throw userError("Only an open claim can be closed.");
      if (now() < c.deadline) throw userError("The deadline has not passed yet.");
      Object.assign(c, { status: "SURVIVED", resolved_at: now() });
      return "SURVIVED";
    },
  };

  async function read(fn, args = []) {
    await wait(120);
    if (fn === "get_claim") return structuredClone(get(args[0]));
    if (fn === "list_claims") {
      const [offset, limit] = args;
      const items = state.claims.slice().reverse().slice(offset, offset + limit).map((c) => ({
        id: c.id, title: c.title, claimant: c.claimant, status: c.status, bounty: c.bounty, deadline: c.deadline,
        challenges: c.challenges.length, created_at: c.created_at,
      }));
      return { total: state.claims.length, items };
    }
    throw new Error(`Unknown view ${fn}`);
  }

  async function write(fn, args, onStage = () => {}) {
    onStage("signing");
    await wait(500);
    const hash = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    onStage("submitted", { hash });
    for (const s of ["PENDING", "PROPOSING", "COMMITTING", "REVEALING"]) {
      await wait(s === "PROPOSING" ? 1100 : 650);
      onStage("status", { status: s });
    }
    const snapshot = JSON.stringify(state);
    let result;
    try {
      result = methods[fn](...args);
    } catch (e) {
      state = JSON.parse(snapshot);
      throw e;
    }
    save();
    onStage("status", { status: "ACCEPTED" });
    setTimeout(() => onStage("finalized"), 6000);
    return { hash, finalized: false, result };
  }

  return {
    mode: "demo",
    network: "demo",
    networkLabel: "Simulated chain",
    contract: "0xdemo",
    account,
    explorerTx: () => "",
    now,
    read,
    write,
    skipDays(days) {
      state.offset += days * DAY;
      save();
    },
    reset() {
      state = { offset: 0, claims: seed(Math.floor(Date.now() / 1000)) };
      save();
    },
  };
}
