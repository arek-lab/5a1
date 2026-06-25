# Analytics Stack MVP — Sesja 7
*Research: Haiku — 2026-06-25*

## Event taxonomy — co trackować od dnia 1

Use consistent `verb_noun` snake_case naming. Property schema: `object_adjective` (e.g., `user_id`, `hotel_id`); booleans prefixed with `is_`, dates with `_date` or `_timestamp`.

### Hotel operator funnel

**Onboarding → Activation:**
- `hotel_account_created` → `hotel_id`, `property_size`, `num_staff` 
- `hotel_settings_configured` → categories enabled (food, services), payment setup
- `hotel_first_item_added` → `item_type` (menu, service), `is_active`

**Activation → Retention:**
- `hotel_login` → `days_since_signup`, `login_method` (email, SSO)
- `hotel_dashboard_viewed` → which section (`overview`, `orders`, `staff`)
- `hotel_settings_updated` → `setting_type`, frequency per week

**Retention → Revenue:**
- `guest_order_received` → `order_value`, `item_count`, `hotel_id` (GROUP property)
- `hotel_revenue_week` → server-side weekly aggregate, `total_revenue`, `order_count`
- `hotel_churn_risk` → 14 days no login = cohort flag for re-engagement

### Guest funnel

**QR Scan → Browse:**
- `guest_qr_scanned` → `hotel_id`, `item_category`, session anonymous UUID
- `guest_menu_viewed` → `category`, `item_count_visible`, session duration
- `guest_item_details_opened` → `item_id`, `price_range`, dwell time

**Browse → Order:**
- `guest_item_added_to_cart` → `item_id`, `quantity`, `price`
- `guest_checkout_started` → cart value, item count
- `guest_order_submitted` → `order_value`, `items_count`, `fulfillment_type` (pickup, delivery), session UUID
- `guest_order_failed` → `failure_reason` (payment declined, network, etc)

**Return:**
- `guest_session_returned` → 7-day, 30-day cohort flags
- `guest_repeat_order` → `orders_lifetime`, `days_since_last_order`

### AI concierge metrics

**Usage & Queries:**
- `concierge_query_submitted` → `query_length`, `category_detected` (room service, local info, tech support), hotel_id
- `concierge_query_received_by_ai` → `model_version`, latency ms
- `concierge_response_delivered` → `response_length`, `confidence_score` (0–1 from model), `answered_directly` (bool)

**Quality & Fallback:**
- `concierge_response_accepted` → guest clicked "helpful" or used the answer (server-side flag from downstream action)
- `concierge_response_escalated` → guest clicked "escalate" or "talk to staff" = containment miss
- `concierge_follow_up_opened` → guest opened clarification prompt
- `concierge_satisfaction_rated` → 1–5 star rating if guest supplies it (optional, low friction)

---

## Automatyczny pomiar jakości AI concierge

**Without manual review**, measure these proxies:

1. **Containment rate** (automated):
   - Numerator: queries NOT escalated (no `concierge_response_escalated` after `concierge_response_delivered`)
   - Denominator: total `concierge_query_submitted`
   - Target: 40–65% for a RAG chatbot (Gartner 2025). Post launch: iterate with fallback categories.

2. **Response latency**:
   - Dashboard alert if `concierge_query_received_by_ai` → `concierge_response_delivered` > 5 seconds
   - Proxy: users waiting >5s are more likely to escalate (correlate in weekly review)

3. **Confidence scoring from model**:
   - Track histogram of `confidence_score` by query category
   - If a category drops below 0.6 average, flag for review (example: "local attractions" queries have low confidence)
   - Use PostHog insight to detect weekly trends

4. **Downstream action rate** (behavioral proxy for "did the answer work?"):
   - Does guest place an order within 2 minutes of concierge response?
   - Does guest return to menu after concierge → indicates answer may have been insufficient
   - These are proxy signals; correlate with escalation rate weekly

5. **Response length outliers**:
   - Alert if concierge returns responses >500 chars (hallucination risk) or <10 chars (truncation)
   - Flag categorically anomalous patterns for sample review

**Monthly (5–10 sample) manual audit:**
- Random sample 10 escalated queries per hotel operator → have hotel staff rate if escalation was justified
- Manually review 3 high-confidence responses marked "accepted" to catch hallucinations (PostHog property: `was_hallucination_flag`)
- No need for 100% audit; correlation of automated proxies with spot-check results calibrates your thresholds

---

## RODO compliance dla event analytics

**Key decisions for hotel guest PWA analytics:**

1. **Guest identity**: 
   - Send session UUID (random, not reversible) NOT email/phone/name
   - Property `guest_id` must be opaque, generated server-side, discarded after session ends (or 30 days)
   - Do NOT include PII in event properties, URLs, or event names

2. **Hotel operator identity**:
   - Use stable `hotel_id` (internal hotel account ID)
   - Property `user_role` acceptable (e.g., "staff", "manager") but NOT personal name/email in properties
   - PostHog can de-identify server-side via transformation if needed

3. **PostHog EU Cloud (GDPR compliant)**:
   - Data is stored in EU
   - PostHog handles DPA for you
   - Verify PostHog's sub-processor list and update your privacy notice

4. **Consent flow** (you handle this, not PostHog):
   - Guest sees banner: "We measure usage to improve the app (no personal data shared)"
   - Hotel operator implicit consent in Terms (staff analytics for operational insight)
   - Respect "Do Not Track" — skip event capture if `navigator.doNotTrack === "1"`

5. **Data retention**:
   - Set PostHog retention to 90 days (not 2 years)
   - Purge `guest_id` from events older than 30 days via transformation
   - Document retention schedule in Data Processing Agreement

6. **Guest deletion right**:
   - If guest requests deletion: delete all PostHog events with that `guest_id`
   - Use PostHog API to purge: `POST /api/event/?distinct_id=<guest_id>&delete=true` (requires custom script)
   - Caveat: aggregated funnels and cohorts already computed won't reverse; document this

7. **No third-party sharing**:
   - PostHog data stays in PostHog only
   - Do NOT export guest event streams to marketing tools (Segment, etc)
   - Hotel operator data can be accessed by hotel staff via shared dashboards

---

## Dashboard — co founder widzi codziennie / tygodniowo

### Daily (5-minute check-in)

Create a single-page dashboard named "Pulse":

| Metric | Why | Alert threshold |
|--------|-----|-----------------|
| **Guests online (last 1h)** | Is the app live? | <5 = down alert |
| **Orders received (last 24h)** | Revenue signal | Down 20% vs avg |
| **Guest QR scans (last 24h)** | Funnel health, traffic | Down 30% vs avg |
| **AI concierge queries (last 24h)** | Feature adoption | — (baseline first week) |
| **Escalation rate (last 24h)** | Concierge quality | >35% = action |
| **Hotel operators logged in (last 7d)** | Retention proxy | < 60% of active = churn signal |

Add counts, not charts. Color: green if stable/up, red if down >20%. No drill-down needed; just alert you to investigate.

### Weekly (Friday morning)

Create a dashboard called "Growth Metrics":

1. **Guest funnel (top-level)**
   - QR scan → item details → add to cart → checkout → order
   - Show weekly cohort: "guests who scanned this week" → % converted to order by day 3, 7
   - Identify if drop-off is browse or checkout

2. **Hotel operator activation by cohort**
   - Hotels signed up last 7, 14, 30 days
   - % who added items, % who got first order, % still active
   - Flag hotels in "churn risk" (14 days inactive)

3. **AI concierge performance by category**
   - Query volume by category (room service, local, tech, etc)
   - Containment rate per category (% not escalated)
   - Average response latency per category
   - Identify if any category is broken

4. **Revenue cohort retention**
   - Guests: repeat order rate by acquisition week (day 7, 30 repeat rate)
   - Hotels: weekly order volume trend (growing, flat, declining per hotel)
   - Identify top 3 performing hotels for case study

5. **Operational health**
   - Events logged successfully (vs failed captures)
   - Guest session duration (increasing = engagement)
   - Staff login frequency (proxy for management engagement)

**Action mode**: Weekly retro (Friday PM) → look at funnel drops and cohort churn → assign fixes for next week.

---

## Cohort analysis setup

### Hotel A vs Hotel B: Comparative analytics

**Use PostHog Group Analytics (paid tier required, but free tier can use tags):**

1. **Group Type: `hotel`**
   - Every event includes `hotel_id` as a **group property** (not a user property)
   - Properties per hotel: `hotel_name`, `hotel_size` (small/medium/large), `payment_tier`, `signup_date`

2. **Create segment cohorts** (saved filters):
   - `Cohort: Hotels by size` → segment into small (1–20 staff), medium (21–100), large (100+)
   - `Cohort: Hotels by performance` → split by week 1 revenue (high >500, mid 100–500, low <100)
   - `Cohort: Early adopters` → signed up first 2 weeks

3. **Compare Hotel A (high-growth) vs Hotel B (low-growth):**
   - Pull **Hotel A only** (filter by `hotel_id = A`):
     - Guest order conversion: % of QR scans → order (weekly)
     - AI concierge containment rate
     - Guest repeat order rate by week
   - Do same for Hotel B
   - Side-by-side in a dashboard tile → identify what Hotel A is doing differently

4. **Drill-down queries** (via SQL if free tier, or PostHog API):
   ```
   -- Weekly order volume, Hotel A vs Hotel B
   SELECT week, hotel_id, COUNT(*) as orders, AVG(order_value) as avg_value
   FROM events 
   WHERE event = 'guest_order_submitted'
   GROUP BY week, hotel_id
   ```

5. **Actionable insights:**
   - Is Hotel A's success due to higher foot traffic (more QR scans) or better conversion (higher % of scans → order)?
   - Does Hotel A use AI concierge more? Does that drive orders?
   - Document winning behaviors → share playbook with Hotel B

### Operationalization

- **Week 1**: Manually compare 2–3 high/low performers to find hypotheses
- **Week 2+**: Automate in PostHog: create saved segments for "top quartile hotels" and "bottom quartile hotels" → weekly email digest of top-performer behaviors
- **Retention analysis**: Filter "cohort by sign-up week" → overlay hotel size/tier → see if certain types churn faster

---

## Implementation checklist

- [ ] Start with bare minimum: 10 events (3 operator, 4 guest, 3 concierge)
- [ ] Name events in `verb_noun` format; version your tracking plan (doc in Git)
- [ ] Verify PostHog SDK is capturing events server-side; avoid client-side PII
- [ ] Set up daily "Pulse" dashboard; alert on order count drop >20%
- [ ] Configure hotel group analytics on day 1 (requires group property in every event)
- [ ] Run weekly retro: check funnel, cohort retention, AI quality metrics
- [ ] Compliance: verify guest `guest_id` is opaque; set retention to 90 days; document DPA
- [ ] Month 1 goal: Isolate one success pattern (e.g., "hotels with concierge >20 queries see 2x order rate")

---

## References

- [PostHog Event Tracking Guide](https://posthog.com/tutorials/event-tracking-guide)
- [PostHog Product Analytics Best Practices](https://posthog.com/docs/product-analytics/best-practices)
- [PostHog Group Analytics Documentation](https://posthog.com/docs/product-analytics/group-analytics)
- [PostHog Cohorts Documentation](https://posthog.com/docs/data/cohorts)
- [PostHog B2B SaaS Product Metrics](https://posthog.com/product-engineers/b2b-saas-product-metrics)
- [PostHog Funnel Analysis Guide](https://posthog.com/docs/product-analytics/funnels)
- [Event Taxonomy That Won't Rot (DigitalApplied 2026)](https://www.digitalapplied.com/blog/product-analytics-event-taxonomy-tracking-plan-2026)
- [Enterprise Chatbot KPIs and Metrics 2026 (Viston Tech)](https://viston.tech/enterprise-chatbot-kpis-and-metrics-what-businesses-should-track-in-2026/)
- [Chatbot Evaluation: Methods and Metrics 2026 (Cekura)](https://www.cekura.ai/blogs/chatbot-evaluation-methods-metrics)
- [GDPR Compliance for Hotels (HotelLogix)](https://blog.hotelogix.com/gdpr-compliance-tips/)
- [Google Analytics and GDPR in 2026 (Incremys)](https://www.incremys.com/en/resources/blog/google-analytics-gdpr)
