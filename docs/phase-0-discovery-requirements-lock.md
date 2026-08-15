# YaseeTech Business Cloud — Phase 0 Deliverables
### Discovery, Requirements Lock & Compliance Groundwork

**Status:** Draft for stakeholder sign-off — nothing here should be treated as final until the "Decision" fields are explicitly approved by the business owner(s).

---

## 0. Scope Question — Resolved

**Question:** Is a public-facing business directory/registry (searchable listings, verified badges, reviews) part of this product, or is Business Cloud strictly the private management dashboard?

**Decision (recommended default — confirm before Phase 1):** Business Cloud is **strictly the private management dashboard**. No public directory, listings, or reviews in v1 or v2.

**Rationale:**
- A public directory is a discovery/marketing product with a completely different data model (public read access, SEO, moderation, review abuse handling) bolted onto a system whose core design principle is *no data crosses tenant boundaries*. Mixing the two philosophies early creates lasting architectural tension.
- None of the "non-negotiable constraints" in the master spec (tenant isolation, offline POS, accounting immutability) touch a public directory — it's additive scope, not core scope.
- If a directory is wanted later, it is cleanly buildable as a **separate codebase/service** that reads *opt-in, explicitly published* fields from the core platform via an API — never a shared schema.

**Action required:** If leadership wants the directory in scope, say so explicitly and it gets logged as a Phase 12+ initiative (post-launch), scoped separately, with its own data model. It does **not** change anything in Phases 1–11 below either way, since the recommendation already isolates it out.

---

## 1. Stakeholder Requirements — v1 vs v2 Module Lock

### v1 (Launch scope)
| Module | Included | Notes |
|---|---|---|
| Central Dashboard | Yes | Business-owner overview: sales, stock, cash position |
| Point of Sale | Yes | Offline-first, split payments, receipt via print/SMS/WhatsApp |
| Inventory Management | Yes | Including bulk CSV/Excel import — treated as priority, not optional |
| Invoicing | Yes | Create/send, partial payments, overdue tracking, PDF |
| Accounting & Bookkeeping (basic) | Yes | Chart of accounts, auto journal entries, P&L, Balance Sheet, Cash Flow |
| CRM (basic) | Yes | Customer records, purchase history, simple segmentation |
| Multi-branch management | Yes | Required for Growth/Pro tiers to be sellable at launch |
| Subscription billing (Flutterwave) | Yes | Trial → paid → renewal → dunning lifecycle |

### v2 (Deferred — post-launch)
| Module | Deferred | Notes |
|---|---|---|
| AI Business Assistant | Yes | Natural-language querying, plain-language summaries |
| Fraud/shrinkage detection | Yes | Depends on 2–3 months of real POS data existing to detect "abnormal" patterns against |
| Advanced analytics / multi-branch consolidation reporting | Yes | Basic per-branch reporting ships in v1; roll-up analytics is v2 |
| Loyalty/points program | Yes | CRM ships with segmentation only in v1 |
| Public business directory | Deferred indefinitely | Per Section 0 — separate initiative, not on this roadmap |
| Hausa/Yoruba/Igbo localization | Yes | v1 ships with localization *scaffolding* only (string externalization), no translated UI |
| Paystack integration | Yes | Flutterwave only at launch; architecture stays provider-agnostic |

**Rationale for the cut line:** everything in v1 is required for a business to actually run its day-to-day operations and get paid for a subscription. Everything pushed to v2 is either (a) dependent on data the platform doesn't have yet, or (b) a differentiator that can wait without blocking a usable product.

**Decision needed:** Confirm this split, or flag specific items to move across the line, before Phase 1 architecture work starts — architecture decisions (e.g., whether AI assistant needs a vector store from day one) depend on knowing what's really deferred vs. what's "v2 in name only."

---

## 2. Regulatory & Compliance Checklist

⚠️ **This section identifies what must be confirmed and by whom — it is not itself legal or tax advice.** Every item marked "Confirm with counsel/accountant" must be signed off by a qualified Nigerian lawyer/accountant before the corresponding feature ships. Do not hardcode assumptions from this document into the codebase.

### 2.1 Nigeria Data Protection Act (NDPA) 2023
- [ ] **Lawful basis for processing** documented per data category (e.g., contract performance for transaction data, consent for marketing communications).
- [ ] **Data Protection Officer (DPO)** designated if the platform's processing volume/nature triggers the requirement — confirm threshold with counsel.
- [ ] **Data subject rights** implemented in product design: access, correction, deletion, portability, objection to processing. (Portability and deletion are already scoped in the master spec's Phase 11, item 7–8 — this checklist item confirms NDPA is the reason, not just good practice.)
- [ ] **Data residency**: confirm whether NDPA or sector-specific rules require Nigerian businesses' data to be hosted in-country or under specific cross-border transfer safeguards if using an international cloud provider. This directly affects the Phase 1 infrastructure choice — resolve before picking a cloud region.
- [ ] **Data breach notification process**: NDPA timelines for notifying the Nigeria Data Protection Commission (NDPC) and affected data subjects — confirm exact deadlines with counsel; do not estimate.
- [ ] **NDPC registration/filing** obligations for the platform as a data controller/processor — confirm whether YaseeTech itself needs to register, separate from each tenant business's own obligations.

### 2.2 CBN / Flutterwave Merchant Onboarding
- [ ] Confirm current **KYC document list** Flutterwave requires for sub-merchant/marketplace onboarding (typically: CAC registration or equivalent, valid ID of business owner, proof of address, bank account details) — get this from Flutterwave's current merchant/partner documentation directly, not assumed.
- [ ] Confirm whether YaseeTech is acting as a **payment facilitator/marketplace** (collecting on behalf of tenant businesses) vs. each tenant business having its **own direct Flutterwave sub-account** — this materially changes settlement flow, liability, and CBN licensing exposure. This decision must be made with Flutterwave's partnerships team and ideally a fintech-savvy lawyer before Phase 5 billing work starts.
- [ ] Confirm whether any CBN licensing (e.g., Payment Solution Service Provider category) applies to YaseeTech itself given the above choice.

### 2.3 Tax Computation (if accounting module computes VAT/PAYE)
- [ ] **Do not hardcode current VAT rate or PAYE bands into v1.** Build the tax-rate table as **configurable data**, not code constants, so a rate change (which has happened before in Nigeria) doesn't require a deployment.
- [ ] Confirm with a qualified accountant: current VAT rate and exemption categories relevant to SME retail; PAYE band structure if payroll is ever in scope (it currently isn't — not in v1 or v2 module list above, flagged here so it doesn't get added silently).
- [ ] Decide whether the accounting module *calculates* tax liability (higher liability, higher accuracy bar) or simply *tracks and reports* tax-relevant figures for the business's own accountant to file (lower liability, matches "basic Accounting" v1 scope better). **Recommendation: v1 ships as track-and-report only.** Automated tax filing/computation is a bigger liability surface and better suited to v2 after real accountant validation.

### 2.4 General Business/Consumer Protection
- [ ] Terms of Service and Privacy Policy drafted and reviewed by counsel before public trial signups open (not just before "launch" — the 14-day free trial is itself data processing that needs a lawful, disclosed basis).
- [ ] Refund/cancellation policy for subscriptions documented and consistent with the graceful-downgrade behavior specified in Phase 5.

---

## 3. Tenant Model — Decision

**Decision: Shared database, row-level isolation via `tenant_id` + PostgreSQL Row-Level Security (RLS) policies.**

This confirms the master spec's own recommendation. Documenting the reasoning here so it isn't re-litigated later:

| Model | Verdict | Why |
|---|---|---|
| Database-per-tenant | Rejected | At "thousands of tenants," this means thousands of DB connections/instances to provision, back up, migrate, and monitor individually. Operationally unsustainable for a ₦5,000–₦20,000/month price point. |
| Schema-per-tenant | Rejected | Better than database-per-tenant but still doesn't scale cleanly past low hundreds of tenants in Postgres — connection pooling and migration tooling both get harder as schema count grows. |
| Shared DB + `tenant_id` + RLS | **Chosen** | Scales to thousands of tenants on a manageable number of Postgres instances (with read replicas and eventual partitioning per Phase 2). RLS gives defense-in-depth: even a bug in application-layer filtering can't leak cross-tenant data, because the database itself refuses to return rows outside the caller's tenant context. |

**Implementation implications locked in from this decision (binding on Phase 1 & 2):**
- Every table holding business data carries a non-nullable `tenant_id`.
- RLS policies enforced at the database level — application-layer `WHERE tenant_id = ?` filtering is required too, but is *not* the sole control.
- Tenant context is resolved server-side from the authenticated session/JWT, injected via middleware — **never** trusted from a client-supplied parameter (URL, body, or header).
- Tenant-isolation regression tests (Phase 3, 7, 9) become a permanent CI gate from the first backend commit onward, not something added later.

---

## 4. Non-Functional Requirement Targets

| Metric | Target | Notes |
|---|---|---|
| API p95 response time | < 300ms | Under normal load, as specified |
| **Concurrency target (defined)** | **5,000 businesses × 3 avg concurrent active users = ~15,000 concurrent sessions** | Using the master spec's own example as the working number — see note below |
| Peak POS transaction throughput | To be derived, not assumed | See note below |
| Uptime SLA (Pro/Enterprise) | 99.9% | ≈ 8.7 hours downtime/year max |
| RPO (Recovery Point Objective) | ≤ 15 minutes | Max acceptable data loss in a disaster |
| RTO (Recovery Time Objective) | ≤ 4 hours | Max acceptable time to restore service |

**Note on peak POS transaction throughput — this cannot be responsibly invented, and I'm flagging that explicitly rather than filling in a plausible-sounding number:** it depends on real assumptions about basket size, business type mix (retail vs. services), and how POS traffic clusters during the day (lunch rush, weekend peaks, month-end). A defensible number needs at minimum:
- Average transactions/day per active business (varies hugely between a phone accessories kiosk and a small supermarket)
- % of the 5,000 businesses actively transacting at the same peak hour (not all 5,000 transact simultaneously — retail peaks cluster)
- A safety multiplier for launch-day/promotional spikes

**Recommendation:** treat 15,000 concurrent sessions as the working number for now (matches the spec's own example), but require the Phase 8 load-testing plan to include a short survey/estimate from the pilot cohort (the 10–20 Kaduna-area businesses mentioned in Phase 9) on their actual daily transaction volume, so the throughput number going into load testing is grounded in real SME behavior, not a guess. This is cheap to get and meaningfully de-risks Phase 8.

**Decision needed:** Sign off on the 15,000-session concurrency target as the Phase 1 design input, with the explicit caveat above about throughput being refined once pilot data exists.

---

## 5. Risk Register

| # | Risk | Likelihood | Impact | Owner | Mitigation |
|---|---|---|---|---|---|
| 1 | Payment webhook failure causes a paying subscription to lapse incorrectly | Medium | High | Backend lead | Webhook = source of truth, but reconciled against a scheduled API status poll as backup (never rely on webhook delivery alone); manual admin override tooling from Phase 5 |
| 2 | Offline POS sync conflict corrupts inventory count | Medium | High | Mobile/backend lead | Last-write-wins with server-side audit trail + manager review queue for conflicts, per Phase 1 design — never silent overwrite |
| 3 | Cross-tenant data leak via IDOR, tampered tenant_id, or JWT manipulation | Low (if RLS done right) | Critical | Security lead | RLS as defense-in-depth (Section 3); dedicated penetration test in Phase 7; permanent CI regression suite |
| 4 | Flutterwave sub-merchant/KYC model chosen incorrectly, creating CBN licensing exposure | Medium | Critical | Founder + counsel | Resolve Section 2.2 with Flutterwave partnerships + a fintech lawyer *before* Phase 5 begins, not during |
| 5 | Accounting module silently edits a posted journal entry (bug or bad UI affordance) | Low | Critical | Backend lead | Append-only enforced at both application and DB constraint/trigger level (Phase 2); no UI path allows editing posted entries, only reversing entries |
| 6 | Low-end Android/3G users abandon onboarding due to performance | Medium | High | Mobile lead | Offline-first is a hard requirement, not best-effort; cross-device/3G testing explicitly scoped in Phase 9 |
| 7 | Bulk CSV import corrupts existing inventory (bad data merged silently) | Medium | Medium | Backend lead | Mandatory preview/confirm step before commit, validation for duplicate SKUs/malformed rows, per Phase 4.1 |
| 8 | A runaway tenant (bug or abuse) degrades performance for all other tenants | Medium | High | Backend lead | Per-tenant and per-user rate limiting (Redis-backed), scoped in Phase 3 |
| 9 | NDPA data-residency requirement conflicts with chosen cloud region | Low–Medium | High | Founder + counsel | Resolve Section 2.1 data residency question *before* Phase 1 infrastructure/region is finalized — this is a rare case where compliance blocks an architecture decision directly |
| 10 | Underestimated infrastructure cost makes ₦5,000–₦20,000/month tiers unprofitable at scale | Medium | Critical (business viability) | Founder | Explicit cost modeling exercise in Phase 8, item 8 — revisit after pilot cohort's real usage data is in, not just projected |

---

## 6. Open Decisions Requiring Explicit Sign-Off Before Phase 1

1. Confirm Section 0: no public directory in scope (or flag it for separate Phase 12+ treatment).
2. Confirm Section 1: v1/v2 module split as listed, or mark specific changes.
3. Confirm Section 2.2: engage Flutterwave + counsel on payment-facilitator vs. sub-account model — this has a real lead time, start it now in parallel with Phase 1.
4. Confirm Section 2.1: data residency requirement, since it affects cloud region selection in Phase 1.
5. Confirm Section 4: 15,000 concurrent sessions as the working concurrency target, with pilot-data refinement of throughput planned for Phase 8.
6. Confirm Section 3: shared DB + RLS tenant model (recommended default, low-risk to accept as-is).

**Exit criteria for Phase 0 (per master spec):** written sign-off on the six items above. Once signed off, Phase 1 (System Architecture & Tech Stack Finalization) can begin.
