import "./style.css";
import {
  FLAGS, FLAG_TEXT, LIMITS, STATUS, checkClaim, checkConditions, escapeHatchHits, formatDate,
  normalizeUrl, readableError, shortAddr, splitConditions, swanStates, timeLeft,
} from "./logic.js";
import { createTracker } from "./tx.js";

const DEMO = import.meta.env.VITE_DEMO === "true";
const SETTINGS_KEY = "popper.settings";

// ------------------------------------------------------------------ settings + chain

function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  } catch {
    /* ignore */
  }
  return {
    network: s.network || import.meta.env.VITE_NETWORK || "studionet",
    contract: s.contract || import.meta.env.VITE_CONTRACT_ADDRESS || "",
    demoAccount: Number.isInteger(s.demoAccount) ? s.demoAccount : 0,
  };
}

function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

let settings = loadSettings();
let chain;
let liveMod;
let demoMod;

async function connect() {
  if (DEMO) {
    demoMod ??= await import("./demo-chain.js");
    chain = demoMod.createDemoChain({ accountIndex: settings.demoAccount });
  } else {
    liveMod ??= await import("./chain.js");
    chain = liveMod.createLiveChain({ network: settings.network, address: settings.contract });
  }
  renderBar();
}

// ------------------------------------------------------------------ helpers

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString();

function who(addr) {
  if (!addr) return "";
  if (addr === chain?.account) return "you";
  if (DEMO && demoMod) {
    const a = demoMod.DEMO_ACCOUNTS.find((x) => x.address === addr);
    if (a) return a.name;
  }
  return shortAddr(addr);
}

const SWAN = "M15.2 19C16.4 17 15.8 13.4 15.1 10.4 14.4 7.2 14.9 4 17.4 3.3 19.1 2.9 20.4 3.9 20.7 5.3L23.8 7.6 20.4 7C19.6 6.6 18.5 6.8 18.1 7.8 17.5 9.2 18.1 12.1 18.9 14.6 19.5 16.5 19.8 18 19.7 19.3 23.6 19.4 28 20.6 28 23.2 28 26.4 24 28 18 28H10.2C5.2 28 2 24.6 1.6 18 5 20.4 10.2 20.9 15.2 19Z";

function swan(state, label) {
  return `<svg class="swan swan-${state}" viewBox="0 0 32 32" role="img" aria-label="${esc(label)}"><path d="${SWAN}"/></svg>`;
}

const SWAN_LABEL = { white: "not refuted", partial: "related evidence, not refuted", met: "refuted by a verified source" };

function swans(claim) {
  return `<span class="swans">${swanStates(claim).map((s, i) => swan(s, `Condition ${i + 1}: ${SWAN_LABEL[s]}`)).join("")}</span>`;
}

function statusTag(status) {
  return `<span class="status status-${status.toLowerCase()}">${esc(STATUS[status]?.label || status)}</span>`;
}

function timing(c) {
  const now = chain.now();
  if (c.status === "OPEN") return timeLeft(c.deadline, now);
  if (c.status === "DRAFT") return "not listed yet";
  return `${STATUS[c.status].label.toLowerCase()} ${formatDate(c.resolved_at)}`;
}

// ------------------------------------------------------------------ top bar

function renderBar() {
  const acct = $("#account");
  acct.textContent = DEMO ? demoMod.DEMO_ACCOUNTS[settings.demoAccount].name : shortAddr(chain.account);
  acct.title = `Signed in as ${chain.account}. Open settings`;
  $("#network").textContent = chain.networkLabel;
  $("#demo-banner").hidden = !DEMO;
  document.querySelectorAll("[data-nav]").forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === currentNav() ? "page" : "false"));
}

function currentNav() {
  return location.hash.startsWith("#/new") ? "#/new" : "#/";
}

// ------------------------------------------------------------------ routing

const view = () => $("#view");
let filter = "ALL";

async function route() {
  renderBar();
  const h = location.hash || "#/";
  const m = /^#\/claim\/(\d+)/.exec(h);
  try {
    if (m) await renderClaim(Number(m[1]));
    else if (h.startsWith("#/new")) renderNew();
    else await renderList();
  } catch (err) {
    view().innerHTML = `<div class="notice notice-error"><p>${esc(readableError(err))}</p>${
      !DEMO && !settings.contract ? `<p><button class="btn" data-open-settings>Open settings</button></p>` : ""
    }</div>`;
  }
  view().focus({ preventScroll: true });
}

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  route();
});

// ------------------------------------------------------------------ list

async function loadClaims() {
  const page = await chain.read("list_claims", [0, 30]);
  return Promise.all(page.items.map((s) => chain.read("get_claim", [s.id])));
}

async function renderList() {
  view().innerHTML = `
    <section class="hero">
      <h1>Say how you could be wrong.</h1>
      <p>Post a claim together with the observations that would refute it. Validators reject any condition you could wriggle out of. Then anyone can try to break the claim with a public source, and one verified refutation brings it down.</p>
      <div class="hero-legend" aria-hidden="true">
        <span>${swan("white", "")} untested condition</span>
        <span>${swan("partial", "")} related evidence</span>
        <span>${swan("met", "")} refuted</span>
      </div>
    </section>
    <section aria-labelledby="claims-h">
      <div class="list-head">
        <h2 id="claims-h">Claims</h2>
        <div class="seg" role="group" aria-label="Filter claims">
          ${["ALL", "OPEN", "FALSIFIED", "SURVIVED", "OTHER"].map((f) => `<button data-filter="${f}" aria-pressed="${f === filter}">${{ ALL: "All", OPEN: "Open", FALSIFIED: "Falsified", SURVIVED: "Survived", OTHER: "Drafts and rejected" }[f]}</button>`).join("")}
        </div>
      </div>
      <div id="claim-list" class="claim-list"><p class="muted">Loading claims…</p></div>
    </section>`;
  const claims = await loadClaims();
  const shown = claims.filter((c) => filter === "ALL" || c.status === filter || (filter === "OTHER" && !["OPEN", "FALSIFIED", "SURVIVED"].includes(c.status)));
  $("#claim-list").innerHTML = shown.length
    ? `<ul>${shown.map(row).join("")}</ul>`
    : `<div class="empty"><p>${claims.length ? "No claims match this filter." : "No claims yet. Be the first to say how you could be wrong."}</p><a class="btn btn-primary" href="#/new">Post a claim</a></div>`;
}

function row(c) {
  return `<li>
    <a class="claim-row" href="#/claim/${c.id}">
      ${swans(c)}
      <span class="row-main">
        <span class="row-title">${esc(c.title)}</span>
        <span class="row-statement">${esc(c.statement)}</span>
      </span>
      <span class="row-meta">
        ${statusTag(c.status)}
        <span>${esc(timing(c))}</span>
        <span>${fmt(c.bounty)} bounty</span>
        <span>${c.challenges.length} challenge${c.challenges.length === 1 ? "" : "s"}</span>
      </span>
    </a>
  </li>`;
}

// ------------------------------------------------------------------ claim detail

async function renderClaim(id) {
  view().innerHTML = `<p class="muted">Loading claim…</p>`;
  const c = await chain.read("get_claim", [id]);
  const me = chain.account;
  const mine = c.claimant === me;
  const states = swanStates(c);
  const lastAudit = c.audits[c.audits.length - 1];
  const now = chain.now();

  view().innerHTML = `
    <a class="back" href="#/">All claims</a>
    <article class="claim">
      <header class="claim-head">
        <div class="claim-status">${statusTag(c.status)}<span class="muted">${esc(STATUS[c.status].hint)}</span></div>
        <h1>${esc(c.title)}</h1>
        <blockquote class="statement">${esc(c.statement)}</blockquote>
        <dl class="facts">
          <div><dt>Claimant</dt><dd>${esc(who(c.claimant))}</dd></div>
          <div><dt>Bounty</dt><dd>${fmt(c.bounty)} <span class="muted">(recorded only)</span></dd></div>
          <div><dt>${c.status === "OPEN" ? "Deadline" : "Deadline length"}</dt><dd>${c.status === "OPEN" ? `${formatDate(c.deadline)} <span class="muted">(${esc(timeLeft(c.deadline, now))})</span>` : `${c.deadline_days} days`}</dd></div>
          ${c.winner ? `<div><dt>Refuted by</dt><dd>${esc(who(c.winner))}</dd></div>` : ""}
        </dl>
      </header>

      <section class="block" aria-labelledby="cond-h">
        <h2 id="cond-h">Refutation conditions</h2>
        <p class="muted">The claimant agreed in advance that any one of these, documented on a public page, shows the claim is false.</p>
        <ol class="conditions">
          ${c.conditions.map((cond, i) => {
            const audit = lastAudit?.rows?.[i];
            const flags = audit && !audit.passed ? FLAGS.filter((f) => audit[f]) : [];
            return `<li class="condition cond-${states[i]}">
              ${swan(states[i], SWAN_LABEL[states[i]])}
              <div>
                <p>${esc(cond)}</p>
                ${flags.length ? `<ul class="flags">${flags.map((f) => `<li>${esc(FLAG_TEXT[f])}</li>`).join("")}</ul>` : ""}
                ${states[i] === "met" ? `<p class="refuted-note">Refuted by challenge ${c.falsified_by + 1}.</p>` : ""}
              </div>
            </li>`;
          }).join("")}
        </ol>
      </section>

      <section class="block action" aria-labelledby="act-h">${actionPanel(c, mine, now)}</section>

      <section class="block" aria-labelledby="ch-h">
        <h2 id="ch-h">Challenges</h2>
        ${c.challenges.length ? `<ol class="challenges" reversed>${c.challenges.slice().reverse().map((ch) => challengeItem(c, ch)).join("")}</ol>` : `<p class="muted">${c.status === "OPEN" ? "No one has challenged this claim yet." : "This claim was never challenged."}</p>`}
      </section>

      ${c.audits.length ? `<section class="block" aria-labelledby="au-h">
        <h2 id="au-h">Audit history</h2>
        <ol class="audits">${c.audits.map((a) => `<li>
          <p><strong>Attempt ${a.attempt}:</strong> ${a.passed ? "all conditions passed" : `${a.rows.filter((r) => !r.passed).length} of ${a.rows.length} conditions failed`}</p>
          <ul>${a.conditions.map((cond, i) => `<li class="${a.rows[i].passed ? "ok" : "bad"}"><span class="sr-only">${a.rows[i].passed ? "Passed" : "Failed"}: </span>${esc(cond)}${!a.rows[i].passed ? ` <span class="muted">(${FLAGS.filter((f) => a.rows[i][f]).map((f) => f.replace("_", " ").toLowerCase()).join(", ")})</span>` : ""}</li>`).join("")}</ul>
        </li>`).join("")}</ol>
      </section>` : ""}
    </article>`;

  bindClaimActions(c);
}

const VERDICT = {
  FALSIFIES: { text: "Refutes the claim", cls: "met" },
  DOES_NOT_FALSIFY: { text: "Does not refute it", cls: "white" },
  UNREACHABLE: { text: "Page could not be read", cls: "none" },
};

const ROW_TEXT = { MET: "Met", PARTIAL: "Partly related", NOT_MET: "Not met" };

function challengeItem(c, ch) {
  const v = VERDICT[ch.verdict];
  return `<li class="challenge">
    <div class="challenge-head">
      <span class="verdict verdict-${v.cls}">${esc(v.text)}</span>
      <a href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer nofollow" class="src">${esc(ch.url.replace(/^https:\/\//, ""))}</a>
      <span class="muted">by ${esc(who(ch.challenger))}, ${formatDate(ch.at)}</span>
    </div>
    ${ch.rows?.length ? `<table class="matrix"><caption class="sr-only">Evidence per condition</caption>
      <thead><tr><th scope="col">Condition</th><th scope="col">Finding</th><th scope="col">Passage on the page</th></tr></thead>
      <tbody>${ch.rows.map((r, i) => `<tr class="r-${r.status.toLowerCase()}"><th scope="row">${i + 1}</th><td>${esc(ROW_TEXT[r.status])}</td><td>${r.quote ? `<q>${esc(r.quote)}</q>` : `<span class="muted">none</span>`}</td></tr>`).join("")}</tbody>
    </table>` : `<p class="muted">Validators could not read enough text on this page, so no finding was recorded.</p>`}
  </li>`;
}

function actionPanel(c, mine, now) {
  if (c.status === "OPEN" && now >= c.deadline) {
    return `<h2 id="act-h">The deadline has passed</h2>
      <p>No source refuted this claim in time. Anyone can now record that it survived.</p>
      <button class="btn btn-primary" data-act="close">Close claim as survived</button>`;
  }
  if (c.status === "OPEN" && mine) {
    return `<h2 id="act-h">Your claim is open</h2>
      <p>You cannot challenge your own claim or withdraw it. It stands until ${formatDate(c.deadline)}, unless a source verifies one of your conditions first.</p>`;
  }
  if (c.status === "OPEN") {
    const used = c.challenges.filter((x) => x.challenger === chain.account).length;
    const left = LIMITS.maxChallengesPerAddress - used;
    if (left <= 0) return `<h2 id="act-h">Challenge</h2><p>You have used all ${LIMITS.maxChallengesPerAddress} of your challenges on this claim.</p>`;
    return `<h2 id="act-h">Challenge this claim</h2>
      <p>Paste a public page that documents one of the conditions above. Validators read it independently, and a finding only counts if they can quote it from the page word for word.</p>
      <form id="challenge-form" class="inline-form" novalidate>
        <label for="url">Source page</label>
        <div class="input-row">
          <input id="url" name="url" type="url" inputmode="url" placeholder="https://" required autocomplete="off">
          <button class="btn btn-primary" type="submit">Submit challenge</button>
        </div>
        <p class="field-msg" id="url-msg" aria-live="polite"></p>
        <p class="muted">${left} of ${LIMITS.maxChallengesPerAddress} challenges left for you on this claim.</p>
      </form>
      ${DEMO ? `<div class="samples"><p>The simulated chain can only open these sample pages:</p><ul>${demoMod.SAMPLE_SOURCES.map((s) => `<li><button type="button" class="link" data-sample="${esc(s.url)}">${esc(s.title)}</button></li>`).join("")}</ul></div>` : ""}`;
  }
  if (c.status === "DRAFT" && mine) {
    const left = LIMITS.maxAuditAttempts - c.audits.length;
    return `<h2 id="act-h">Revise your conditions</h2>
      <p>The audit flagged at least one condition. Fix what is flagged above and resubmit. You have ${left} attempt${left === 1 ? "" : "s"} left; after that the claim is marked unfalsifiable for good.</p>
      <form id="revise-form" novalidate>
        <label for="rev">Refutation conditions, one per line</label>
        <textarea id="rev" rows="5">${esc(c.conditions.join("\n"))}</textarea>
        <ul class="field-msg" id="rev-msg" aria-live="polite"></ul>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">Resubmit for audit</button>
          <button class="btn" type="button" data-act="withdraw">Withdraw claim</button>
        </div>
      </form>`;
  }
  if (c.status === "DRAFT") return `<h2 id="act-h">Waiting on the claimant</h2><p>This claim is not listed until its conditions pass the audit.</p>`;
  if (c.status === "FALSIFIED") {
    const ch = c.challenges[c.falsified_by];
    const you = c.winner === chain.account;
    return `<h2 id="act-h">Refuted</h2><p>${you ? "You" : esc(who(c.winner))} showed that condition ${ch.condition + 1} happened, so the claim is false by its own terms. The bounty of ${fmt(c.bounty)} is recorded to ${you ? "you" : "them"}.</p>`;
  }
  if (c.status === "SURVIVED") return `<h2 id="act-h">Survived</h2><p>${c.challenges.length} challenge${c.challenges.length === 1 ? "" : "s"}, none verified. Surviving is not proof; it means no one found a refutation in time.</p>`;
  if (c.status === "UNFALSIFIABLE") return `<h2 id="act-h">Rejected as unfalsifiable</h2><p>Three audits found conditions that were vague, uncheckable, beside the point, or left the claimant room to decide. The claim stays on the record but was never listed.</p>`;
  return `<h2 id="act-h">Withdrawn</h2><p>The claimant withdrew this draft before it was listed.</p>`;
}

function bindClaimActions(c) {
  const id = c.id;
  const cf = $("#challenge-form");
  if (cf) {
    cf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#url-msg");
      let url;
      try {
        url = normalizeUrl($("#url").value);
      } catch (err) {
        msg.textContent = err.message;
        $("#url").setAttribute("aria-invalid", "true");
        return;
      }
      if (c.challenges.some((x) => x.url === url)) {
        msg.textContent = "This source has already been checked against this claim.";
        return;
      }
      msg.textContent = "";
      $("#url").removeAttribute("aria-invalid");
      await send(`Challenge “${c.title}”`, "challenge", [id, url], id);
    });
    document.querySelectorAll("[data-sample]").forEach((b) => b.addEventListener("click", () => {
      $("#url").value = b.dataset.sample;
      $("#url").focus();
    }));
  }
  const rf = $("#revise-form");
  if (rf) {
    rf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const conds = splitConditions($("#rev").value);
      const errs = checkConditions(conds);
      $("#rev-msg").innerHTML = errs.map((x) => `<li>${esc(x)}</li>`).join("");
      if (errs.length) return;
      await send(`Revise “${c.title}”`, "revise_conditions", [id, conds], id);
    });
  }
  document.querySelector('[data-act="withdraw"]')?.addEventListener("click", () => {
    if (confirm("Withdraw this claim? It will stay on the record as withdrawn.")) send(`Withdraw “${c.title}”`, "withdraw", [id], id);
  });
  document.querySelector('[data-act="close"]')?.addEventListener("click", () => send(`Close “${c.title}”`, "close_claim", [id], id));
}

// ------------------------------------------------------------------ new claim

const DRAFT_KEY = "popper.draft";

function renderNew() {
  let d = {};
  try {
    d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}");
  } catch {
    /* ignore */
  }
  view().innerHTML = `
    <a class="back" href="#/">All claims</a>
    <div class="compose">
      <form id="claim-form" class="claim-form" novalidate>
        <h1>Post a claim</h1>
        <p class="lede">State the claim, then commit in advance to what would prove it false. The claim is listed only if every condition passes the audit.</p>

        <label for="title">Short title</label>
        <input id="title" maxlength="${LIMITS.title[1]}" value="${esc(d.title)}" placeholder="Port Avery ferry keeps its winter timetable">

        <label for="statement">The claim</label>
        <textarea id="statement" class="serif" rows="3" maxlength="${LIMITS.statement[1]}" placeholder="The Port Avery ferry runs every scheduled crossing on its winter timetable through 31 December 2026.">${esc(d.statement)}</textarea>

        <label for="conds">Refutation conditions, one per line</label>
        <p class="hint" id="conds-hint">Two to four. Each should describe something a public page could document, specific enough that two strangers would agree whether it happened.</p>
        <textarea id="conds" rows="6" aria-describedby="conds-hint" placeholder="A Port Avery harbour notice reports the ferry suspended for at least one full day before 31 December 2026.">${esc(d.conds)}</textarea>
        <ul id="cond-live" class="cond-live" aria-live="polite"></ul>

        <div class="two">
          <div>
            <label for="bounty">Bounty</label>
            <input id="bounty" inputmode="numeric" value="${esc(d.bounty ?? "500")}">
            <p class="hint">Recorded for the winner. No funds are held.</p>
          </div>
          <div>
            <label for="days">Open for (days)</label>
            <input id="days" inputmode="numeric" value="${esc(d.days ?? "60")}">
            <p class="hint">${LIMITS.deadlineDays[0]} to ${LIMITS.deadlineDays[1]}. Counted from when it opens.</p>
          </div>
        </div>
        <ul id="form-errs" class="form-errs" aria-live="polite"></ul>
        <button class="btn btn-primary btn-big" type="submit">Post claim</button>
      </form>

      <aside class="guide" aria-label="What makes a good condition">
        <h2>What the audit rejects</h2>
        <dl>
          <dt>Vague</dt><dd><s>The ferry service gets noticeably worse.</s><br>Name a figure, date, body or event instead.</dd>
          <dt>Unobservable</dt><dd><s>Passengers privately lose faith in the ferry.</s><br>It has to be something a public page can report.</dd>
          <dt>Irrelevant</dt><dd><s>The ferry company changes its logo.</s><br>If it happened, the claim must be false.</dd>
          <dt>Escape hatch</dt><dd><s>A cancellation notice, unless I think it was justified.</s><br>You don't get to decide afterwards.</dd>
        </dl>
        <p class="muted">Three failed audits mark the claim unfalsifiable on the public record.</p>
      </aside>
    </div>`;

  const form = $("#claim-form");
  const read = () => ({
    title: $("#title").value, statement: $("#statement").value, conds: $("#conds").value,
    bounty: $("#bounty").value.trim(), days: $("#days").value.trim(),
  });
  const live = () => {
    const v = read();
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
    const conds = splitConditions(v.conds);
    $("#cond-live").innerHTML = conds.map((c, i) => {
      const hits = escapeHatchHits(c);
      const len = c.length < LIMITS.condition[0] ? `too short (${c.length}/${LIMITS.condition[0]})` : c.length > LIMITS.condition[1] ? "too long" : "";
      const note = hits.length ? `contains "${hits[0]}", an escape hatch` : len;
      return `<li class="${note ? "warn" : ""}">${swan("white", "")}<span>Condition ${i + 1}${note ? `: ${esc(note)}` : ""}</span></li>`;
    }).join("");
  };
  form.addEventListener("input", live);
  live();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = read();
    const conditions = splitConditions(v.conds);
    const errs = checkClaim({ title: v.title, statement: v.statement, conditions, bounty: v.bounty, deadlineDays: v.days });
    $("#form-errs").innerHTML = errs.map((x) => `<li>${esc(x)}</li>`).join("");
    if (errs.length) return $("#form-errs").scrollIntoView({ block: "center" });
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await send("Post claim", "post_claim", [v.title.trim(), v.statement.trim(), conditions, Number(v.bounty), Number(v.days)], null);
      sessionStorage.removeItem(DRAFT_KEY);
    } finally {
      btn.disabled = false;
    }
  });
}

// ------------------------------------------------------------------ transactions + tray

const tracker = createTracker(renderTray);

async function send(label, fn, args, claimId) {
  const acct = chain.account;
  try {
    const tx = await tracker.run(label, chain, fn, args);
    let target = claimId;
    if (target === null) {
      // Find the claim this account just posted.
      const page = await chain.read("list_claims", [0, 10]);
      target = page.items.find((s) => s.claimant === acct)?.id ?? null;
    }
    tx.claimId = target;
    renderTray(tracker.list());
    if (target !== null) {
      if (location.hash === `#/claim/${target}`) await route();
      else location.hash = `#/claim/${target}`;
    }
  } catch {
    /* shown in the tray */
  }
}

const STATE_TEXT = { signing: "Waiting for signature", pending: "In consensus", accepted: "Accepted", finalized: "Finalized", failed: "Not recorded" };

function renderTray(txs) {
  const tray = $("#tray");
  tray.hidden = txs.length === 0;
  tray.innerHTML = `<h2 class="sr-only">Transactions</h2>${txs.slice(0, 4).map((t) => `
    <section class="tx tx-${t.state}" aria-live="polite">
      <header>
        <strong>${esc(t.label)}</strong>
        <span class="tx-state">${esc(STATE_TEXT[t.state])}</span>
        ${t.state === "failed" || t.state === "accepted" || t.state === "finalized" ? `<button class="x" data-dismiss="${t.id}" aria-label="Dismiss ${esc(t.label)}">×</button>` : ""}
      </header>
      <ol>${t.stages.map((s, i) => `<li class="${i === t.stages.length - 1 && t.state === "pending" ? "now" : ""} ${s.key === "failed" ? "fail" : ""}">${esc(s.text)}</li>`).join("")}</ol>
      ${t.hash ? `<p class="tx-hash">${chain.explorerTx(t.hash) ? `<a href="${esc(chain.explorerTx(t.hash))}" target="_blank" rel="noopener">${esc(shortAddr(t.hash))}</a>` : esc(shortAddr(t.hash))}${t.claimId != null ? ` <a class="tx-view" href="#/claim/${t.claimId}">View claim</a>` : ""}</p>` : ""}
    </section>`).join("")}`;
  tray.querySelectorAll("[data-dismiss]").forEach((b) => b.addEventListener("click", () => tracker.dismiss(Number(b.dataset.dismiss))));
}

// ------------------------------------------------------------------ settings dialog

function openSettings() {
  const dlg = $("#settings");
  const body = $("#settings-body");
  if (DEMO) {
    body.innerHTML = `
      <p>This build runs on a simulated chain in your browser. Its validators are simple keyword checks, not language models.</p>
      <fieldset><legend>Act as</legend>
        ${demoMod.DEMO_ACCOUNTS.map((a, i) => `<label class="radio"><input type="radio" name="acct" value="${i}" ${i === settings.demoAccount ? "checked" : ""}> ${esc(a.name)} <span class="muted">${shortAddr(a.address)}</span></label>`).join("")}
      </fieldset>
      <div class="btn-row">
        <button class="btn" type="button" data-demo="skip">Skip ahead 30 days</button>
        <button class="btn" type="button" data-demo="reset">Reset demo data</button>
      </div>`;
    body.querySelectorAll("[name=acct]").forEach((r) => r.addEventListener("change", async () => {
      settings.demoAccount = Number(r.value);
      saveSettings(settings);
      await connect();
      route();
    }));
    body.querySelector('[data-demo="skip"]').addEventListener("click", () => {
      chain.skipDays(30);
      route();
    });
    body.querySelector('[data-demo="reset"]').addEventListener("click", () => {
      chain.reset();
      dlg.close();
      location.hash = "#/";
      route();
    });
  } else {
    body.innerHTML = `
      <label for="s-net">Network</label>
      <select id="s-net">${Object.entries(liveMod.NETWORKS).map(([k, v]) => `<option value="${k}" ${k === settings.network ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
      <label for="s-addr">Contract address</label>
      <input id="s-addr" value="${esc(settings.contract)}" placeholder="0x…" spellcheck="false">
      <p class="hint">Your account: <code>${esc(chain.account)}</code>. Its key is kept in this browser only.</p>
      <details><summary>Use another account</summary>
        <label for="s-key">Private key</label>
        <input id="s-key" type="password" placeholder="0x + 64 hex characters" autocomplete="off" spellcheck="false">
        <p class="field-msg" id="s-key-msg" aria-live="polite"></p>
        <button class="btn" type="button" id="s-import">Import key</button>
      </details>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="s-save">Save settings</button></div>`;
    $("#s-save").addEventListener("click", async () => {
      settings.network = $("#s-net").value;
      settings.contract = $("#s-addr").value.trim();
      saveSettings(settings);
      await connect();
      dlg.close();
      route();
    });
    $("#s-import").addEventListener("click", async () => {
      try {
        liveMod.importKey($("#s-key").value);
        await connect();
        dlg.close();
        route();
      } catch (e) {
        $("#s-key-msg").textContent = e.message;
      }
    });
  }
  dlg.showModal();
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-settings]")) openSettings();
  const f = e.target.closest("[data-filter]");
  if (f) {
    filter = f.dataset.filter;
    renderList();
  }
});

$("#settings-close").addEventListener("click", () => $("#settings").close());

// ------------------------------------------------------------------ boot

connect().then(route).catch((err) => {
  view().innerHTML = `<div class="notice notice-error"><p>${esc(readableError(err))}</p></div>`;
});
