# MVP Validation Frameworks — Sesja 7
*Research: Haiku — 2026-06-25*

## Framework walidacji B2B2C

**Define → Design → Deploy → Decide** (4-step framework)

Before running any test, translate business assumptions into falsifiable hypotheses tied to measurable metrics:

1. **Define**: What assumption are you testing? (e.g., "Hotel staff will actively promote app to guests" vs. "Guests will use app for room requests 2+ times per stay")
2. **Design**: Which metric proves/disproves this? (e.g., activation rate, feature usage, staff adoption %)
3. **Deploy**: Run the test with instrumentation. Capture both B2B metrics (hotel staff adoption) AND B2C metrics (guest engagement)
4. **Decide**: Compare results to pre-set thresholds. Three outcomes only: persevere, pivot, or kill

**Critical pre-testing work:**
- Choose features testing *riskiest* assumptions (not nice-to-haves)
- Set success criteria *before* launch — moving goalposts = unclear thinking
- Define "kill criteria" — the specific result that triggers a pivot
- Track behavioral signals (activations, repeat usage) not surveys or interviews alone
- Avoid vanity metrics: 1,000 signups with 15% activation ≠ 3,000 signups with 60% activation

---

## Minimalna próba — ile hoteli, ile gości

### Recommended sample for B2B2C MVP

**Hotels (B2B side):** 3–5 hotels minimum
- Do not validate with 1–2 hotels (too much noise from individual implementation quality)
- 3–5 allows you to identify patterns vs. outliers
- Ideal: diverse hotel sizes (2–3 boutique/independent, 1–2 mid-size chains) to catch implementation variation

**Guests per hotel (B2C side):** 50–200 active guests minimum per hotel
- This gives statistical power to detect engagement patterns (activation, repeat usage)
- Lower: if 30–40 guests, engagement signals are too noisy
- Higher: each additional hotel adds ~100–150 guest-sessions for validation

**Why these numbers?**
- B2B marketplaces validate with 10 buyers + 10 sellers before code; hotels + guests follow this logic
- 3–5 hotels × 100 guests = 300–500 B2C data points, sufficient to detect whether product works vs. implementation issues
- Under 3 hotels: you cannot separate confounding factors (staff capability, change resistance, setup rigor)

**Pilot duration:** 90 days (3 months)
- 30–60 days insufficient; guests need time to integrate app into routine
- 90 days allows one full operating cycle (covers weekly patterns, seasonal checkout rhythms)
- Longer than 90 days: analysis paralysis, slow decision velocity

---

## Oddzielenie product-fit od implementation-fit

**The confounding variable problem:**
A hotel's failure to drive adoption could mean:
- (A) Product doesn't solve real guest needs (product-fit fail)
- (B) Hotel staff poorly trained, didn't promote, or didn't believe in it (implementation-fit fail)

You cannot assume result = cause without instrumentation.

### Control for implementation quality:

**Track these separately:**

| Metric | What it tells you |
|--------|------------------|
| Staff activation rate | Did staff use the tool to understand it? (Days 1–7) |
| Staff training completion | Did hotel complete onboarding correctly? (YES/NO gate) |
| Hotel promotion activity | Did hotel email/signage/front desk mention app? (Count attempts) |
| Guest awareness | Did guests *know* app existed? (Survey after stay) |
| Guest activation (feature use) | Did aware guests actually use it? (% of aware guests) |
| Guest repeat usage | Did users return to app during stay? (Session count) |
| Guest NPS or CSAT | Do users think it solved their problem? (Satisfaction score) |

**Implementation-fit diagnosis:**
- High staff activation + low guest activation = guest didn't know about it (promotion gap)
- High guest awareness + low guest activation = product doesn't solve stated need (product-fit fail)
- Low staff training completion = exclude this hotel's data (implementation setup failed, invalid test)

**Rule:** If hotel implementation quality varies dramatically (one perfect, one sloppy), either:
1. Tighten controls: force equal training/promotion for all hotels
2. Stratify data: analyze high-quality implementations separately, flag quality issues

---

## Leading vs Lagging metryki

### Week 1–7 (Leading indicators — steer early)
*Checked weekly. Predict month 2+ performance.*

- **Day 1–3:**
  - Staff trained? (%) — setup quality gate
  - Staff app opens (count) — staff belief signal
  - Guest app installs (count) — awareness working?

- **Day 4–7:**
  - Guest first activation (%) — did guest try feature?
  - Staff promotion attempts (email/signage count) — adoption effort
  - Guest session duration (avg seconds) — is UX working?

**Leading metric target:** ≥30% guest activation within 7 days (opened app + tried one feature)

### Week 4–8 (Lagging indicators — confirm reality)
*Checked monthly. Reflect actual value delivery.*

- Repeat usage rate (% guests using 2+ times during stay)
- Feature adoption rate per feature (% guests using each)
- Upsell conversion (if applicable) — did app drive revenue?
- Guest NPS/CSAT (are they satisfied?)
- Staff satisfaction with tool (would they recommend?)
- Reduction in front desk inquiries (operational win?)

**Lagging metric thresholds:**
- Repeat usage: ≥40% = strong engagement signal
- NPS ≥40 = product working
- Staff satisfaction ≥4/5 = sustainable adoption

### Why split matters:
- Leading: you catch problems (low staff adoption, poor UX) in week 2–3, pivot before month 4 data arrives
- Lagging: confirms leading signals actually drove business value (not just activity for activity's sake)

---

## Typowa struktura pilotu hospitality SaaS

### Duration: 90 days
- Weeks 1–2: Staff training, setup, early signage
- Weeks 3–8: Active guest usage period (covers ~2–3 stay cycles)
- Weeks 9–12: Data analysis, ROI calculation, decision

### Hotel count & guest volume:
- 3–5 hotels (diverse sizes/geographies preferred)
- ~100–150 guest interactions per hotel = 300–750 guest-sessions
- Aim for at least 2 "full" hotel weeks of occupancy per pilot hotel

### Data collection infrastructure:
1. **In-app analytics:**
   - Installation count, activation count, daily/weekly active users
   - Feature usage per guest (which features tried?)
   - Session duration, exit points (where do guests drop off?)

2. **Hotel operations data:**
   - Staff training completion (date, trainer notes)
   - Promotion activity log (emails sent, signage deployed, front desk mentions)
   - Front desk inquiries (count by type: room service, housekeeping, concierge, etc.)
   - Staff feedback (NPS or quick survey every 2 weeks)

3. **Guest feedback:**
   - Exit survey (5 questions, <2 min): Did you know about app? Did you use? Would you use again?
   - NPS question (optional add-on for high-usage guests)
   - Support tickets mentioning app (success or failure)

4. **Business impact:**
   - Upsell revenue from app (if applicable)
   - Cost savings (front desk time, operational efficiency)
   - Repeat booking rate (did app improve loyalty?)

### Governance:
- Weekly syncs with hotel champions (staff adoption owner + GM)
- Bi-weekly data review with pilot team (early warning on engagement drop-off)
- Monthly decision gates: "Are we on track?" (if not, adjust promotion or training)

---

## Częste błędy walidacji MVP

### False Positives (think you won, but you haven't)

1. **Concierge effect:**
   - Staff charisma/personal connection drives fake enthusiasm
   - Guests rate app highly because they like the person introducing it, not the product
   - Fix: Measure actual usage, not just satisfaction surveys immediately after intro

2. **Curiosity vs. intent:**
   - Guests install app out of novelty, not genuine need
   - First-day spike followed by 95% churn by day 5
   - Fix: Track *repeat* usage (week 2 re-opens), not just installation count

3. **Small sample illusion:**
   - One hotel's success ≠ validation; could be that one staff member is exceptionally good
   - Results don't replicate at hotel #2
   - Fix: Minimum 3 hotels; look for consistency, not exceptions

4. **Survey bias:**
   - Guests tell staff "great app!" in exit survey (social desirability bias)
   - Actual usage data tells different story
   - Fix: Prioritize behavioral data (usage, repeat opens) over satisfaction scores early

### False Negatives (think you failed, but it's implemention)

1. **Staff didn't try:**
   - Hotel staff never used app, never promoted it
   - Guests have zero awareness
   - Conclude: "Product doesn't work"
   - Fix: Require staff training completion and promotion checkpoints before guest data counts

2. **One bad hotel:**
   - One hotel has poor wifi, weak marketing, unmotivated staff
   - 1 of 3 hotels shows ~0% adoption
   - Average metrics look bad, but 2 hotels show 40% engagement
   - Fix: Stratify results by implementation quality; flag outliers separately

3. **Too-short timeline:**
   - Pilot runs 30 days, conclude failure
   - But guests are creatures of habit; real adoption pattern emerges week 4–8
   - Fix: Commit to 90-day minimum; check leading metrics at day 14 for early warnings, not day 7

4. **Wrong success metric:**
   - Measure clicks-per-guest (high!)
   - Ignore repeat usage (very low)
   - Conclude product works; then churn is massive at scale
   - Fix: Define what "success" actually means business-wise *before* launch (repeat usage? revenue? operational savings?). Track it from day 1.

5. **Implementation setup failing silently:**
   - Hotel never completed API integration, data sync broken
   - You're measuring a crippled product
   - Fix: Validate integration health weekly (do guest actions appear in your analytics?); pause hotel if pipeline breaks

### Red flags during pilot:

- Staff activation <20% by day 7 → training/change management issue
- Guest activation <15% by day 7 → awareness or UX problem (investigate which)
- Repeat usage rate drops >80% from day 1 to day 8 → product doesn't solve stated need
- Front desk doesn't report any change in inquiry volume after 60 days → app isn't being used or not valuable
- Hotels can't articulate *why* guests should use app → product messaging is unclear (implementation-fit issue)

---

## Podsumowanie — Checklist przed pilotem

- [ ] Hypothesis documented (what are we testing?)
- [ ] Success & kill criteria defined (not "see what happens")
- [ ] Leading metrics (week 1–7) identified and instrumented
- [ ] Lagging metrics (week 4–8) identified and instrumented
- [ ] Confounding variable audit (staff training? promotion? UX?)
- [ ] 3–5 diverse hotels recruited with exec buy-in
- [ ] Analytics infrastructure ready (in-app + hotel + guest data)
- [ ] 90-day timeline locked (with weekly sync & decision gates)
- [ ] Go/no-go criteria for week 4 review defined
- [ ] Implementation quality checkpoints in place (training completion gates)

---

## Sources & References

- [MVP Testing: How to Validate Your Product Idea Without Wasting Resources (2025)](https://benny.ghost.io/blog/mvp-testing/)
- [Why Pilot Programs Are a Best Practice for B2B SaaS](https://partnerstack.com/articles/pilot-programs-testing-learning-b2b-saas/)
- [A Guide to Sample Size for Pilot Studies](https://www.statsols.com/guides/sample-size-for-pilot-studies/)
- [Leading and Lagging Metrics in SaaS — RevQore](https://www.revqore.com/blog/leading-and-lagging-metrics-in-saas/)
- [Leading vs. Lagging Indicators — Amplitude](https://amplitude.com/blog/leading-lagging-indicators/)
- [Measuring Guest Experience Impact: KPIs and Instrumentation for Hotel Apps](https://appricotsoft.com/blog/measuring-guest-experience-impact-kpis-and-instrumentation-for-hotel-apps/)
- [Product Adoption Metrics — Userpilot](https://userpilot.com/blog/how-to-measure-product-adoption/)
- [8 MVP Mistakes Founders Make (And How to Avoid Every One)](https://www.f22labs.com/blogs/how-to-avoid-mistakes-founders-make-with-mvps/)
- [Guest Experience App for Hotels: How to Map the Guest Journey](https://appricotsoft.com/blog/guest-experience-app-for-hotels-how-to-map-the-guest-journey-and-find-real-value/)
