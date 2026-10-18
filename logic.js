// Shared helpers mirrored from the contract so the form can catch mistakes before a
// transaction is signed. Parity with Python is checked in tests/parity.test.js.

export const LIMITS = {
  minConditions: 2,
  maxConditions: 4,
  maxAuditAttempts: 3,
  maxChallengesPerAddress: 3,
  title: [4, 80],
  statement: [20, 400],
  condition: [20, 300],
  deadlineDays: [1, 365],
};

export const FLAGS = ["VAGUE", "UNOBSERVABLE", "IRRELEVANT", "ESCAPE_HATCH"];

export const FLAG_TEXT = {
  VAGUE: "Too vague: name a figure, date, entity or definite event.",
  UNOBSERVABLE: "Not checkable from a public page.",
  IRRELEVANT: "Would not contradict the claim even if it happened.",
  ESCAPE_HATCH: "Leaves you room to decide whether it counts.",
};

export const ESCAPE_PHRASES = [
  "in my opinion", "in my judgment", "in my judgement", "at my discretion", "as i see fit",
  "unless i", "if i agree", "i decide", "i determine", "to my satisfaction", "in my view",
];

export const STATUS = {
  DRAFT: { label: "Draft", hint: "Conditions need revising before the claim is listed." },
  OPEN: { label: "Open", hint: "Anyone may challenge it with a public source." },
  FALSIFIED: { label: "Falsified", hint: "A source verified one of its refutation conditions." },
  SURVIVED: { label: "Survived", hint: "No source refuted it before the deadline." },
  UNFALSIFIABLE: { label: "Unfalsifiable", hint: "Failed the audit three times." },
  WITHDRAWN: { label: "Withdrawn", hint: "Withdrawn by the claimant while still a draft." },
};

const QUOTE_MAP = {
  "‘": "'", "’": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "‟": '"', "″": '"',
  "–": "-", "—": "-", "−": "-", " ": " ",
};

export function normalizeText(s) {
  if (typeof s !== "string") return "";
  let out = "";
  for (const ch of s) out += QUOTE_MAP[ch] ?? ch;
  return out.toLowerCase().replace(/\s+/g, " ").trim();
}

export function cleanLine(s) {
  return typeof s === "string" ? s.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() : "";
}

export function escapeHatchHits(condition) {
  const n = normalizeText(condition);
  return ESCAPE_PHRASES.filter((p) => n.includes(p));
}

export function splitConditions(text) {
  return String(text || "").split("\n").map(cleanLine).filter(Boolean);
}

/** Returns a list of problems with the conditions; empty means it can be sent. */
export function checkConditions(conds) {
  const errs = [];
  const [lo, hi] = LIMITS.condition;
  if (conds.length < LIMITS.minConditions || conds.length > LIMITS.maxConditions)
    errs.push(`Give ${LIMITS.minConditions} to ${LIMITS.maxConditions} conditions, one per line.`);
  const seen = new Set();
  conds.forEach((c, i) => {
    if (c.length < lo || c.length > hi) errs.push(`Condition ${i + 1} must be ${lo}-${hi} characters.`);
    const key = normalizeText(c);
    if (seen.has(key)) errs.push(`Condition ${i + 1} repeats an earlier one.`);
    seen.add(key);
    const hits = escapeHatchHits(c);
    if (hits.length) errs.push(`Condition ${i + 1} contains "${hits[0]}", which always fails the audit.`);
  });
  return errs;
}

export function checkClaim({ title, statement, conditions, bounty, deadlineDays }) {
  const errs = [];
  const t = cleanLine(title), s = cleanLine(statement);
  if (t.length < LIMITS.title[0] || t.length > LIMITS.title[1]) errs.push(`Title must be ${LIMITS.title[0]}-${LIMITS.title[1]} characters.`);
  if (s.length < LIMITS.statement[0] || s.length > LIMITS.statement[1]) errs.push(`Claim must be ${LIMITS.statement[0]}-${LIMITS.statement[1]} characters.`);
  if (!/^\d+$/.test(String(bounty))) errs.push("Bounty must be a whole number.");
  const d = Number(deadlineDays);
  if (!Number.isInteger(d) || d < LIMITS.deadlineDays[0] || d > LIMITS.deadlineDays[1])
    errs.push(`Deadline must be ${LIMITS.deadlineDays[0]}-${LIMITS.deadlineDays[1]} days.`);
  return errs.concat(checkConditions(conditions));
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[)/;

/** Same canonical form as the contract's normalize_url; throws Error with a readable message. */
export function normalizeUrl(url) {
  if (typeof url !== "string") throw new Error("URL is required.");
  url = url.trim();
  if (url.length > 500) throw new Error("URL is too long.");
  const m = /^https:\/\/([^/?#\s]+)([^\s#]*)/i.exec(url);
  if (!m || url.slice(0, m[0].length) !== url.split("#")[0]) throw new Error("Use a public https:// URL.");
  let host = m[1].toLowerCase();
  if (host.endsWith(":443")) host = host.slice(0, -4);
  if (host.includes("@") || host.includes(":")) throw new Error("Use a plain https URL without credentials or ports.");
  if (PRIVATE_HOST.test(host) || !host.includes(".") || /^[\d.]+$/.test(host)) throw new Error("Use a public website address.");
  let path = m[2] || "/";
  if (path.endsWith("/") && path.length > 1) path = path.replace(/\/+$/, "");
  return `https://${host}${path}`;
}

export function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export function timeLeft(deadline, now) {
  const s = deadline - now;
  if (s <= 0) return "deadline passed";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"} left`;
  const m = Math.floor((s % 3600) / 60);
  return h >= 1 ? `${h} h ${m} min left` : `${m} min left`;
}

export function formatDate(epoch) {
  if (!epoch) return "";
  return new Date(epoch * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Swan per condition: "met" (verified refutation), "partial", or "white". */
export function swanStates(claim) {
  const states = claim.conditions.map(() => "white");
  for (const ch of claim.challenges || []) {
    (ch.rows || []).forEach((r, i) => {
      if (r.status === "MET" && r.verified) states[i] = "met";
      else if (r.status === "PARTIAL" && states[i] === "white") states[i] = "partial";
    });
  }
  return states;
}

/** Turns chain and contract errors into one readable sentence. */
export function readableError(err) {
  const msg = String(err?.shortMessage || err?.message || err || "");
  if (/user (rejected|denied)|rejected the request/i.test(msg)) return "You declined the signature, so nothing was sent.";
  if (/UNDETERMINED/.test(msg)) return "Validators could not agree on a result, so nothing was recorded. Try again, or try a more stable source.";
  if (/timed? ?out|TIMEOUT/i.test(msg)) return "The network did not confirm in time. Check the claim before retrying; it may still go through.";
  if (/insufficient funds/i.test(msg)) return "This account has no funds for gas on the selected network.";
  const user = /(?:UserError|user error|execution reverted)[:\s]*(.+)$/i.exec(msg);
  if (user) return user[1].trim();
  return msg || "Something went wrong.";
}
