# Decisions Log — Hotel Guest App MVP
*Żywy dokument. Aktualizuj po każdej sesji roboczej.*
*Ostatnia aktualizacja: —*

---

## Jak używać tego dokumentu w Claude Code

### Kontekst na start każdej sesji
Wklej lub dołącz do sesji:
1. `product-philosophy-brief.md` — niezmienne "dlaczego"
2. `research_roadmap.md` — mapa sesji i rejestr HITL
3. Ten plik — aktualne decyzje i stan projektu

### Subagenty — kiedy i jak używać

Każda sesja robocza może zawierać zadania badawcze które warto zrównoleglić.
Oznaczono je jako **[SUBAGENT]** poniżej przy każdej sesji.


**Uruchomienie subagentów w sesji:**
```
Uruchom równolegle jako subagenty w tle:
- Subagent 1: [nazwa] — [zadanie] → zapisz wynik do research/[plik].md
- Subagent 2: [nazwa] — [zadanie] → zapisz wynik do research/[plik].md
- Subagent 3: [nazwa] — [zadanie] → zapisz wynik do research/[plik].md
Kontynuuj główną sesję. Zsyntezuj wyniki gdy wszystkie skończą.
```

---

## Struktura katalogów projektu

```
/projekt
├── CLAUDE.md                    ← instrukcje dla Claude Code
├── context/foundation
│   ├── product-philosophy-brief.md
│   ├── research_roadmap.md
│   └── decisions_log.md         ← ten plik
└── context/research/
    ├── session_01/
    ├── session_02/
    └── ...
```

---

## Rejestr decyzji HITL

| # | Sesja | Decyzja | Status | Wynik | Data |
|---|---|---|---|---|---|
| 1 | Identity | Dane osobowe gościa: token anonimowy vs dane osobowe | ✅ zamknięta | Token anonimowy + DPA z każdym hotelem + imię gościa (tylko personalizacja UX) | 2026-06-25 |
| 2 | Identity | Czas życia sesji gościa | ✅ zamknięta | Fixed expiry = checkout_datetime + 2h | 2026-06-25 |
| 3 | Panel | Właściciel danych po stronie hotelu | ✅ zamknięta | Owner = billing = data owner (ADM). Osoba zakładająca konto = odpowiedzialna za DPA z platformą | 2026-06-25 |
| 4 | Panel | Zakres panelu na MVP vs manual onboarding | ✅ zamknięta | Maksymalny self-service + wsparcie jako opcja płatna (dodatkowa monetyzacja) | 2026-06-25 |
| 5 | Interfejs | Płatności: rachunek do pokoju vs bramka na MVP | ⬜ otwarta | — | — |
| 6 | Interfejs | Granica upsell vs doświadczenie gościa | ⬜ otwarta | — | — |
| 7 | AI | Concierge: tylko informuje czy wykonuje akcje? | ⬜ otwarta | — | — |
| 8 | AI | Transparentność AI wobec gościa | ⬜ otwarta | — | — |
| 9 | AI | Odpowiedzialność za jakość odpowiedzi concierge | ⬜ otwarta | — | — |
| 10 | SaaS | Model cenowy MVP: płatny czy free dla pierwszych hoteli? | ⬜ otwarta | — | — |
| 11 | SaaS | Administrator danych gości: platforma czy hotel? | ⬜ otwarta | — | — |
| 12 | Tech | Build vs buy dla komponentów AI | ⬜ otwarta | — | — |
| 13 | Tech | Zespół: zewnętrzny vs własny | ⬜ otwarta | — | — |
| 14 | Metryki | Definicja sukcesu MVP przed testami | ⬜ otwarta | — | — |
| 15 | Metryki | Skala testu: ile hoteli, ile tygodni | ⬜ otwarta | — | — |

**Statusy:** ⬜ otwarta · 🔄 w toku · ✅ zamknięta · 🚫 odroczona

---

## Sesja 1 — Tenant & Identity Model
*Status: ✅ zamknięta — 2026-06-25*

### Subagenty uruchomione [SUBAGENT]
- `rodo-analysis.md` — wymagania RODO, token sesji vs dane osobowe, ADM vs procesor ✅
- `qr-auth-patterns.md` — Token Exchange, Step-Up Auth, JWT vs Opaque, edge cases ✅
- `pms-integration-landscape.md` — krajobraz PMS, MVP bez PMS, model tożsamości ✅

### Ustalenia z sesji

**Model tożsamości:**
- Platforma operuje na opaque UUID token (niepowiązany z danymi osobowymi po stronie platformy)
- Imię gościa przechowywane przez platformę — wyłącznie do personalizacji UX (np. "Witaj, Jan")
- Hotel jest administratorem danych gościa; platforma = procesor → DPA z każdym hotelem (standard)
- Model identyfikacji: hotel wgrywa dane gości → magic link na email → token weryfikuje tożsamość
- Fallback: numer rezerwacji + nazwisko + data check-in (bez linku)

**Model tokenu QR:**
- Wzorzec: Token Exchange — URL zawiera jednorazowy init_token (15 min TTL), wymieniany na `__Host-session` cookie `HttpOnly; Secure; SameSite=Strict`
- Opaque token (UUID), nie JWT — rewokacja natychmiastowa, prostszy audyt
- QR recepcji: rotujący co 5 minut | QR pokoju: statyczny przez pobyt (jak karta hotelowa)
- Dwuetapowa weryfikacja = Step-Up Auth: `auth_level` 0 → 1 (recepcja) → 2 (pokój)
- Sesja: `checkout_datetime + 2h` (fixed expiry) | iOS >7 dni: silent re-auth przez QR pokoju

**Struktura tabel bazy:**
- `sessions(session_id, reservation_id, room_id, auth_level, expires_at, revoked)`
- `reservations(id, hotel_id, guest_email, guest_first_name, room_number, check_in, check_out, invite_token)`

**Integracje PMS:**
- MVP bez PMS: CSV import + manual entry w panelu hotelowym
- Enhancement (nie prerequisite): webhook dla Mews/apaleo przy gotowych hotelach
- Integracje legacy PMS (Oracle Opera, Protel): faza 6–18 miesięcy; middleware Hapi.travel lub Impala jako fast-path przy skalowaniu

**RODO:**
- IP w logach = dane pseudonimowe → anonimizacja IP na load balancerze jako best practice
- Retencja: sesja → checkout + 48h; logi serwera → 30 dni; dane zamówień → 5 lat
- Treść wiadomości AI concierge: nielogowana po stronie platformy (lub pseudonimizowana)
- Provider AI (Anthropic/OpenAI) = sub-procesor → DPA z providerem wymagane

### Zamknięte decyzje HITL
- ✅ HITL #1: Token anonimowy + DPA + imię gościa wyłącznie do UX
- ✅ HITL #2: Fixed expiry = checkout_datetime + 2h

### Otwarte pytania do następnej sesji
- Jak panel hotelowy zarządza importem gości (CSV vs manual vs webhook)? → Sesja 2
- Kto po stronie hotelu jest właścicielem danych w panelu i może rewokować tokeny? → Sesja 2
- Jak platforma generuje i rotuje QR kody dla recepcji? → Sesja 2 (zarządzanie QR)

---

## Sesja 2 — Panel Hotelowy
*Status: ✅ zamknięta — 2026-06-25*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: cms-for-hotels
Zbadaj jak podobne produkty (Zingle, Hapi Hotel, Duve, Canary Technologies)
rozwiązały panel zarządzania treścią dla hoteli. Skup się na: minimalny zakres
panelu który umożliwia działanie produktu, najczęstsze problemy z adopcją
przez personel hotelowy, onboarding — co można zastąpić CSV importem lub
manualną konfiguracją przez team platformy na MVP.
Zapisz wynik do research/session_02/hotel-cms-benchmarks.md

Subagent 2: rbac-saas-patterns
Zbadaj wzorce ról i uprawnień (RBAC) w SaaS dla branży hotelarskiej.
Skup się na: typowe role w hotelu (GM, recepcja, F&B, housekeeping),
granulacja uprawnień na MVP vs v2, jak zarządzać dostępem gdy hotel
ma rotację pracowników, multi-property (sieć hotelowa vs pojedynczy hotel).
Zapisz wynik do research/session_02/rbac-hotel-patterns.md

Subagent 3: hotel-analytics-needs
Zbadaj jakich danych analitycznych hotele faktycznie używają i za co płacą.
Skup się na: metryki które interesują dyrektora hotelu vs managera F&B,
formaty raportów (dashboard live vs email dzienny vs eksport CSV),
benchmarki branżowe RevPAR, upsell rate — jak je prezentować w kontekście appki.
Zapisz wynik do research/session_02/hotel-analytics-needs.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji

**Minimalny zakres panelu — 6 modułów (wg benchmarków Duve, Oaky, Canary, ALICE):**
1. **Profil hotelu** — nazwa, adres, godziny, logo (setup jednorazowy — może robić team platformy)
2. **Zarządzanie usługami** — CRUD usług z gotowymi szablonami (hotel wybiera "Late Check-out" i wpisuje cenę)
3. **Baza wiedzy AI concierge** — lista Q&A edytowana przez hotel; inicjalnie seedowana przez team platformy ze strony www hotelu
4. **Zarządzanie QR** — generowanie QR recepcji (button), status aktywnych sesji, dezaktywacja QR pokoju
5. **Zamówienia gości** — inbox zamówień z możliwością zmiany statusu; export CSV; powiadomienie email
6. **Użytkownicy panelu** — 4 role: Owner, Admin, Staff, Viewer; invitation-based; dezaktywacja (nie usunięcie)

**Role MVP (4 role, wg wzorców Stripe/Slack/Linear):**
- **Owner** — billing + pełna administracja, wymuszone przeniesienie przed odejściem
- **Admin** — user management + konfiguracja (bez billing)
- **Staff** — operacje: zamówienia, QR, treść AI (recepcja, F&B)
- **Viewer** — tylko raporty i dashboard (Revenue Manager, właściciel nieoperacyjny)

**Zarządzanie cyklem użytkownika:**
- Zaproszenie przez token email (ważny 72h), domyślna rola: Staff
- Offboarding = dezaktywacja (nie usunięcie) — audit trail, RODO, rotacja 30-50%/rok
- Zakaz usunięcia ostatniego Ownera bez transferu ownership

**Panel konfiguracyjny vs operacyjny:**
- Dwa odrębne "tryby" panelu: setup (jednorazowy, może robić team platformy) vs operacje (codzienne, robi recepcja)
- Template-first eliminuje "syndrom pustego pola" — kluczowy wzorzec z Duve i Oaky

**Model onboardingu (wg CMS benchmarks):**
- Onboarding call 45 min (team platformy konfiguruje profil razem z hotelem)
- Team platformy seeduje FAQ ze strony www hotelu
- Team platformy generuje PDF z QR kodami dla pokoi
- Hotel aktywuje 5–8 usług z biblioteki szablonów (wybiera + wpisuje cenę)
- Cel: umowa → działający produkt w **3 dni robocze**
- Ten model działa do ~30 hoteli; przy skalowaniu wymaga pełnego self-service

**Dashboard analityczny MVP:**
- 3 osobne widoki (GM / F&B / Recepcja) — różne role, radykalnie różne potrzeby
- GM view (MUST): RevPAR + ADR + Occupancy (vs LY) + Booking pace na 7 dni
- Recepcja view (MUST): lista arrivals/departures jako lista operacyjna (bez wykresów)
- F&B view: tylko jeśli POS integracja — nie na MVP
- Biała plama rynkowa: nikt (Duve, Canary, Oaky, ALICE) nie łączy RevPAR + F&B + operacje dla SMB (20-150 pokoi)
- 67% niezależnych hoteli wciąż używa Excela — bar "wygodniejszy niż Excel" jest osiągalny

**Zarządzanie QR (ustalenia z Sesji 1 + panel):**
- QR recepcji: rotujący co 5 minut — hotel może wymusić ręczną rotację z panelu
- QR pokoju: statyczny (jak karta hotelowa), generowany przez team platformy jako PDF do druku
- Dezaktywacja QR: przycisk per pokój (przy early check-out lub zmianie pokoju)
- Status: ile aktywnych sesji na bieżącym QR recepcji — widoczny w panelu

**Import danych gości (MVP bez PMS):**
- CSV import: `imię, email, nr pokoju, check_in, check_out` — hotel eksportuje z własnego PMS lub przygotowuje w Excelu
- Platforma parsuje CSV → tworzy rekordy rezerwacji + generuje tokeny sesji
- Webhook do PMS (Mews, apaleo): enhancement post-MVP dla hoteli z nowoczesnym PMS

**Czego NIE ma na MVP (wg benchmarków):**
- Automatyczne sekwencje wiadomości (drip campaigns) — Duve-style
- Dynamiczne ceny i A/B testing ofert — Canary/Oaky-style
- Mobile app dla personelu operacyjnego — ALICE-style
- Multi-property management UI (ale `property_id` w schemacie bazy od początku)
- Integracja PMS (CSV wystarczy)
- Full P&L / GOPPAR (wymaga integracji z księgowością)

### Zamknięte decyzje HITL
- ✅ HITL #3: Owner = billing = data owner — osoba zakładająca konto jest ADM (administratorem danych) i podpisuje DPA z platformą. Konsekwencja: przy offboardingu Ownera system wymusza transfer ownership przed dezaktywacją konta.
- ✅ HITL #4: Maksymalny self-service + wsparcie jako opcja płatna — panel musi być na tyle prosty, że hotel konfiguruje sam. Wsparcie (onboarding call, seedowanie FAQ, generowanie QR PDF) dostępne jako płatna opcja, nie standard. Konsekwencja: UX panelu musi być bardzo dopracowany; template-first i guided wizard są obowiązkowe.

### Otwarte pytania do następnej sesji
- Sesja 3 (Interfejs Gościa): jak wygląda pierwsze 10 sekund po skanowaniu QR? Co gość widzi jako pierwsze w kontekście ustalonych modułów panelu?
- Sesja 4 (AI Concierge): format bazy wiedzy Q&A ustalony (lista Q&A w panelu) — jak AI concierge ją przetwarza i jakie są limity granulacji?
- Sesja 5 (SaaS): HITL #11 (ADM danych gości: platforma czy hotel?) jest już de facto zamknięte przez HITL #3 — hotel = ADM, platforma = procesor. Weryfikacja przy Sesji 5.

---

## Sesja 3 — Interfejs Gościa
*Status: ⬜ nie rozpoczęta · Wymaga: Sesja 2 zamknięta*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: guest-app-ux-benchmarks
Zbadaj UX aplikacji dla gości hotelowych — Duve, ALICE, Intelity, Canary, HiJiffy.
Skup się na: pierwsze 10 sekund po wejściu przez QR, architektura informacji
(jak kategoryzują usługi), wzorce zamawiania bez rejestracji, obsługa wielojęzyczności.
Zapisz wynik do research/session_03/guest-app-ux-benchmarks.md

Subagent 2: pwa-mobile-constraints
Zbadaj ograniczenia i możliwości PWA na urządzeniach mobilnych w 2025-2026.
Skup się na: wydajność na słabych urządzeniach, offline mode — co można cachować,
instalacja na home screen — czy warto promować, iOS vs Android różnice dla PWA,
Web Push Notifications — zgody i delivery rate.
Zapisz wynik do research/session_03/pwa-mobile-constraints.md

Subagent 3: upsell-ux-patterns
Zbadaj wzorce UX upsellingu które nie psują doświadczenia użytkownika.
Skup się na: różnica między helpful recommendation a agresywnym upsell,
przykłady z branży hotelarskiej i lotniczej (co działa, co irytuje),
timing rekomendacji (przy wejściu vs kontekstowo), A/B testy w tej dziedzinie.
Zapisz wynik do research/session_03/upsell-ux-patterns.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji
*— do uzupełnienia po sesji —*

### Zamknięte decyzje HITL
*— do uzupełnienia po sesji —*

### Otwarte pytania do następnej sesji
*— do uzupełnienia po sesji —*

---

## Sesja 4 — AI Concierge
*Status: ⬜ nie rozpoczęta · Wymaga: Sesja 2 zamknięta*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: rag-for-hospitality
Zbadaj implementacje RAG (Retrieval Augmented Generation) w branży hotelarskiej.
Skup się na: format danych wejściowych (co hotel musi przygotować i w jakiej formie),
chunking strategia dla danych hotelowych (FAQ, menu, usługi, okolica),
jak obsługiwać aktualizacje danych (hotel zmienia menu), latency wymagania
dla chat UX (max akceptowalny czas odpowiedzi).
Zapisz wynik do research/session_04/rag-hospitality-patterns.md

Subagent 2: ai-concierge-market
Zbadaj rynek AI concierge dla hoteli — HiJiffy, Quicktext, Asksuite, Aplysia.
Skup się na: zakres funkcjonalności na MVP vs pełna wersja, jak rozwiązują
fallback do ludzkiego agenta, języki i wielojęzyczność, modele cenowe,
co hotele chwalą a co krytykują w recenzjach.
Zapisz wynik do research/session_04/ai-concierge-market.md

Subagent 3: llm-cost-estimation
Oszacuj koszty operacyjne LLM dla AI concierge przy założeniu:
100 hoteli × 50 aktywnych gości dziennie × średnio 5 wiadomości na sesję.
Porównaj: GPT-4o-mini, Claude Haiku, Gemini Flash — koszt na 1000 wiadomości,
koszt miesięczny dla powyższego scenariusza, wpływ RAG (dodatkowe tokeny kontekstu)
na finalny koszt.
Zapisz wynik do research/session_04/llm-cost-estimation.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji
*— do uzupełnienia po sesji —*

### Zamknięte decyzje HITL
*— do uzupełnienia po sesji —*

### Otwarte pytania do następnej sesji
*— do uzupełnienia po sesji —*

---

## Sesja 5 — Model SaaS i Onboarding
*Status: ⬜ nie rozpoczęta · Wymaga: Sesja 1 zamknięta*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: saas-pricing-hospitality
Zbadaj modele cenowe SaaS dla branży hotelarskiej (nie tylko guest apps —
szerzej: PMS, channel managers, CRM hotelowy). Skup się na: flat fee vs per-room
vs per-guest vs revenue share — co hotele preferują i dlaczego, typowe widełki
cenowe dla małych hoteli (20-50 pokoi) vs średnich (50-150), jak wyceniać
dodatkowe moduły (AI concierge jako add-on?).
Zapisz wynik do research/session_05/saas-pricing-hospitality.md

Subagent 2: rodo-data-processing-agreement
Zbadaj wymagania prawne dla umów powierzenia przetwarzania danych (DPA)
między platformą SaaS a hotelem jako administratorem danych w kontekście
danych gości hotelowych w Polsce/UE. Skup się na: kto jest administratorem
a kto procesorem, obowiązkowe klauzule DPA, odpowiedzialność za naruszenia,
czy anonimowy token sesji zwalnia z obowiązku DPA.
Zapisz wynik do research/session_05/rodo-dpa-requirements.md

Subagent 3: hotel-saas-onboarding-patterns
Zbadaj jak inne SaaS dla hoteli przeprowadzają onboarding operatora.
Skup się na: czas od podpisania umowy do działającego produktu u klienta,
co można zautomatyzować vs co wymaga wsparcia człowieka, typowe przeszkody
w onboardingu hoteli (brak zasobów IT, rotacja personelu), czy white-glove
onboarding jest konieczny na MVP.
Zapisz wynik do research/session_05/hotel-saas-onboarding-patterns.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji
*— do uzupełnienia po sesji —*

### Zamknięte decyzje HITL
*— do uzupełnienia po sesji —*

### Otwarte pytania do następnej sesji
*— do uzupełnienia po sesji —*

---

## Sesja 6 — Technologia i Infrastruktura
*Status: ⬜ nie rozpoczęta · Wymaga: Sesje 1-5 zamknięte*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: multitenant-architecture-patterns
Zbadaj wzorce architektury multi-tenant dla aplikacji webowych SaaS w 2025-2026.
Skup się na: shared database vs schema per tenant vs database per tenant —
trade-offy przy tej skali (start: 5-20 hoteli, cel: 200+), row-level security
w PostgreSQL jako rozwiązanie na MVP, jak popularne frameworki (Next.js + Supabase,
Remix, Laravel) obsługują multi-tenancy.
Zapisz wynik do research/session_06/multitenant-patterns.md

Subagent 2: pwa-tech-stack-2026
Zbadaj aktualny (2025-2026) stan techstacku dla PWA z wymaganiami:
multi-tenant, real-time (zamówienia usług), czat AI, QR auth, panel admin.
Skup się na: Next.js vs Remix vs SvelteKit dla tego use case,
Supabase vs Firebase vs własny backend, hosting kosztowy przy skalowaniu
(Vercel vs Fly.io vs Railway vs VPS), edge functions dla latency w Polsce/UE.
Zapisz wynik do research/session_06/pwa-techstack-2026.md

Subagent 3: security-qr-sessions
Zbadaj security best practices dla aplikacji opartych na QR tokenach bez
tradycyjnego logowania. Skup się na: JWT vs opaque token — co lepsze dla
krótkich sesji hotelowych, rate limiting na endpoint QR scan, zapobieganie
token harvesting (ktoś fotografuje kody QR w pokojach), monitoring i alerting
dla anomalii (jeden token użyty z 10 różnych IP).
Zapisz wynik do research/session_06/security-qr-sessions.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji
*— do uzupełnienia po sesji —*

### Zamknięte decyzje HITL
*— do uzupełnienia po sesji —*

### Otwarte pytania do następnej sesji
*— do uzupełnienia po sesji —*

---

## Sesja 7 — Metryki i Walidacja MVP
*Status: ⬜ nie rozpoczęta · Wymaga: Sesja 6 zamknięta*

### Subagenty do uruchomienia równolegle [SUBAGENT]

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: hotel-upsell-benchmarks
Zbadaj benchmarki upsellingu w branży hotelarskiej — ile % gości kupuje usługi
dodatkowe, średnia wartość koszyka, jakie usługi konwertują najlepiej (spa, F&B,
late checkout, transfer). Skup się na danych z raportów branżowych 2023-2025
i case studies wdrożeń podobnych produktów (Duve, Canary, Oaky).
Zapisz wynik do research/session_07/hotel-upsell-benchmarks.md

Subagent 2: mvp-validation-frameworks
Zbadaj frameworki walidacji MVP dla produktów B2B2C (sprzedaż do biznesu,
użytkowanie przez konsumenta). Skup się na: jak definiować success criteria
zanim zaczniesz testy, minimalna próba statystyczna dla miarodajnych wyników,
jak oddzielić "produkt działa" od "hotel dobrze wdrożył", metryki leading
(wczesne sygnały) vs lagging (wyniki końcowe).
Zapisz wynik do research/session_07/mvp-validation-frameworks.md

Subagent 3: analytics-stack-for-mvp
Zbadaj minimalny stack analityczny dla MVP SaaS B2B2C. Skup się na:
event tracking (Mixpanel vs PostHog vs Amplitude — co na MVP, co później),
jak trackować lejek hotelowy (onboarding → aktywacja → retencja → revenue),
jak mierzyć jakość AI concierge bez manualnego review każdej rozmowy,
RODO compliance dla event analytics z danymi gości.
Zapisz wynik do research/session_07/analytics-stack-mvp.md

Kontynuuj sesję. Zsyntezuj wyniki gdy wszystkie subagenty skończą.
```

### Ustalenia z sesji
*— do uzupełnienia po sesji —*

### Zamknięte decyzje HITL
*— do uzupełnienia po sesji —*

### Otwarte pytania do następnej sesji
*— do uzupełnienia po sesji —*

---

## Changelog

| Data | Sesja | Co zostało zamknięte |
|---|---|---|
| 2026-06-25 | Sesja 1 — Identity | Model tokenu QR, RODO (token anonimowy + DPA + imię), czas sesji (fixed expiry = checkout+2h), model bez PMS |
| 2026-06-25 | Sesja 2 — Panel | 6 modułów panelu MVP, 4 role RBAC, template-first onboarding, Owner=ADM=billing, self-service + wsparcie jako płatna opcja, dashboard 3 widoków (GM/F&B/Recepcja) |

---

*Dokument jest żywy. Każda sesja robocza kończy się aktualizacją tego pliku.*
*Przed zamknięciem sesji: uzupełnij ustalenia, zaktualizuj rejestr HITL, zapisz otwarte pytania.*
