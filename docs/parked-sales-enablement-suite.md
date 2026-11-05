# Parked: the Sales Enablement suite

**Status: parked, not cancelled (2026-11-04).**

Before the site's purpose changed (see `docs/adr/0001`), the plan was five Sales Enablement
pieces built to prove competence to a hiring manager: a live Battle Card Generator, a Call
Coach, an Objection Role-Play agent on ElevenLabs, an Onboarding Copilot over a synthetic
product KB, and an Enablement Analytics Dashboard. The suite read as
create → coach → practice → onboard → measure.

These remain interesting things to build. What changed is their framing: they are no longer
audition pieces for a job, they are Projects like any other, and if several get built they
would form a *Sales Enablement* Theme — a third Section of the Shelf.

Design work already done and worth keeping:

- **Battle Card Generator**: two companies in ("your company" + a competitor), a comparative
  card out, so the input is just an argument and no fictional-company data anchor is needed.
  Ships with a preloaded example. Takes URLs so there is a real page to fetch. Fetches both
  companies' public pages server-side, grounds the output in that content, shows sourcing,
  and frames the result as "AI draft — verify before use."
- **Open:** sales methodology (MEDDPICC or an alternative) was deferred to the Call Coach build.

Note that anything live here needs a server-side proxy for the API key, which conflicts with
the static-on-GitHub-Pages decision in `docs/adr/0002`. That conflict gets resolved if and
when one of these is actually built.

---

## Verbatim, from the superseded CONTEXT.md

Preserved because the old `CONTEXT.md` was never committed and is not recoverable from git.
This is the old positioning, kept for history. It is **not** current direction.

**Sales Enablement portfolio piece** — A published artifact whose job is to prove to a
*hiring manager for a Sales Enablement role* that Evan can (a) run an enablement
program/tooling and (b) solve a tough problem with AI he built. Success = "I want to
interview this person," not "I want to buy this." Canonical shape: tough enablement
problem → AI system Evan built to solve it → realistic content artifacts it produces →
outcome. The content artifact is the *evidence layer*, not the deliverable.

**Target role** — Run the enablement program/tooling: the strategic and ops flavour of
Sales Enablement, owning the function rather than producing content.

**Sourcing / credibility model** — Evan is a marketing operator at WBM (hardware/MSP
reseller) targeting SaaS Sales Enablement roles, and lacks the SaaS raw material (call
recordings, mature battle cards, playbooks). So pieces are working AI tools built by Evan
on synthetic or public data, never sanitized WBM work — WBM is marketing, not SaaS
enablement, and publishing employer material while job-hunting is bad optics. **The gap is
the pitch:** "You don't have AI-powered enablement tooling yet? I already built one — here
it is, working."

**Format of a piece** — Per-project choice of **(B)** recorded interaction + real
downloadable outputs + code link (default), or **(A)** fully live in-page tool (for a
flagship). Live requires a serverless proxy for the API key; never ship keys to the browser.

**Anatomy of a piece** — Two layers, always: (1) the working AI tool (builder proof) and
(2) a tight strategic wrapper — the enablement problem, how Evan would deploy it across a
sales org, the adoption plan, and the metric it moves (ramp time, quota attainment, content
usage, win rate). The wrapper is scannable, a few hundred words, framing the tool rather
than burying it. This is what proves "can run a program," not just "can build."

**Data anchor** — No single mandated fictional company; decided per piece from (a) a
fictional SaaS company, (b) real companies scraped from their public websites, or (c)
sanitized WBM data. A shared world is a stronger narrative, but per-piece flexibility was
accepted.
