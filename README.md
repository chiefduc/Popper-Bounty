# Popper Bounty

An Intelligent Contract on GenLayer for claims that must say, in advance, how they could be wrong.

A claimant posts a claim with two to four **refutation conditions**: concrete observations that, if a public page documents them, show the claim is false. Validators audit the conditions before the claim is listed, rejecting any that are vague, uncheckable, beside the point, or that leave the claimant room to decide afterwards. Once listed, the claim cannot be withdrawn. Anyone else can challenge it with a URL; validators fetch the page, judge each condition, and a finding only counts if they can quote it from the page word for word. One verified refutation falsifies the claim. If the deadline passes unrefuted, the claim is recorded as survived.

Bounty amounts are recorded for accounting only. **No funds are held.**

## Why this needs GenLayer

Deciding whether a condition is "concrete enough" or whether a news page "documents" an event is judgment, not arithmetic. A normal smart contract cannot make it, and a single model call is neither neutral nor reproducible. GenLayer validators each make the judgment independently on live data and must agree before anything is written.

## Repository layout

```
contracts/popper_bounty.py   the Intelligent Contract (single file)
tests/                       pytest suite with a GenVM stand-in, plus shared parity vectors
frontend/                    Vite + genlayer-js web app (live and simulated-chain builds)
docs/INTEGRATION.md          how other contracts and apps read results
assets/logo.svg, logo.png    project logo (512x512)
.github/workflows/pages.yml  builds and publishes the frontend to GitHub Pages
SUBMISSION.md                Project Explorer form text
```

## Lifecycle

```
post_claim ──audit──► OPEN ──challenge (verified MET)──► FALSIFIED
     │                  │
     │                  └──deadline passes, close_claim──► SURVIVED
     ▼
   DRAFT ──revise_conditions──► (re-audit; 3rd failure) ──► UNFALSIFIABLE
     │
     └──withdraw──► WITHDRAWN        (only drafts can be withdrawn)
```

## Contract interface

| Method | Kind | Purpose |
|---|---|---|
| `post_claim(title, statement, conditions, bounty, deadline_days)` | write | Create a claim and run the audit. Returns the id. |
| `revise_conditions(claim_id, conditions)` | write | Claimant only, drafts only. Re-runs the audit. |
| `withdraw(claim_id)` | write | Claimant only, drafts only. |
| `challenge(claim_id, url)` | write | Anyone but the claimant, open claims before the deadline. Returns `FALSIFIES`, `DOES_NOT_FALSIFY` or `UNREACHABLE`. |
| `close_claim(claim_id)` | write | Anyone, after the deadline. Marks the claim `SURVIVED`. |
| `get_claim(claim_id)` | view | Full record as JSON: conditions, audit history, challenges with per-condition evidence. |
| `list_claims(offset, limit)` | view | Newest first, summaries. |
| `get_status(claim_id)` | view | Compact record for other contracts (see docs/INTEGRATION.md). |
| `get_limits()` | view | Current limits. |

## How consensus works

Both nondeterministic steps use `gl.vm.run_nondet_unsafe` with custom leader and validator functions. The validator does not compare text; it reruns the whole judgment on its own and compares structured outcomes.

**Audit.** The model returns four booleans per condition (`VAGUE`, `UNOBSERVABLE`, `IRRELEVANT`, `ESCAPE_HATCH`). Code adds deterministic flags first: phrases such as "unless I", "in my opinion" or "at my discretion" always set `ESCAPE_HATCH`, and if every condition is already flagged in code, no model is called. Validators must agree on whether the audit passed, and may differ on at most `n // 3` individual conditions.

**Challenge.** Each validator fetches the page itself, truncates it, and asks for `MET` / `PARTIAL` / `NOT_MET` per condition with a verbatim quote. Code normalizes quotes, dashes, case and whitespace and checks that the quote is really on the page; a `MET` without a found quote becomes `PARTIAL`. The verdict is computed in code: any verified `MET` falsifies. Validators must agree on the verdict, the leader's verdict must follow from its own rows (no forged verdicts), and per-condition findings may differ on at most `n // 3` conditions. A leader that could not fetch the page is accepted only if the validator also cannot, so a flaky fetch cannot write a permanent "unreachable". A page whose text changes between the leader's and validator's reads (so the quote is missing for one of them) ends `UNDETERMINED` instead of falsifying.

**Fail-closed parsing.** Anything that is not exactly the expected JSON shape counts as "every flag set" in the audit and "not met" in a challenge. Malformed or injected output can never open a claim or falsify one. Claim text, conditions and page text are fenced and labelled as data in the prompts.

## Limits

2-4 conditions of 20-300 characters, no duplicates; claims 20-400 characters; deadline 1-365 days from opening; 3 audit attempts; 3 challenges per address per claim; 20 challenges per claim; each URL checked once per claim; public `https` URLs only (no localhost, private ranges, credentials or ports).

## Running it

```bash
# contract tests
pip install pytest
python3 -m pytest -q tests

# frontend
cd frontend
npm install
npm test                 # lifecycle, form checks, demo chain, Python parity
npm run dev:demo         # simulated chain, no network needed
cp .env.example .env.local && npm run dev   # live, after deploying
```

The demo build runs entirely in the browser with keyword-based fake validators and four seeded claims. It says so in a banner on every page. Settings let you switch between three demo accounts and skip ahead 30 days to test deadlines. Its "sample sources" show each outcome: a page that refutes the open claim, a related page that does not, and a page that changes between reads (`UNDETERMINED`).

## Deploying

1. Open GenLayer Studio, paste `contracts/popper_bounty.py`, deploy (no constructor arguments).
2. Run one `post_claim` with clean conditions and one `challenge` from a second account to confirm the flow.
3. Put the address in the repository variable `VITE_CONTRACT_ADDRESS` (and optionally `VITE_NETWORK`), enable GitHub Pages with "GitHub Actions" as the source, and push. The workflow tests, builds and publishes the frontend.

## What has not been verified

This has **not yet run on a live GenLayer network**. The contract is written against the current Python SDK as best understood, with the SDK-touching calls isolated in small wrappers near the top of the file so differences are easy to fix:

- `gl.nondet.web.render(url, mode="text")` and `gl.nondet.exec_prompt(prompt)`, falling back to the older `gl.get_webpage` / `gl.exec_prompt`.
- `gl.vm.run_nondet_unsafe(leader, validator)`, with the validator reading the leader's value from `result.calldata`.
- Chain time from `gl.message_raw["datetime"]` (ISO string). If your SDK exposes time differently, change `_now()`.
- `gl.vm.UserError` for user-facing errors (falls back to `gl.UserError`, then `Exception`).
- The `Depends` header uses `py-genlayer:test`.

Model behaviour on real pages (how often it quotes exactly) is untested; the quote check is deliberately strict, so the likely failure mode is challenges that should succeed being recorded as `PARTIAL`, not false refutations.

## Roadmap

Refundable stake on posting (anti-spam) and real bounty escrow; an appeal round for disputed challenges; Internet Archive snapshot dates so a source must be dated inside the claim's window; claim templates for common forecast types.
