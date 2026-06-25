# PWA Tech Stack 2025-2026 — Hotel Guest App MVP
**Data: 2026-06-25 | Kontekst: Multi-tenant hotel SaaS, PWA + Admin Panel**

---

## TL;DR — Rekomendacje w jednym miejscu

| Obszar | Decyzja | Uzasadnienie |
|---|---|---|
| Framework | **Next.js App Router (v15/16)** | Multi-tenant middleware produkcyjny, RSC redukuje bundle, ekosystem admin |
| Auth | **Supabase Anonymous Sign-In + Custom Access Token Hook** | QR flow bez e-maila gościa, `property_id` w JWT, RLS działa natychmiast |
| Real-time | **SSE custom endpoint** (nie Supabase Realtime) | Limity Realtime (500 conn/Pro), SSE skaluje się bez websocket overhead |
| AI proxy | **Next.js Route Handler** (nie Edge Function) | Node.js + Redis semantic cache, bez Deno ograniczeń, streaming native |
| Baza danych | **Supabase Pro ($25/mies.)** | Jeden projekt, `property_id` w schemacie, RLS, zarządzany Postgres |
| Hosting MVP | **Railway (EU West) + Supabase** | Proste, brak cold starts, SSE działa, ~$40-60/mies. |
| Hosting wzrost | **Fly.io (Warsaw waw region)** | RODO data residency PL, persistent containers, SSE unlimited |
| CI/CD | **GitHub Actions 3-env** | Preview/Staging/Prod, minimal ale kompletny |
| Monitoring | **Sentry + PostHog EU + uptime** | Must-have od dnia 1, PostHog EU cloud dla RODO |

---

## 1. Framework: Next.js vs Remix vs SvelteKit

### Kontekst decyzji

Use case jest specyficzny: PWA dla gości hotelowych (guest-facing, mobile-first, <150KB) **plus** panel administracyjny dla hoteli (desktop-heavy, tabele, wykresy). To dwa różne produkty w jednym repo.

### Next.js App Router (v15/16)

**Silne strony dla tego projektu:**

- **Multi-tenant middleware** jest produkcyjnie udokumentowany. Vercel Platforms Starter Kit + Next.js Docs mają oficjalny guide do subdomain-based routing przez `middleware.ts`. Wzorzec: middleware wykrywa subdomenę → rewrite do `/tenant/[slug]` → `property_id` propagowany przez request headers. Działa na Railway/Fly.io tak samo jak na Vercel.

- **React Server Components redukuje bundle**. Admin panel renderuje tabele, wykresy i formy po stronie serwera — zero hydration dla statycznych widoków. Guest-facing PWA shell może zejść poniżej 150KB gzipped przy właściwym code splitting.

- **SSE w Route Handlers działa**, ale wymaga `export const dynamic = "force-dynamic"` aby wyłączyć caching. API Route zwraca `ReadableStream` z headerami `Content-Type: text/event-stream`. Krytyczne: Vercel serverless ma timeouty (60s na Pro), co zabija long-lived SSE — rozwiązanie: Railway/Fly.io gdzie kontenery są persistent.

- **Oficjalny PWA guide** pojawił się w Next.js docs w połowie 2024 (v14+). Service Worker registration przez `RegisterSW` komponent, bez potrzeby `next-pwa` plugina (który był słabo utrzymywany). Cache strategy implementowana ręcznie w `sw.js`.

- **Ekosystem admin panel**: shadcn/ui, Tremor, TanStack Table — wszystkie natywnie React/Next.js.

**Słabe strony:**

- App Router caching jest skomplikowany (fetch cache, route segment cache, full route cache) — łatwo o bug gdzie dane nie odświeżają się po mutacji.
- `next/image` i pełne ISR działają optymalnie tylko na Vercel.
- Większy JS bundle niż SvelteKit dla prostych komponentów.

### SvelteKit

**Silne strony:**

- Bundle 50-70% mniejszy niż React-based — `<150KB` jest łatwiejszy do osiągnięcia bez specjalnych zabiegów.
- `razshare/sveltekit-sse` — dedykowana biblioteka SSE, dobrze utrzymana.
- `vite-pwa` integracja jest pierwszoklasowa dla SvelteKit.
- Svelte 5 z Runes system (2024+) rozwiązuje problemy reaktywności.

**Słabe strony dla tego projektu:**

- **Mniejsza pula talentów** — szukając developerów, React jest standardem w PL, Svelte jest niszą.
- **Admin panel tooling jest słabszy** — data tables, charts, complex forms mają mniejszy wybór dojrzałych komponentów vs React ecosystem.
- **Mniej enterprise deploymentów** — mniej case studies multi-tenant SaaS z RLS + Supabase w SvelteKit.

### Remix / React Router v7

**Sytuacja w 2025-2026**: Remix został oficjalnie połączony z React Router v7 (Shopify przejął, potem oddał społeczności). React Router v7 = Remix 3. Rebrand dodaje niepewność.

**Dla tego projektu**: Remix/RRv7 jest dobry dla admin paneli (loader/action pattern jest elegancki dla CRUD), ale:
- PWA support jest bardziej manualny niż Next.js.
- Mniejsza dokumentacja multi-tenant patterns.
- SSE wspierane, ale mniej przykładów.

**Nie rekomendowane** — risk niepewnej roadmapy + mniejszy benefit względem Next.js dla tego konkretnego projektu.

### Werdykt: Next.js App Router

```
Next.js App Router v15/16

Reasoning:
1. Multi-tenant middleware oficjalnie udokumentowany → mniej własnego kodu
2. RSC → admin panel bez hydration overhead, guest PWA poniżej 150KB możliwe
3. SSE w Route Handlers → natywne wsparcie (z "force-dynamic")
4. shadcn/ui + TanStack Table → admin panel gotowy w tygodnie, nie miesiące
5. Hiring → React jest standardem w PL
6. Hosting portable → Next.js działa na Railway/Fly.io bez Vercel lock-in
```

**Ryzyko do zarządzania**: App Router cache gotchas. Rozwiązanie: `revalidatePath()` / `revalidateTag()` po każdej mutacji + e2e testy dla critical paths.

---

## 2. Supabase jako Backend

### 2a. Supabase Auth — QR Flow dla gości hotelowych

Gość nie ma konta. Skanuje QR przy wejściu do pokoju. Musi być zalogowany jako "gość w pokoju X, hotel Y".

**Rekomendowany flow:**

```
Hotel check-in → backend generuje QR
  → QR = deeplink z encoded short-lived token (JWT, 24h TTL)
  → Gość skanuje → PWA otwiera się z tokenem w URL
  → signInAnonymously() na Supabase
  → Custom Access Token Hook wstrzykuje { property_id, room_number, session_id }
  → Supabase JWT ma property_id → RLS działa
```

**Kluczowe elementy techniczne:**

1. **Anonymous Sign-In** (`supabase.auth.signInAnonymously()`) — produkuje pełen JWT bez e-maila. Dostępne od Supabase v2.
2. **Custom Access Token Hook** (Supabase Auth Hook) — PostgreSQL function wywoływana podczas token generation. Pozwala na dodanie custom claims (`property_id`, `room_number`) do JWT bez dodatkowego roundtripa.
3. **RLS policy** z custom claim:
   ```sql
   CREATE POLICY "guest_sees_own_hotel" ON orders
     FOR SELECT USING (
       property_id = (auth.jwt() -> 'app_metadata' ->> 'property_id')::uuid
     );
   ```

**Ważne ograniczenie**: Anonymous users nie mogą się "zalogować ponownie" jako ten sam user po wylogowaniu. Dla hoteli jest to OK — każda wizyta to nowa sesja. Token w QR jest jednorazowy lub ma TTL aligned z check-out.

**Alternatywa (nie rekomendowana)**: Magic Link w QR — wymaga e-maila gościa, który hotel często nie ma lub nie może udostępnić.

### 2b. Supabase Realtime vs SSE — dla statusu zamówień

**Dlaczego nie Supabase Realtime:**

| Kryterium | Supabase Realtime | Custom SSE |
|---|---|---|
| Protokół | WebSocket (dwukierunkowy) | HTTP/1.1 SSE (jednokierunkowy) |
| Connections limit | 500 na Pro plan | Ograniczony przez serwer, nie platformę |
| Na 200 hoteli × 50 gości | 10,000 conn → potrzeba Realtime Scale ($) | Zależy od infrastruktury |
| Portability | Wymaga Supabase Realtime servera | Działa na każdym serwerze |
| Reconnect | Automatyczny | Wbudowany w EventSource API |
| RODO | Dane przez Supabase Realtime server | Dane przez własny serwer |

**Rekomendowany pattern SSE:**

```
Zmiana w DB → PostgreSQL NOTIFY (trigger)
  → API Route (Next.js) nasłuchuje przez pg.Client LISTEN
  → Filtruje po property_id z JWT
  → Pushuje przez SSEreader do konkretnego gościa
```

Przy skalowaniu (>1 instancja serwera): Redis Pub/Sub jako warstwa pośrednia zamiast bezpośredniego `LISTEN` per instancja.

**Limit Supabase Realtime**: 200 conn na Free, 500 na Pro — wystarczające dla MVP 5 hoteli (~250 gości jednocześnie), ale przy 50+ hotelach lepiej custom SSE.

### 2c. Supabase Edge Functions dla AI proxy

**Parametry techniczne (2025-2026):**
- Cold start: **400ms median** (po ulepszeniach ESZip w 2024)
- Hot request: **125ms median**
- CPU limit: **2 sekundy** (!)
- Wall clock limit: **400 sekund**
- Timeout na request idle: **150 sekund**
- Runtime: **Deno** (nie Node.js)

**Problem**: CPU limit 2s to za mało dla operacji przed wysłaniem odpowiedzi (np. sprawdzenie semantic cache w Redis, walidacja). Streaming GPT-4o-mini response przez Edge Function działa (wall clock 400s), ale logika pre-request jest ograniczona.

**Rekomendacja: Next.js Route Handler zamiast Edge Function dla AI proxy**

```typescript
// /app/api/chat/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // nie "edge" - potrzebujemy Redis + pełne Node.js

export async function POST(request: Request) {
  // 1. Sprawdź semantic cache w Redis (podobne pytania)
  // 2. Walidacja JWT + property_id
  // 3. Rate limiting per guest
  // 4. Stream z GPT-4o-mini
  // 5. Zapisz do cache
}
```

**Kiedy Edge Functions mają sens**: Lekkie funkcje bez dużej logiki — np. webhook handler, krótkie transformacje danych. Nie dla AI proxy z semantic cache.

### 2d. Supabase — koszty przy skalowaniu

| Hotele | Wzorzec | Koszt Supabase |
|---|---|---|
| 5 | 1x Pro project, shared DB | $25/mies. |
| 50 | 1x Pro + Compute upgrade (Large) | ~$135/mies. ($25 + $100 extra compute) |
| 200 | 1x Pro + Large + Read Replicas | ~$350-600/mies. |

**Kluczowa decyzja**: Jeden Supabase projekt dla wszystkich hoteli (property_id jako discriminator) vs osobny projekt per hotel. Rekomendacja: **jeden projekt** — prostsze operacyjnie, RLS izoluje dane, niższy koszt. Osobne projekty ($25 × N) sensowne dopiero gdy regulator wymaga separacji danych na poziomie storage.

---

## 3. Hosting: Vercel vs Fly.io vs Railway vs VPS

### Kryteria dla tego projektu
1. SSE long-lived connections (serverless to problem)
2. EU data residency (RODO)
3. Koszt 5→200 hoteli
4. Cold starts przy małym ruchu (hotel może nie mieć gości w nocy)
5. Operacyjna prostota dla MVP

### Vercel

**Pros**: Zero-config dla Next.js, preview per PR, Fluid Compute (zero cold starts dla 99.37% requestów), global CDN, Image Optimization.

**Krityczny problem dla tego projektu**: SSE long-lived connections są niekompatybilne z serverless model. Nawet z Fluid Compute, Vercel **nie wspiera WebSocket** i SSE connections mają timeouty wynikające z funkcji (60s na Pro, 800s na Enterprise). Długotrwałe SSE connection (gość czeka na status zamówienia przez 10 minut) zostanie przerwana.

**Obejście**: Stateless SSE — gość łączy się co 30s na nowo (polling z SSE wrapper). To degraduje UX.

**RODO**: Vercel Inc. to US company, dane przechodzą przez US infrastructure. Wymaga Standard Contractual Clauses + Transfer Impact Assessment dla PL danych osobowych. Szara strefa.

**Koszty**:
- MVP (5 hoteli): ~$20-40/mies. (Pro plan)
- 50 hoteli: ~$100-300/mies. (zależy od function execution GB-hours)
- 200 hoteli: może skoczyć do $500-1500/mies. przy intensywnym SSE

**Werdykt**: Dobry dla szybkiego prototypu/demo, ale nieodpowiedni dla produkcji z long-lived SSE.

### Railway

**Pros**: Persistent containers (brak cold starts), EU West region, świetne DX, proste skalowanie, płaci się za użycie.

**Cons**: Incident w EU West w grudniu 2025 (builds zatrzymane na kilka godzin), brak Warsaw region (dane w EU West = prawdopodobnie Paryż/Frankfurt), US company dla RODO.

**SSE**: Działa bez ograniczeń — kontenery są persistent, połączenia żyją tak długo jak chcemy.

**Koszty**:
- Hobby: $5/mies. minimum (limit dla małych projektów)
- Pro: $20/mies. + ~$0.000463/vCPU/sek + $0.000231/RAM-GB/sek
- Real-world Next.js app: $30-60/mies. dla moderate traffic
- 5 hoteli MVP: ~$40-70/mies. (Railway + Supabase)
- 200 hoteli: ~$150-400/mies. (Railway scales linearly)

**RODO**: US company, wymaga DPA. Railway ma EU West ale nie ma oficjalnej certyfikacji RODO jak np. OVH.

**Werdykt**: Najlepszy wybór dla MVP — proste, działa z SSE, przystępne koszty.

### Fly.io

**Pros**: Persistent containers, **Warsaw (waw) region dostępny** (data residency PL), 3ms latency dla PL users, bardziej kontrolowalne niż Railway, geograficznie dystrybuowany.

**Cons**: Billing surprises w 2026:
- Styczeń 2026: volume snapshot fees ($0.08/GB/mies.)
- Luty 2026: inter-region private network charges
- Setup bardziej skomplikowany niż Railway (`fly.toml`, volumes, secrets)
- US company dla RODO (similar problem do Vercel/Railway)

**SSE**: Doskonałe. Persistent containers z dedicated CPU/RAM. Long-lived connections działają bez ograniczeń.

**Koszty**:
- shared-cpu-1x 256MB: ~$1.94/mies. per machine (continuous)
- Realistycznie dla Next.js + 2 replicas: ~$15-30/mies.
- 5 hoteli MVP: ~$40-60/mies. (Fly + Supabase)
- 200 hoteli (z auto-scaling): ~$120-250/mies.

**Warsaw region** jest kluczowym argumentem dla RODO compliance — dane fizycznie w Polsce, latency <5ms dla użytkowników PL.

**Werdykt**: Najlepszy wybór dla wzrostu (po MVP), szczególnie z Warsaw region dla RODO.

### VPS (Hetzner / OVH PL)

**Hetzner (DE/FI)**: CX21 (2 vCPU, 4GB RAM) = €4.51/mies. Bardzo tanio, ale DevOps overhead.

**OVH PL / Cyber_Folks**: Dane fizycznie w Polsce, RODO compliance out-of-the-box.

**Realistyczny koszt "zrób sam"**:
- Serwer: €5-20/mies.
- Nginx + SSL + Docker Compose: własny czas
- Brak managed DB (lub dodatkowy koszt za managed Postgres)
- Monitoring setup: własny czas

**Dla MVP**: Nie rekomendowane — zbyt duże nakłady DevOps. Wróć do tego przy 100+ hotelach jeśli koszty Railway/Fly.io rosną.

### Rekomendacja hostingu: 2-fazowa strategia

**Faza 1 (MVP, 0-20 hoteli):**
```
Railway Pro (EU West)
  + Supabase Pro ($25/mies.)
  + Vercel (opcjonalnie, tylko dla preview deployments)

Total: ~$60-90/mies.
```

**Faza 2 (wzrost, 20+ hoteli):**
```
Fly.io (Warsaw region, waw)
  + Supabase Pro (upgrade compute jeśli potrzeba)

Total: ~$80-200/mies. (wolniej rośnie niż Railway przy skali)
```

**Trigger migracji**: Gdy koszt Railway > $150/mies. lub potrzeba explicit RODO data residency w PL.

---

## 4. CI/CD — Minimalne MVP z GitHub Actions

### Filozofia: "Simple enough to actually use"

Zbyt skomplikowane CI/CD jest gorsze niż proste — team omija je lub nie rozumie. MVP potrzebuje 3 środowisk, 1 pliku workflow per środowisko.

### Środowiska

| Środowisko | Trigger | Cel |
|---|---|---|
| **Preview** | PR opened/updated | QA, review change isolated |
| **Staging** | Push to `main` | Integration test, stakeholder review |
| **Production** | Git tag `v*` lub manual dispatch | Klienci |

### Minimalna struktura (`.github/workflows/`)

**`preview.yml`** — na każdy PR:
```yaml
on:
  pull_request:
    branches: [main]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit
      - run: npm run build
      # Deploy do Railway preview environment
      - uses: railwayapp/cli@v3
        with:
          command: up --detach --environment pr-${{ github.event.number }}
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
      # Post URL do PR comment
```

**`staging.yml`** — na push do main:
```yaml
on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - # ... checkout, install, test
      - run: npm run test:e2e
        env:
          TEST_BASE_URL: ${{ vars.STAGING_URL }}
      - # Deploy to Railway staging environment
```

**`production.yml`** — na git tag lub manual:
```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to deploy'
        required: true

jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production  # wymaga manual approval w GitHub
    steps:
      - # deploy to Railway production
      - name: Notify Sentry of release
        run: npx sentry-cli releases new ${{ github.ref_name }}
```

### Rollback strategy

**Najprosta metoda** (rekomendowana dla MVP):

1. Każdy production deployment jest tagiem git (`v1.2.3`)
2. Rollback = re-trigger `production.yml` workflow na poprzedni tag
3. Railway/Fly.io trzymają ostatnie 5 deploymentów — można "rollback" przez platform UI w <2 min

```bash
# Rollback przez CLI (Railway)
railway rollback --deployment <previous-deployment-id>

# Lub przez git tag
git tag v1.2.2-hotfix  # wskaź na poprzedni commit
git push origin v1.2.2-hotfix
# → trigger workflow automatycznie
```

**Baza danych**: Supabase ma automatyczne backupy (daily na Pro). Migration rollback wymaga `supabase db diff` + odwrócenia migracji. Zasada: **wszystkie migracje muszą być backwards compatible przez 1 wersję** (additive first, remove in next release).

### Secrets management

```
GitHub Environments (nie Actions Secrets globalne):
  - staging:    SUPABASE_URL, SUPABASE_SERVICE_KEY, RAILWAY_TOKEN, etc.
  - production: osobny set sekretów, required reviewers = 2 osoby
```

### Minimalny monorepo setup (opcjonalnie)

Jeśli guest app + admin panel są oddzielone:
```
/apps
  /guest-pwa     → deploy Railway (Next.js, SSE, PWA)
  /admin          → deploy Railway (Next.js, Admin)
/packages
  /db-types       → generowane przez Supabase CLI
  /shared-ui      → wspólne komponenty
```

Turbopack/Turborepo: cache aware builds w CI — tylko rebuild to co się zmieniło.

---

## 5. Monitoring — Co mierzyć od dnia 1

### Stack rekomendowany

```
Sentry (Error tracking) + PostHog EU Cloud (Analytics) + Better Stack (Uptime)
```

### Must-Have od dnia 1

**Sentry** (Free tier: 5K errors/mies.):
- Frontend JS errors z `property_id` w kontekście (każdy błąd przypisany do hotelu)
- Source maps upload w CI pipeline (inaczej stack traces są bezużyteczne)
- Performance monitoring: Core Web Vitals per route
- Alerts: >10 errors/minute → Slack notification

Konfiguracja dla multi-tenant:
```typescript
Sentry.setUser({ id: userId });
Sentry.setTag('property_id', propertyId);
Sentry.setTag('room_number', roomNumber);
```

**PostHog EU Cloud** (Free: 1M events/mies., EU hosting):
- Funnel: QR scan → app load → first order → completion
- Session replay dla gości (bezcenne przy debugging UX issues)
- Feature flags dla A/B testów (np. czy nowe menu zwiększa zamówienia)
- Uptime monitoring: PostHog może śledzić availability custom events

RODO uwaga: PostHog EU hosting = dane w UE = compliance bez dodatkowych umów.

**Better Stack** (dawniej Logtail, $24/mies. Starter):
- Uptime check co minutę (nie co 5 min jak UptimeRobot)
- Status page dla hoteli (mogą sprawdzić czy system działa)
- Log aggregation (Railway/Fly.io logi → Better Stack)
- Alert na Slack/e-mail przy downtime

### Co mierzyć — konkretne metryki

**Availability & Performance (od dnia 1):**
```
- Uptime 30-day rolling (target: >99.5%)
- p50/p95/p99 latency dla /api/orders (target: p95 <500ms)
- p50/p95 dla AI chat first token (target: p95 <2s)
- SSE connection health (active connections per property)
- Error rate per endpoint (target: <0.1%)
```

**Business metrics (od dnia 1):**
```
- QR scans per hotel per day (acquisition)
- Orders placed per session (engagement)
- Order-to-delivery time (operations quality)
- AI chat sessions per day (feature adoption)
- Session duration (>3 min = good engagement)
```

**Infrastruktura (od dnia 1, via Railway/Fly.io dashboard):**
```
- CPU/Memory per service instance
- DB connection pool utilization
- Redis memory usage (semantic cache)
- Network egress (koszt!)
```

### Nice-to-Have (po MVP, po pierwszym płacącym kliencie)

| Narzędzie | Koszt | Wartość |
|---|---|---|
| Grafana Cloud (free tier) | $0 | Dashboardy infrastruktury, alerting rules |
| OpenTelemetry | $0 (self-hosted) | Distributed tracing API → DB → AI |
| Sentry Crons | $0 (w Sentry) | Monitoring scheduled jobs (np. backup verify) |
| PostHog Cohorts | Included | Segmentacja hoteli po wielkości/ruchu |

### Alert Priority Matrix

| Alert | Severity | Action |
|---|---|---|
| Uptime down >2 min | CRITICAL | PagerDuty/telefon |
| Error rate >5% | HIGH | Slack #ops, investigate immediately |
| SSE connections = 0 (w godzinach szczytu) | HIGH | Check Railway/Fly.io status |
| AI chat p95 > 5s | MEDIUM | Check OpenAI status, cache hit rate |
| DB connection pool > 80% | MEDIUM | Scale compute or review queries |
| Error rate 1-5% | LOW | Slack #ops, investigate next business day |

---

## 6. Architektura MVP — Całościowy widok

```
┌─────────────────────────────────────────────────────┐
│                    Railway (EU West)                  │
│                                                       │
│  ┌─────────────────┐    ┌─────────────────────────┐  │
│  │  Next.js App     │    │  Redis (Upstash EU)     │  │
│  │  (App Router)    │    │  - Semantic cache AI    │  │
│  │                  │    │  - SSE pub/sub          │  │
│  │  /app/[hotel]   │    │  - Rate limiting        │  │
│  │  /admin         │    └─────────────────────────┘  │
│  │  /api/sse       │                                  │
│  │  /api/chat      │                                  │
│  └────────┬────────┘                                  │
└───────────┼─────────────────────────────────────────┘
            │
     ┌──────▼──────┐
     │   Supabase  │  (managed, EU Frankfurt)
     │  PostgreSQL │
     │   + Auth    │
     │   + Storage │
     └─────────────┘

Zewnętrzne:
  OpenAI API (GPT-4o-mini) → przez /api/chat
  Sentry EU          → error tracking
  PostHog EU Cloud   → analytics
  Better Stack       → uptime monitoring
```

**Upstash Redis zamiast self-hosted Redis** dla MVP:
- Serverless Redis, EU region, $0 na free tier (10K requests/dzień)
- Semantic cache: embeddings gości pytań, sprawdzaj podobieństwo przed wywołaniem OpenAI
- Szacunkowe oszczędności: 40-60% kosztów OpenAI przy typowych pytaniach hotelowych

---

## 7. Ryzyka i mitigacje

| Ryzyko | Prawdopodobieństwo | Wpływ | Mitigacja |
|---|---|---|---|
| Supabase Anonymous sessions wyczerpią free tier | Wysokie | Średni | 50K MAU na Pro wystarczy dla 200 hoteli |
| Railway EU West incident (jak XII 2025) | Średnie | Wysoki | Multi-region w Fly.io jako plan B |
| OpenAI API downtime podczas szczytu | Niskie | Wysoki | Fallback message + retry z exponential backoff |
| Supabase RLS bug (data leak między hotelami) | Niskie | Krytyczny | Testy integracyjne RLS per tenant obligatoryjne |
| RODO DPA brak od Railway/Vercel | Średnie | Wysoki | Fly.io waw (PL) jako opcja; własny DPA z providerami |
| Bundle >150KB przy feature creep | Wysokie | Średni | Bundle analyzer w CI, size-limit package |

---

## Appendix: Koszty całkowite MVP (5 hoteli, 3 miesiące)

| Pozycja | Miesięczny koszt |
|---|---|
| Railway Pro | $20 + ~$20 usage = $40 |
| Supabase Pro | $25 |
| Upstash Redis | $0 (free tier) |
| PostHog EU Cloud | $0 (1M events free) |
| Sentry | $0 (5K errors free) |
| Better Stack Starter | $24 |
| OpenAI (GPT-4o-mini) | ~$10-30 (zależy od ruchu) |
| **TOTAL** | **~$99-119/mies.** |

Przy 5 hotelach płacących $99/mies. każdy — projekt jest rentowny od pierwszego dnia.

---

*Raport wygenerowany na podstawie research z 2026-06-25. Ceny i limity platform mogą ulec zmianie — weryfikuj przed deployment.*
