# YaseeTech Business Cloud — Website UI Design Notes

## Files
- `index.html` — one-page marketing site (10 sections, matches the reference layout 1:1)
- `login.html` — Log In screen
- `signup.html` — Create Account screen
All three are self-contained (Tailwind CDN + Google Fonts, no build step) and link to each other by relative path — open `index.html` and click "Log In" / "Start Free Trial" to move between them.

## What changed in this revision
- Added **Log In** (text link) and **Start Free Trial → signup.html** to the navbar, hero, CTA banner, pricing cards and footer — account entry is now reachable from every major section, not just implied.
- Added two new auth screens, `login.html` and `signup.html`, using the same forest-green/gold system as the marketing site: a dark brand panel with a live product snapshot on the left, a clean form on the right (Google SSO option, password field, terms checkbox on sign-up).
- Added a "Trusted by SMEs across Kaduna, Abuja, Zaria & beyond" logo-style trust strip under the hero stats for extra credibility/professionalism.
- Footer now has a dedicated **Account** column (Log In / Create Account) alongside Product, Company and Support.
- Tightened CTA link targets throughout so every "Start Free Trial" button consistently points to `signup.html` and "Contact Sales" on the Enterprise plan points to a `#contact` anchor rather than a dead link.

## Color tokens
| Token | Hex | Use |
|---|---|---|
| forest-900 | #0A2A1E | Darkest sections (footer, feature grid bg) |
| forest-800 | #0E3826 | Dark split panel, auth brand panel |
| forest-700 | #12432E | Primary brand green (buttons, headings, nav underline) |
| leaf | #2FAE66 | Script accent ("Starts Here"), success/online states |
| gold | #EFA234 | Primary CTA buttons, highlights |
| gold-700 | #C67A17 | Gold hover / eyebrow text on light bg |
| cream | #F7F8F4 | Light section backgrounds |
| ink | #122019 | Body text |
| soft | #5C6B62 | Secondary/muted text |

## Type
- Display/headings: **Poppins** (500–800)
- Body: **Inter**
- Script accent ("Starts Here" on the hero): **Caveat**

## Section order on index.html (matches reference 1:1)
1. Navbar — logo, nav links, Log In, gold "Start Free Trial"
2. Hero — headline w/ script accent, dual CTAs, POS device-mockup card, floating stat strip, trust strip
3. Explore Platform Modules — dashboard mockup card + 6 module icon tiles
4. Dark split panel — "Built for How Nigerian SMEs Actually Work" + 4 feature points + multi-branch status card
5. Feature grid (dark) — tab filter + 6 feature cards
6. Trusted at Scale — dark stat band (4 stats)
7. Testimonials — 3 cards, initials avatars, star ratings
8. Pricing — Starter ₦1,500 / Growth ₦3,000 (Most Popular) / Pro ₦5,000 / Enterprise (Custom)
9. CTA banner — dark, gold button, "No credit card required"
10. Footer — logo/tagline, Product/Company/Support/Account columns, legal row

## Notes on imagery
Hero, module and split-panel "photos" are built as UI-mockup cards (live POS ticket, dashboard chart, branch-status panel) rather than stock photography, so the files stay fully self-contained with no external image dependencies and render identically anywhere they're opened. Swap the marked containers for `<img>` tags once real product screenshots or customer photography are available.

## Next steps
- Wire the forms on `login.html` / `signup.html` and the nav/CTA buttons to real auth routes.
- Swap in real product screenshots once POS/dashboard UI is built out.
- Add real customer photos/logos when available.
