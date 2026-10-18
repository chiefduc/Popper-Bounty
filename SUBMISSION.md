# Popper Bounty: Project Explorer submission

Copy each block into the matching form field. Character counts are checked by `python3 check_limits.py`.

## Logo
`assets/logo.png` (512x512 PNG, under 2MB). Source: `assets/logo.svg`.

## Project name
Popper Bounty

## Tags
Primary: **Evidence Assessment**. Tag 1: **Dispute Resolution**. Tag 2: **Escrow Claims** (bounties are recorded for accounting only; no funds are held, and the docs say so). If a forecasting or prediction tag exists, prefer it for Tag 2.

## One-liner (max 180)
Post a claim with the evidence that would prove it wrong. Validators reject conditions you could dodge, then judge challengers' sources. One verified refutation and it falls.

## Description (max 1000)
Anyone can make a claim; few say what would prove them wrong. Popper Bounty makes that the price of entry. A claimant posts a claim with two to four refutation conditions: observations that, if a public page documents them, show the claim is false. Validators audit each condition for being vague, uncheckable, irrelevant, or an escape hatch the claimant could use to dodge. The claim is listed only when every condition is clean; three failed audits mark it unfalsifiable. A listed claim cannot be withdrawn. Anyone else can challenge it with a URL. Validators fetch the page, judge each condition and must quote it; a finding counts only if the quote is found verbatim on the page. Code, not the model, decides: one verified condition falsifies the claim and records the challenger as winner. Unrefuted by the deadline, it survives. Other contracts can read outcomes. Bounties are recorded only; no funds are held.

## Demo URL (optional)
TODO: paste your YouTube or X link after recording (script below).

## The exact path (steps)
1. **Open the app.** Open the website. Open the settings (top right) and confirm the network and contract address. The Claims list shows each claim with one swan per refutation condition.
2. **Post a claim.** Click "Post a claim". Enter a title, the claim, two to four refutation conditions (one per line), a bounty and a number of days. Click "Post claim" and approve the signature.
3. **Read the audit.** Watch the transaction tray reach accepted. The claim opens with status "Open", or stays "Draft" with each flagged condition explained. Revise and click "Resubmit for audit".
4. **Challenge as someone else.** Switch account (settings, "Use another account", or a second browser). Open the claim, paste a public page that documents one condition, click "Submit challenge" and approve.
5. **Read the verdict.** The Challenges section shows Met, Partly related or Not met per condition, with the exact passage quoted from the page.
6. **See the outcome.** A verified condition marks the claim "Falsified" and its swan turns black. After the deadline, "Close claim as survived" records it as "Survived".

## Expected verification outcome (max 500)
A new claim appears with status Open, or Draft with per-condition audit feedback (three failed audits give Unfalsifiable). A challenge whose page states a condition shows Refutes the claim with the quoted passage, and the claim becomes Falsified with the challenger as winner. An unrelated page shows Does not refute it and the claim stays Open. A page that cannot be read shows Page could not be read.

## Contract links (optional)
TODO: after deploying, paste the explorer address URL for the PopperBounty contract.

## Website (required)
TODO: GitHub Pages URL from `.github/workflows/pages.yml` (e.g. https://<user>.github.io/popper-bounty/). Set repo variable `VITE_CONTRACT_ADDRESS` first. The simulated-chain demo is published alongside it at `/demo/`.

## GitHub / Evidence
TODO: repository URL. The repo root contains contracts/, tests/, frontend/ and docs/INTEGRATION.md.

## Demo video script (about 90 seconds)
1. Problem (10s): pundits make claims that can never be wrong. Show a vague claim.
2. Audit (25s): post "Remote work makes people less happy", show it held as Draft with "too vague" and "not checkable" on each condition. Then post the ferry claim with concrete conditions and show it Open.
3. Challenge (30s): switch account, submit a page that states one condition, narrate the tray, show the quoted passage and the swan turning black.
4. Failure (10s): a page that does not state any condition, shown as Does not refute it.
5. Close (15s): outcomes are readable by any contract through get_status.

## Draft post
Most claims are built so they can never be wrong. Popper Bounty on @GenLayer makes you say what would refute yours before it's listed. Validators reject conditions you could dodge, then judge challengers' sources, and a refutation only counts if they can quote it from the page. <site> <repo>

## Honest status
Not yet run on a live GenLayer network. Contract logic is unit tested (110 Python test cases with a GenVM stand-in that runs leader and validator separately, plus shared Python/JS parity vectors); 18 JS tests cover the transaction lifecycle, form checks and demo chain. The demo build uses a simulated chain with fake keyword validators and says so on screen. Bounties are notional. Deploy to Studio, set the address, and verify before submitting.
