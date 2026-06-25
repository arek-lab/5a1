# Roadmap implementacji — Onboarding, Model SaaS, RODO i Metryki MVP

*Fragment syntetyczny (Subagent 4: synthesize-saas-metrics)*
*Źródła: decisions_log.md (Sesje 5, 7; Decyzje tech stack T1–T5), research/session_05/, research/session_07/*
*Wersja 1.0 — 2026-06-25*

---

## Założenia HITL obowiązujące w tym fragmencie

Wszystkie poniższe decyzje są zamknięte i stanowią twarde ograniczenia projektowe — nie podlegają reinterpretacji na etapie implementacji.

| HITL | Decyzja (skrót) | Konsekwencja dla implementacji |
|---|---|---|
| **#10** | Lighthouse Program: 3–5 hoteli gratis 3–6 mies. za case study + referencje + prawo do wywiadu. Po lighthouse: per-room €5–8/mies. (min €150) lub flat €99–179/mies. | Billing NIE jest wymagany na MVP (faza gratis); architektura cenowa przygotowana, ale nieaktywna. WTP nie jest walidowane w fazie pilotowej. |
| **#11** | Hotel = administrator danych (ADM), platforma = procesor. DPA z każdym hotelem przed pierwszym wdrożeniem, bez wyjątków. | DPA jest blokerem go-live: hotel nie może dostać aktywnych QR bez podpisanego DPA. UUID nie zwalnia z DPA. |
| **#14** | Rygorystyczna definicja sukcesu: 3 z 3 warunków jednocześnie (≥30% QR adoption/dobę + ≥10% upsell conversion + hotel kontynuuje po 3 mies.). | Stack analityczny musi mierzyć wszystkie 3 warunki od dnia 1. Kryteria kill zdefiniowane przed testem. |
| **#15** | Pilot: 3 hotele × 6 tygodni w ramach Lighthouse. 2 boutique + 1 mid-size. Tyg. 1–2 setup, tyg. 3–6 dane. Min 50–100 aktywnych gości/hotel. | Harmonogram pilotu i progi statystyczne są twarde. Separacja product-fit od implementation-fit obowiązkowa. |

Decyzje powiązane z wcześniejszych sesji (kontekst): #3 (Owner = billing = ADM), #5 (charge to room, brak bramki płatniczej → brak PCI DSS scope), #8 (transparentność AI — EU AI Act), #9 (hotel odpowiada za treść, platforma za uptime/delivery), tech stack T2 (Supabase + RLS po `property_id`), T4 (Railway → Fly.io waw; SSE; Vercel wykluczony).

---

## 1. Proces onboardingu hotelu

### 1.1 Cel i model

- **Cel:** 48h od podpisania umowy do *first value* (pierwsze aktywne QR + gość może złożyć zamówienie). Źródło: Sesja 5 (korekta z 3 dni roboczych z Sesji 2).
- **Model:** auto-setup + jeden kickoff call 30 min (nie white-glove, nie blank canvas). Źródło: hotel-saas-onboarding-patterns.md sekcja 2 (hybrydowy model dla SMB: 30-min kickoff zamiast 90-min szkolenia + preloaded templates).
- **Zasada nadrzędna:** **template-first + guided in-app wizard**, nie zewnętrzna dokumentacja ani wideo na YouTube (R3). Wizard wbudowany w panel: 5–7 kroków, każdy krok = 1 akcja + krótki opis korzyści (benefit framing), progress bar.

### 1.2 Kroki procesu, odpowiedzialności, automatyzacja

Kolejność oparta na hybrydowym wzorcu (Duve/Canary 2023–2025) zaadaptowanym do MVP bez PMS (CSV import zamiast PMS sync — patrz Sesja 1/2).

| # | Krok | Odpowiedzialny | Automatyzacja | Priorytet |
|---|---|---|---|---|
| 1 | Signup + utworzenie konta hotelu (email hotelowy, nie prywatny); Owner = ADM | Hotel (self-service) | Pełna (formularz) | **MUST** |
| 2 | **Podpisanie DPA** (warunek konieczny — patrz §3) | Hotel + Platforma | Półautomat (e-podpis, np. DocuSign/Adobe Sign) | **MUST** |
| 3 | Kickoff call 30 min — konfiguracja profilu hotelu razem z hotelem | Platforma (CSM) + Hotel | Manualny (call) | **MUST** |
| 4 | Import gości CSV (`imię, email, nr pokoju, check_in, check_out`) → rekordy rezerwacji + tokeny sesji | Hotel wgrywa → platforma parsuje | Pełna (parser CSV); error handling z jasnym komunikatem | **MUST** |
| 5 | Generowanie QR: rotujący QR recepcji + statyczne QR pokoi (PDF do druku) | Platforma generuje, hotel drukuje | Pełna (button w panelu / PDF) | **MUST** |
| 6 | Aktywacja ≥3 usług z biblioteki szablonów (hotel wybiera + wpisuje cenę) | Hotel (guided wizard) | Template library — hotel edytuje, nie tworzy od zera | **MUST** |
| 7 | Seedowanie bazy wiedzy AI ze strony www hotelu (Q&A) | Platforma seeduje, hotel weryfikuje | Półautomat (scrape + edycja) | **MUST** |
| 8 | Wysłanie testowego szablonu welcome do testowego gościa | Hotel (wizard) | Pełna (test booking generator) | **MUST** |
| 9 | Przeszkolenie ≥1 staff (recepcja) — obsługa inbox zamówień + zmiana statusu | Platforma (w trakcie kickoff lub async) | Półautomat (krótkie video/GIF w panelu) | **MUST** |
| 10 | Health check tydzień 1 — czy są QR scans, czy jest adopcja | Platforma (founder dashboard) | Pełna (PostHog Pulse + alert) | **SHOULD** |

> **Uwaga RODO:** krok 2 (DPA) jest twardym gate'em przed krokiem 5 (aktywacja QR). Bez podpisanego DPA hotel nie otrzymuje aktywnych QR (HITL #11). Wymagana flaga w schemacie: `hotel.dpa_signed_at` — generowanie aktywnych QR zablokowane gdy NULL.

### 1.3 Definition of Done — 4 warstwy (gate aktywacji hotelu)

Hotel jest "aktywowany" gdy **wszystkie 4 warstwy** są spełnione. Każda pozycja musi być mierzona jako binary flag w bazie (health score per hotel — patrz R4).

| Warstwa | Kryterium | Pole/event do śledzenia |
|---|---|---|
| **Tech** | QR aktywne (recepcja + pokoje) **ORAZ** import CSV gości zakończony | `qr_codes.active = true`, `reservations` count > 0 |
| **Communication** | Szablon welcome wysłany (test do gościa) | `welcome_template_sent_at` |
| **Product** | ≥3 usługi aktywne **ORAZ** baza wiedzy AI seeded | `services` count ≥ 3 AND `is_active`, `knowledge_chunks` count > 0 |
| **Ops** | ≥1 staff przeszkolony (potrafi samodzielnie obsłużyć zamówienie przez system) | `staff_training_completion = true` dla ≥1 użytkownika roli Staff |

> Pole `staff_training_completion` jest jednocześnie gate'em walidacji produktu (patrz §5.4) — jeśli false, dane hotelu są wykluczane z oceny product-fit.

### 1.4 Bottlenecki i mitygacja

Źródło: hotel-saas-onboarding-patterns.md sekcje 3, 8 + Sesja 5.

| Bottleneck | Opis | Mitygacja w MVP |
|---|---|---|
| **Brak treści** | Hotel musi za dużo stworzyć (opisy usług, FAQ, ceny) → porzucenie ("pusta kartka") | Template-first: ≥5 szablonów usług + seedowanie FAQ ze strony www przez platformę. Hotel edytuje, nie tworzy. |
| **Rotacja personelu** | Rotacja 30–50%/rok → champion odchodzi, wiedza znika | Offboarding = dezaktywacja (nie usunięcie) — audit trail; guided wizard pozwala nowemu staff szybko wejść; ≥1 przeszkolony to minimum, rekomendacja: champion + backup. |
| **Brak IT** | SMB nie ma działu IT, GM = Revenue + Ops Manager | Zero wymaganej integracji PMS na MVP (CSV import); QR generowane przez platformę jako PDF; auto-setup eliminuje konfigurację techniczną. |

### 1.5 Offboarding

Źródło: hotel-saas-onboarding-patterns.md sekcja 6 + Sesja 5 + rodo-dpa-requirements.md §1.8/§6.

- **Export danych:** CSV na żądanie hotelu (zamówienia + baza wiedzy AI) — standardowa funkcja **od dnia 1** (przycisk w panelu, nawet jeśli obsługiwany manualnie w MVP). **MUST.**
- **Retencja po zakończeniu umowy:** 30 dni na pobranie danych, potem usunięcie. Backupy nadpisane/usunięte nie później niż 60 dni od rozwiązania umowy (klauzula DPA §1.8).
- **Gość:** token sesji wygasa automatycznie (checkout + 2h) — brak danych do usunięcia po stronie gościa.
- **Wyjątki retencyjne:** dane zamówień przechowywane 5 lat (obowiązek podatkowy, art. 112 ustawy o VAT) — nie podlegają usunięciu na żądanie; logi serwera 30 dni.
- **Zasada:** export PRZED wyłączeniem konta (anty-wzorzec: "wyślij żądanie i czekaj" gdy konto już nieaktywne).

### 1.6 Struktura Customer Success

Źródło: hotel-saas-onboarding-patterns.md sekcja 7 + Sesja 5.

- **Ratio:** 1–2 CSM na 40–60 hoteli (segment 30–80 hoteli; "Startup/Early Stage").
- **Najwyższy churn:** pierwsze 90 dni + zmiana GM → CS musi zareagować w 48h.
- **Narzędzia MVP:** prosta forma "weekly hotel status" (Airtable/Notion) wystarczy zamiast Gainsight do ~80 hoteli; founder dashboard (PostHog) jako health score.
- **Trigger-based interventions (SHOULD):** health score < 60% po 14 dniach → outreach 24h; brak QR scans przez 7 dni po go-live → call; upsell revenue = 0 po 30 dniach → proaktywna konsultacja.

---

## 2. Model cenowy i warunki SLA

### 2.1 Faza Lighthouse (MVP) — HITL #10

- **3–5 hoteli gratis przez 3–6 miesięcy** w zamian za: case study + referencje + prawo do wywiadu.
- Standard rynkowy (Duve, Oaky, Canary) — pilot bez free tier permanentnego.
- **Implikacja dla implementacji:** billing/płatności **NIE są budowane na MVP**. Architektura cenowa (poniżej) jest przygotowana koncepcyjnie, ale nieaktywna. WTP (willingness to pay) NIE jest walidowane w fazie pilotowej — weryfikacja dopiero przy przejściu na model płatny.
- Permanent freemium NIE jest standardem w hospitality SaaS (koszt onboardingu zbyt wysoki) — nie wprowadzać.

### 2.2 Model po fazie Lighthouse (nie-MVP, do przygotowania architektonicznego)

| Element | Wartość | Uzasadnienie / źródło |
|---|---|---|
| Per-room | €5–8/pokój/mies. (min. €150/mies.) | Benchmark: HiJiffy €4 (chatbot-only), Duve $6–7 (full app) |
| Alternatywa flat | €99–179/mies. property-based | Łatwiejsze do sprzedania małym hotelom; "no-brainer addition" do stacku €420–900/mies. |
| Setup fee | **€0** (zero setup fee) | Decyzja Sesji 5; obniża barierę wejścia |
| White-glove onboarding | €199 (opcja; waiver przy umowie rocznej) | Dodatkowa monetyzacja wsparcia (HITL #4) |
| Dyskonto roczne | 15–20% | Standard rynkowy |
| **AI concierge** | **Included we wszystkich planach (NIE add-on)** | Trend rynkowy 2024–2025 (HiJiffy Aplysia 3, Duve); koszt AI ~$2,59/hotel/mies. <1% ceny SaaS |

> **Założenie projektowe:** AI jest wbudowane, nie jako oddzielny SKU. Brak feature-flag "AI on/off" jako element cenowy — AI jest częścią rdzenia produktu.

### 2.3 SLA

Źródło: saas-pricing-hospitality.md sekcja 5 + Sesja 5.

| Parametr | MVP | Growth/Pro |
|---|---|---|
| Uptime | **99,5%** (standard early-stage SaaS) | 99,9% (mid/enterprise) |
| Resolution critical | 4h | 4h |
| Backup | Daily (recovery < 4h) | Daily |
| Support | Email w 24h | Email + chat w 4h |

- **Monitoring SLA (od dnia 1):** Better Stack ($24/mies.) — uptime, log aggregation, alerty na próg 99,5%. Sentry (free) — błędy JS i server-side. Źródło: Sesja 6 monitoring stack.
- **Implikacja:** automaty retencji (cron jobs) i monitoring muszą działać przed pierwszym wdrożeniem produkcyjnym (patrz §3.5).

---

## 3. RODO / DPA — wymagania implementacyjne

Źródło: rodo-dpa-requirements.md + Sesja 5. **Uwaga: nie stanowi porady prawnej — wymagana weryfikacja przez radcę prawnego RODO przed podpisaniem umów.**

### 3.1 Model ról — HITL #11

- **Hotel = administrator danych (ADM)**, platforma = **procesor**.
- DPA z każdym hotelem **przed pierwszym wdrożeniem** — bez wyjątków (gate go-live).
- Opaque UUID **nie zwalnia** z DPA (hotel łączy token z rezerwacją po swojej stronie; imię + token + pokój = dane osobowe w kontekście hotelowym — TSUE C-434/16).
- Owner konta hotelu = osoba podpisująca DPA (HITL #3).

### 3.2 Obowiązkowe klauzule DPA hotel↔platforma (Art. 28 RODO) — 8 klauzul

Implementacja: przygotować wzorzec DPA jako załącznik do umowy SaaS. **Rekomendacja: użyć Standardowych Klauzul Umownych KE (Decyzja 2021/915)** — automatycznie spełniają Art. 28 ust. 3, minimalizują negocjacje i przyspieszają onboarding.

1. Przedmiot i cel przetwarzania (dane rezerwacji, sesje gości, zamówienia, treść zapytań AI)
2. Zakaz przetwarzania w innych celach (krytyczne przy AI — opt-out trenowania modeli)
3. Lista sub-procesorów + **15-dniowy notice** przy zmianach (najkrótszy termin w łańcuchu — patrz §3.3)
4. Techniczne i organizacyjne środki bezpieczeństwa (TLS 1.2+, AES-256, pseudonimizacja)
5. Mechanizm breach notification (**24h platforma → hotel**)
6. Retencja per kategorię danych (tabela §3.4)
7. Prawo hotelu do audytu (dopuszczalne przez certyfikaty ISO 27001 / SOC 2 Type II zamiast inspekcji)
8. Usunięcie danych po zakończeniu umowy (30 dni na export, potem delete; backupy do 60 dni)

> **Sankcja za brak DPA:** Art. 83 ust. 4 — do €10M lub 2% globalnego obrotu. Brak DPA to samodzielne naruszenie, niezależne od wystąpienia wycieku.

### 3.3 Łańcuch sub-procesorów + notice

Wykaz sub-procesorów (do opublikowania pod URL, aktualizowany przy każdej zmianie):

| Sub-procesor | Funkcja | Notice o zmianach |
|---|---|---|
| Anthropic / OpenAI | LLM (AI concierge) | Anthropic: **15 dni**; OpenAI: 30 dni |
| Hosting (Railway → Fly.io waw) | Infrastruktura | wg DPA dostawcy |
| PostHog EU Cloud | Analityka | wg DPA PostHog |
| Supabase | Baza/Auth/Storage | wg DPA Supabase |
| Upstash Redis | Semantic cache + rate limiting | wg DPA dostawcy |
| Sentry | Monitoring błędów | wg DPA Sentry |

- **Własny notice hotelowi: 15 dni** (wyrównanie do najkrótszego terminu w łańcuchu — Anthropic). EDPB Opinion 22/2024: platforma musi **proaktywnie** informować hotel o sub-procesorach (nie tylko na żądanie).
- **DPA z każdym sub-procesorem obowiązkowe przed wdrożeniem produkcyjnym** (Anthropic: e-podpis przez privacy.claude.com; PostHog, Supabase, Sentry, hosting: zaakceptować online).
- **Minimalizacja PII do LLM:** nie wysyłać do AI pełnych danych identyfikacyjnych/numerów pokoi/dat; imię wstrzykiwane po stronie platformy. CJEU IX 2025: UUID może być nieosobowe dla sub-procesora LLM jeśli brak klucza mapowania i brak PII w prompcie — **decyzja architektoniczna do udokumentowania**.

### 3.4 Retencja per kategoria danych (automaty cron — MUST przed go-live)

| Kategoria | Retencja | Podstawa | Automat |
|---|---|---|---|
| Token sesji + dane sesji | checkout + 2h (wygaśnięcie) → usunięcie w 48h | Art. 6(1)(b) | cron job |
| Imię gościa (UX) | czas sesji (checkout + 2h) | Art. 6(1)(b) | z sesją (rekomendacja: tylko sessionStorage klienta) |
| Logi serwera (IP) | 30 dni | Art. 6(1)(f) | log rotation; anonimizacja IP na load balancerze |
| Dane zamówień | **5 lat** | Art. 6(1)(c) — prawo podatkowe | cron po 5 latach |
| Historia AI chat | checkout + 7 dni | Art. 6(1)(b) | cron job |
| Eventy PostHog (`guest_id`) | **90 dni** (`guest_id` purge po 30 dniach) | — | PostHog retention + transformation |
| Dane zanonimizowane/agregowane | bezterminowo | nie dotyczy | — |

### 3.5 Breach notification chain (procedura przed go-live — MUST)

```
Naruszenie wykryte przez platformę (procesor)
  → ocena incydentu (max kilka h)
  → PLATFORMA → HOTEL: max 24h (email + telefon do kontaktu RODO hotelu)
  → HOTEL → UODO: max 72h od stwierdzenia (jeśli ryzyko dla praw i wolności)
  → HOTEL → GOŚCIE: bez zbędnej zwłoki (jeśli wysokie ryzyko)
```

- Zbierać dane kontaktowe osoby ds. RODO w każdym hotelu **przy onboardingu**.
- Prowadzić wewnętrzny rejestr incydentów (procesor) + rejestr czynności przetwarzania per hotel (Art. 30 ust. 2).
- Wyciek opaque UUID bez PII → niskie ryzyko (zwykle bez zgłoszenia); wyciek imię+pokój+daty+zamówienia → zgłoszenie + powiadomienie gości.

### 3.6 Pomoc w realizacji praw gości (Art. 28 ust. 3 lit. e)

- Mechanizm **eksportu i usunięcia danych konkretnego gościa** na żądanie hotelu — w panelu lub przez API (MVP: dopuszczalny manualny przez support, ale przycisk widoczny).
- Usunięcie z PostHog: `POST /api/event/?distinct_id=<guest_id>&delete=true` (custom script); zagregowane kohorty nie cofają się — udokumentować.

---

## 4. Stack analityczny i lista eventów (od dnia 1)

### 4.1 Narzędzie i zgodność RODO

- **PostHog EU Cloud** (Sesja 6, Sesja 7). Free tier < 1M eventów/mies. (wystarczy na MVP). Dane w EU → RODO compliant; PostHog = sub-procesor → **DPA z PostHog obowiązkowe** (jak Anthropic DPA).
- **Konwencja nazewnictwa:** `verb_noun` snake_case; właściwości `object_adjective`; booleany `is_`, daty `_timestamp`/`_date`. Wersjonować tracking plan w Git.
- **RODO dla eventów:**
  - `guest_id` = **opaque server-side UUID** (nie email/imię/pokój); retencja 90 dni, purge po 30 dniach.
  - **Brak PII** w properties, URL-ach, nazwach eventów.
  - Capture **server-side** (unika PII klienta).
  - **Consent banner** dla gości: "Mierzymy użycie bez danych osobowych"; respektować `navigator.doNotTrack === "1"` (skip capture).
  - Brak eksportu strumieni do narzędzi marketingowych (Segment itp.).

### 4.2 10 core events od dnia 1

Źródło: Sesja 7 (tabela 10 core events) + analytics-stack-mvp.md.

| Lejek | Event | Kluczowe właściwości | Priorytet |
|---|---|---|---|
| Hotel operator | `hotel_login` | `days_since_signup`, `login_method` | **MUST** |
| Hotel operator | `hotel_settings_updated` | `setting_type` | **MUST** |
| Hotel operator | `guest_order_received` | `order_value`, `hotel_id` (GROUP) | **MUST** |
| Gość — top funnel | `guest_qr_scanned` | `hotel_id`, session UUID (opaque) | **MUST** |
| Gość — browse | `guest_item_details_opened` | `item_id`, dwell time | **MUST** |
| Gość — konwersja | `guest_order_submitted` | `order_value`, `fulfillment_type`, session UUID | **MUST** |
| Gość — retention | `guest_session_returned` | 7/30-day cohort flag | **MUST** |
| AI concierge | `concierge_query_submitted` | `category_detected`, `hotel_id` | **MUST** |
| AI concierge | `concierge_response_delivered` | `confidence_score`, latency ms | **MUST** |
| AI concierge | `concierge_response_escalated` | fallback trigger | **MUST** |

**Properties dodatkowe do separacji product-fit (SHOULD):** `staff_training_completion` (bool, gate), `hotel_promotion_activity` (count emaili/signage/front-desk) — patrz §5.4.

### 4.3 Group Analytics i moment upgrade

- `hotel_id` musi być wysyłany jako **group property** w każdym evencie od dnia 1 (umożliwia późniejszą kohortyzację bez retroaktywnej migracji).
- **PostHog Group Analytics wymaga paid tier.** Na free tier: używać tagów/filtrów + SQL drill-down. **Moment upgrade:** gdy potrzebna formalna kohortyzacja hoteli (porównanie hotel A vs B side-by-side) — typowo przy >3 hotelach lub gdy free tier insights przestają wystarczać. Zaplanować jako koszt fazy pilotowej.

### 4.4 Automatyczny pomiar jakości AI concierge (bez manualnego review)

Źródło: Sesja 7 + analytics-stack-mvp.md.

- **Containment rate** (% queries bez eskalacji): target 40–65% (Gartner 2025); **alert gdy escalation > 35%**.
- **Response latency:** alert jeśli > 5s end-to-end; target < 1,5s (streaming SSE poprawia perceived).
- **Confidence score histogram** per kategoria: alert gdy avg < 0,6 (sygnał niekompletnej bazy wiedzy).
- **Downstream action rate:** czy gość składa zamówienie w ciągu 2 min po odpowiedzi concierge.
- **Response length outliers:** alert gdy > 500 znaków (hallucination risk) lub < 10 znaków (truncation).
- **Monthly spot-audit:** 10 próbek/hotel (5 eskalowanych + 5 high-confidence) — kalibracja progów bez pełnego audytu.

> **Uwaga implementacyjna (Sesja 7, otwarte):** zweryfikować czy GPT-4o-mini zwraca `logprobs` dla `confidence_score`, czy lepiej użyć heurystyki (długość odpowiedzi + czy fallback triggered).

### 4.5 Dashboard founder

| Dashboard | Częstotliwość | Zawartość | Alert |
|---|---|---|---|
| **Pulse** | Daily (5 min) | gości online (1h), zamówień/24h, QR scans/24h, concierge queries/24h, escalation rate/24h, hotel operators aktywnych 7d | gości < 5 = down; zamówienia/QR down >20–30%; escalation >35%; operators <60% = churn |
| **Growth** | Weekly (piątek) | guest funnel (QR→item details→cart→checkout→order), cohort activation hoteli wg wieku (7/14/30d), AI performance per kategoria, top/bottom hotel comparison, repeat order rate | — |

Format Pulse: liczby, nie wykresy; kolor zielony stabilny / czerwony spadek >20%.

---

## 5. Definicja sukcesu MVP

### 5.1 Kryteria sukcesu — HITL #14 (rygorystyczny 3/3)

**Wszystkie trzy warunki muszą być spełnione jednocześnie:**

| # | Typ | Warunek | Okno pomiaru |
|---|---|---|---|
| 1 | **Leading** | ≥30% gości skanuje QR w ciągu doby 1. pobytu | tydzień 1–7 |
| 2 | **Lagging** | ≥10% konwersja upsell (≥1 zamówienie na 10 aktywnych gości) | tydzień 4–6 |
| 3 | **Retention** | Hotel kontynuuje po 3 mies. bez wyraźnego "stop" (nie rezygnuje po Lighthouse) | miesiąc 3 |

Cele uzupełniające (SHOULD, nie kill): session depth ≥2 sekcje/sesja; retention gościa ≥40% (wraca 2+ razy podczas pobytu).

### 5.2 Kryteria kill (co oznacza "nie iść dalej")

- **<15% adoption QR po 14 dniach** (przy aktywnej promocji hotelu) → problem produktowy.
- **0 zamówień przez appkę po 30 dniach** → problem value proposition.
- **Hotel prosi o wyłączenie przed końcem 6 tygodni** → implementation lub product fail.

### 5.3 Skala i harmonogram pilotu — HITL #15

- **3 hotele × 6 tygodni** (w ramach Lighthouse Program; dywersyfikacja: **2 boutique + 1 mid-size**; różne geografie — catch implementation variation).
- **Tygodnie 1–2:** setup, training personelu, pierwsze QR aktywne.
- **Tygodnie 3–6:** aktywny okres używania przez gości (2–3 cykle rotacji).
- **Min. 50–100 aktywnych gości/hotel** dla statystycznej sensowności (poniżej 30–40 sygnały zbyt zaszumione).
- **Po 6 tygodniach:** decyzja go/no-go na podstawie leading + lagging metrics.

> **Rozbieżność do odnotowania:** mvp-validation-frameworks.md rekomenduje 90 dni pilotu jako standard branżowy; HITL #15 ustala 6 tygodni zbierania danych. **Obowiązuje HITL #15** (6 tygodni), ale warunek sukcesu #3 (retencja) mierzy się w horyzoncie 3 miesięcy — pilot zbiera dane przez 6 tyg., decyzja o retencji zapada w mies. 3.

### 5.4 Separacja product-fit od implementation-fit

Źródło: mvp-validation-frameworks.md + Sesja 7. Problem confounding variable: niska adopcja może oznaczać (A) produkt nie rozwiązuje potrzeby (product-fit fail) lub (B) hotel źle wdrożył/nie promował (implementation-fit fail).

**Gate i tracking:**
- `staff_training_completion` (gate) — jeśli false → **dane hotelu wykluczone z walidacji produktu** (implementation setup failed).
- `hotel_promotion_activity` — count: emaile/signage/front-desk mentions.
- **Diagnostyka:**
  - Wysoka świadomość gości + niska adopcja = problem UX (**product-fit fail**).
  - Niska świadomość gości = problem promocji (**implementation-fit fail**).
  - Wysoki staff activation + niski guest activation = promotion gap.
- **Reguła przy zróżnicowanej jakości wdrożenia:** stratyfikować dane (analizować dobre wdrożenia osobno, flagować outliery — np. 1 hotel ze słabym WiFi/niezmotywowanym staffem nie zaniża średniej dla 2 dobrych).

### 5.5 Metryki leading vs lagging

| Typ | Kiedy | Co | Próg |
|---|---|---|---|
| **Leading** (steruj wcześnie) | tydzień 1–7, sprawdzane co tydzień | staff trained %, staff app opens, guest QR scans, guest first activation, session duration | ≥30% guest activation w 7 dni; red flag: guest activation <15% w dniu 7 |
| **Lagging** (potwierdź wartość) | tydzień 4–8, sprawdzane miesięcznie | repeat usage %, upsell conversion, NPS/CSAT, staff satisfaction, redukcja front desk inquiries | repeat ≥40%; NPS ≥40; staff sat ≥4/5 |

**Feedback loop (jakościowy):** tygodniowe synce z hotel championem (staff adoption owner + GM); biweekly data review (early warning na spadek engagement); exit survey gościa (5 pytań, <2 min: świadomość, użycie, NPS); monthly 10-sample audit AI.

**Częste błędy do uniknięcia (false positives/negatives):** concierge effect (mierz użycie, nie satysfakcję tuż po intro); curiosity vs intent (śledź repeat usage, nie installs); small sample illusion (min 3 hotele); too-short timeline (sprawdzaj leading w dniu 14, nie 7); implementation failing silently (weryfikuj health integracji co tydzień).

### 5.6 Benchmarki upsell (kontekst dla progu #2)

Źródło: hotel-upsell-benchmarks.md.

- **10–25% konwersja pre-arrival** (golden window 48–72h przed przyjazdem); in-stay niższe; przy booking 2–5%.
- **Early check-in / late checkout = #1 konwertująca kategoria** (>Spa, >Room service, >Transfer). Room upgrades #2.
- **Digital upsell: 4x wyższy conversion niż front-desk** (Canary 2025) — dzięki spójnemu timingowi, personalizacji, braku presji.
- Revenue per guest: Oaky €35–200/mies. dla dojrzałych programów; **realistyczny cel MVP: €5–15/pobyt/gość**.
- Próg #2 (≥10% upsell conversion) jest **konserwatywny** względem benchmarku pre-arrival (10–25%), co jest uzasadnione: nasz upsell jest in-stay (sekcja "Polecamy" + AI sugeruje), nie pre-arrival — niższy z natury, ale wzmocniony efektem digital 4x vs front-desk.

---

## Krytyczne ścieżki do pokrycia testami

Minimalne scenariusze integracyjne/e2e wynikające z tego fragmentu (do uwzględnienia w sekcji 9 finalnego roadmapu):

1. **Onboarding gate:** próba generowania aktywnych QR bez `dpa_signed_at` → zablokowane.
2. **Definition of Done:** hotel z <3 usługami / bez seedu AI / bez przeszkolonego staff → nieaktywowany (4 warstwy).
3. **Retencja (cron):** sesja po checkout+2h → token unieważniony; po checkout+48h → dane sesji usunięte; AI chat po checkout+7d → usunięty; logi po 30d → usunięte.
4. **Eventy PostHog:** każdy z 10 core events emitowany server-side, `guest_id` opaque, brak PII w properties, `hotel_id` jako group property.
5. **Breach/consent:** consent banner respektuje `doNotTrack`; mechanizm usunięcia danych gościa per `guest_id`.
6. **Separacja product/implementation:** `staff_training_completion = false` → dane hotelu flagowane jako wykluczone z walidacji.

---

## Otwarte kwestie do rozstrzygnięcia przy implementacji

- **Confidence score AI:** weryfikacja `logprobs` GPT-4o-mini vs heurystyka (§4.4).
- **Moment upgrade PostHog** do paid tier (Group Analytics) — koszt fazy pilotowej (§4.3).
- **White-glove €199:** czy realizuje team wewnętrzny czy partner zewnętrzny (decyzja operacyjna, Sesja 5).
- **Wzorzec DPA:** rekomendowane SCC KE 2021/915 — wymaga weryfikacji przez radcę prawnego RODO przed pierwszym podpisem.
- **Rozbieżność czasu pilotu:** 6 tyg. (HITL #15) vs 90 dni (research) — obowiązuje HITL #15, retencja mierzona w mies. 3 (§5.3).
