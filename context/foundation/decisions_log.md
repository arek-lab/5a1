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
| 5 | Interfejs | Płatności: rachunek do pokoju vs bramka na MVP | ✅ zamknięta | Rachunek do pokoju — zero bramki płatniczej na MVP. Hotel rozlicza przy checkout lub przez własny POS. | 2026-06-25 |
| 6 | Interfejs | Granica upsell vs doświadczenie gościa | ✅ zamknięta | Sekcja "Polecamy" (3 kafelki) na home screen, poniżej nawigacji (wymaga scrollu). Brak pop-upów i modali. AI concierge sugeruje przy okazji, nie inicjuje sprzedaży. | 2026-06-25 |
| 7 | AI | Concierge: tylko informuje czy wykonuje akcje? | ✅ zamknięta | Tylko informuje i sugeruje — gość sam składa zamówienie w UI. Brak integracji akcji na MVP. | 2026-06-25 |
| 8 | AI | Transparentność AI wobec gościa | ✅ zamknięta | Zawsze transparentny — wymóg EU AI Act. Hotel może dostosować imię bota, ale informacja o AI jest obowiązkowa. | 2026-06-25 |
| 9 | AI | Odpowiedzialność za jakość odpowiedzi concierge | ✅ zamknięta | Standard rynkowy: hotel odpowiada za treść bazy wiedzy; platforma odpowiada za uptime i delivery. Wyłączenie odpowiedzialności platformy za błędy wynikające z niepoprawnych danych hotelu — w umowie. | 2026-06-25 |
| 10 | SaaS | Model cenowy MVP: płatny czy free dla pierwszych hoteli? | ✅ zamknięta | Lighthouse Program — 3–5 hoteli gratis przez 3–6 mies. w zamian za case study, referencje i prawo do wywiadu. Standard rynkowy (Duve, Oaky, Canary). Po fazie lighthouse: flat fee €99–179/mies. lub per-room €5–8/mies. z min. €150 | 2026-06-25 |
| 11 | SaaS | Administrator danych gości: platforma czy hotel? | ✅ zamknięta | Hotel = ADM, platforma = procesor. Potwierdzone przez RODO research + HITL #3. DPA z każdym hotelem obowiązkowe przed pierwszym wdrożeniem. UUID nie zwalnia z DPA — hotel łączy token z rezerwacją po swojej stronie. | 2026-06-25 |
| 12 | Tech | Build vs buy dla komponentów AI | ✅ zamknięta | Prompt injection na MVP (cała baza wiedzy hotelu bezpośrednio w kontekście LLM — GPT-4o-mini 128K ctx wystarczy dla ~5-10K tokenów bazy małego hotelu). pgvector w Supabase jako ścieżka upgradu gdy hotel urośnie. Zero Qdrant/Pinecone na MVP. | 2026-06-25 |
| 13 | Tech | Zespół: zewnętrzny vs własny | ✅ zamknięta | Solo + Claude Code + Spec Driven Development. Ten research = specyfikacja techniczna dla implementacji. Implikacja: stack musi być opinionated i uproszczony (Railway > Fly.io na start). | 2026-06-25 |
| 14 | Metryki | Definicja sukcesu MVP przed testami | ✅ zamknięta | Rygorystyczny (3 z 3 warunków): ≥30% gości skanuje QR w ciągu doby + ≥10% konwersja upsell (≥1 zamówienie/10 gości) + hotel kontynuuje po 3 mies. bez "stop" | 2026-06-25 |
| 15 | Metryki | Skala testu: ile hoteli, ile tygodni | ✅ zamknięta | 3 hotele × 6 tygodni (w ramach Lighthouse Program) | 2026-06-25 |

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
*Status: ✅ zamknięta — 2026-06-25*

### Subagenty uruchomione [SUBAGENT]
- `guest-app-ux-benchmarks.md` — UX benchmarks: Duve, ALICE, Intelity, Canary, HiJiffy ✅
- `pwa-mobile-constraints.md` — PWA na mobile 2025-2026: wydajność, offline, iOS vs Android ✅
- `upsell-ux-patterns.md` — Wzorce upsell UX: helpful vs agresywny, timing, contextual recs ✅

### Ustalenia z sesji

**Pierwsze 10 sekund — wzorzec (na podstawie benchmarków):**
- Splash (logo hotelu, max 1,5 s) → Welcome screen ("Witaj, [Imię]!" + hero image) → 5–6 kafelków kategorii
- Żaden formularz, żadna weryfikacja przed pierwszym ekranem
- Imię gościa (z danych rezerwacji, HITL #1) w nagłówku przez cały pobyt

**Architektura informacji — 5 kategorii top-level:**
```
🍽️ Restauracja & Bar     → menu + zamówienie do pokoju
🛎️ Usługi pokojowe       → housekeeping, amenities, maintenance
💆 Spa & Wellness         → zabiegi, basen, siłownia
🚖 Transport              → transfer, wynajem, taxi
ℹ️ Informacje              → FAQ, WiFi, check-out, godziny, okolica
```
- Sekcja "Polecamy" (3 kafelki pinowane przez hotel) poniżej nawigacji na home screen
- Max 6 pozycji top-level — powyżej: cognitive overload
- Ceny widoczne na karcie usługi (nie po kliknięciu)
- Bezpłatne usługi: etykieta "Included" (nie "0 PLN") — lepsze postrzeganie wartości

**Flow zamówienia (Duve-wzorzec, 3–4 tapy):**
```
Kategoria → Usługa (cena na karcie) → Modal potwierdzenia + opcjonalne uwagi → Ekran sukcesu
```
- Dane gościa (imię, pokój, daty) z tokenu — gość nic nie wpisuje
- Pole uwag: opcjonalne, z placeholderem; nigdy wymagane
- Wybór godziny: tylko dla usług time-sensitive (masaż, śniadanie), nie dla wszystkich
- Płatność: "Charge to room" — jedyna opcja (HITL #5)
- Ekran potwierdzenia: pełny (nie tylko toast) → sekcja "Moje zamówienia" ze statusem

**Upsell — implementacja (HITL #6 — sekcja "Polecamy" na home):**
- 3 kafelki max, poniżej nawigacji (wymaga scrollu) — nie blokuje głównego flow
- Hotel pinuje usługi w panelu (nie algorytm)
- Brak pop-upów i modali przy wejściu
- AI concierge: sugeruje usługi przy okazji odpowiedzi na pytanie, nie inicjuje
- Etykieta: "Polecane przez [Hotel Name]" — nie "PROMOCJA"
- Frequency cap: jeśli gość nie kliknął w ciągu 24h → ukryj tę pozycję

**Wielojęzyczność — architektura dwuwarstwowa:**
- Warstwa 1 (UI strings): i18n JSON, platforma tłumaczy — MVP: PL + EN
- Warstwa 2 (treści hotelowe): hotel wpisuje w PL, platforma auto-tłumaczy na EN (Claude/DeepL API)
- Auto-detect z `Accept-Language` → fallback do EN
- Przełącznik PL | EN w nagłówku (text, nie tylko flaga)
- Preferencja języka: `localStorage` (nie cookie)

**PWA — architektura dla "first-visit, no-install, flaky WiFi":**
- App Shell Architecture: HTML/CSS/JS < 150 KB gzipped → pierwsze ładowanie < 3 s na 3G
- Service Worker: Cache First (shell, obrazy, i18n) + Stale While Revalidate (menu, usługi)
- NIE push notifications na MVP — zamiast: SSE (Server-Sent Events) dla statusu zamówień
  - SSE działa bez instalacji, bez uprawnień, iOS + Android
  - Fallback: polling co 10 s
- Add to Home Screen: nie promować aktywnie (gość jednorazowy, < 5% instaluje)
- iOS krytyczne: service workers tak (od iOS 11.3), push bez instalacji NIE, background sync NIE

**Stany brzegowe — priorytety:**
| Priorytet | Stan | Handling |
|---|---|---|
| 🔴 P0 | Wygasły/nieważny token | Branded strona (logo hotelu) + numer recepcji |
| 🔴 P0 | Usługa niedostępna | Greyed tile + "Tymczasowo niedostępne" (nie ukrywać) |
| 🟡 P1 | Brak internetu | Toast + cache działa (menu, FAQ), zamówienia wymagają sieci |
| 🟡 P1 | Błąd serwera | Friendly error + numer recepcji |
| 🟢 P2 | Zamówienie odrzucone | Status update w "Moje zamówienia" |

**Komunikat powitalny 5A:**
- Forma: wbudowany w welcome screen (nie oddzielny ekran) — imię + hero image + krótka informacja
- Treść: "Witaj, [Imię]! Jesteś w [Hotel Name]. Jak możemy Ci dziś pomóc?"
- Długość: max 2 zdania — reszta to nawigacja
- Moment: natychmiastowy (po załadowaniu welcome screen, bez opóźnienia)

**Anti-patterns (z benchmarków — czego NIE robić):**
- Formularz przed treścią (ALICE mistake)
- Koszyk (nadmiar złożoności dla MVP)
- Ukrywanie niedostępnych usług (Canary) — lepiej greyed
- Pop-up wyboru języka przed wyświetleniem aplikacji
- Toast jako jedyny feedback po zamówieniu

### Zamknięte decyzje HITL
- ✅ HITL #5: Rachunek do pokoju — zero bramki płatniczej na MVP. Potwierdzony przez benchmarki (Duve, Intelity, ALICE = standard rynkowy). Hotel rozlicza przez własny POS lub przy checkout. Konsekwencja: platforma nie obsługuje płatności, brak PCI DSS scope.
- ✅ HITL #6: Sekcja "Polecamy" na home screen (3 kafelki, poniżej nawigacji). Filozofia: curated helpfulness (jak Duve/Oaky), nie aggressive push. Granica: zero pop-upów, AI nie inicjuje sprzedaży, hotel decyduje co wyświetla.

### Otwarte pytania do następnej sesji
- Sesja 4 (AI Concierge): format bazy wiedzy Q&A (ustalony w Sesji 2 jako lista Q&A w panelu) — jak AI concierge przetwarza przy architekturze SSE dla statusu zamówień?
- Sesja 6 (Tech): Service Worker + SSE wymaga konkretnego stacku backendowego — Next.js z Supabase Realtime czy inne podejście?
- Do potwierdzenia: czy DeepL API czy Claude do auto-translate treści hotelowych — koszt vs jakość dla PL→EN

---

## Sesja 4 — AI Concierge
*Status: ✅ zamknięta — 2026-06-25*

### Subagenty uruchomione [SUBAGENT]
- `rag-hospitality-patterns.md` — RAG w hotelarstwie, chunking, latency, embeddings, caching ✅
- `ai-concierge-market.md` — HiJiffy, Quicktext, Asksuite; fallback patterns, pricing, tone of voice ✅
- `llm-cost-estimation.md` — GPT-4o-mini vs Haiku 4.5 vs Gemini, koszty z RAG, caching analysis ✅

### Ustalenia z sesji

**Format i struktura danych wejściowych od hotelu:**
- Rekomendowany format: Markdown z YAML frontmatter (metadane: `category`, `valid_from`, `valid_until`, `property_id`, `language`)
- Model dwudokumentowy (wzorzec HiJiffy Aplysia 3): Company Knowledge (globalne polityki platformy) + Property Knowledge (edytowane przez hotel)
- Panel Q&A z Sesji 2 to właściwy kierunek — prościej niż konkurencja; hotel wypełnia szablony, platforma seeduje ze strony www hotelu
- Dane dynamiczne (ceny, dostępność) → NIE w RAG — function calling do PMS API; na MVP bez PMS → fallback do recepcji

**Chunking i retrieval:**

| Typ treści | Strategia | Rozmiar (tokeny) |
|---|---|---|
| FAQ | Q&A pairs (każda para osobny chunk) | 50–150 |
| Menu | Item-level z prefixem kategorii | 50–100 |
| Pokoje | Attribute-structured (1 chunk / typ pokoju) | 100–200 |
| Polityki | Recursive split | 400–512 (10–15% overlap) |
| Okolica | Semantic chunking | 300–600 (50–80 overlap) |

- Technika Contextual Retrieval (Anthropic 2024): +1–2 zdania kontekstu per chunk → recall +20–35%
- Hybrid search (BM25 + dense embeddings) lepszy niż samo semantic search dla krótkich pytań hotelowych
- Embedding MVP: `text-embedding-3-small` (OpenAI) — dobra jakość PL, $0.02/1M tokenów

**Obsługa aktualizacji:**
- Incremental update (nie full re-index): hash comparison → DELETE starych → UPSERT nowych chunków
- Metadane `valid_from`/`valid_until` + filtrowanie przy retrieval (eliminuje nieaktualne treści sezonowe)
- Cel: edycja Q&A przez managera hotelu w panelu = natychmiastowa propagacja bez re-indeksu

**Zakres wiedzy concierge na MVP:**
- Oferta hotelu (usługi, ceny) + godziny wszystkich punktów + FAQ + okolica
- 70–85% zapytań gości to FAQ — najwyższy ROI
- NIE obsługiwać przez AI: booking, zmiany rezerwacji, reklamacje → bezpośredni fallback do recepcji

**Fallback do recepcji:**
- Confidence threshold → jeśli poniżej progu: "To wykracza poza to, co mogę sprawdzić. Połączę Cię z recepcją — [przycisk] lub zadzwoń: +48 XXX"
- 3 nieudane próby AI → automatyczna eskalacja (wzorzec HiJiffy)
- Fallback musi zawierać konkretny kontakt — nie wolno zostawić gościa z ciszą
- Skargi i pilne sytuacje → natychmiastowy routing, AI nie próbuje odpowiadać

**Tone of voice:**
- Rekomendacja MVP: neutralny, ciepły, pomocny — bez wymyślonej osobowości
- Opcja nadania imienia bota w panelu (np. "Sofia", "Max") — ważne dla premium hoteli
- Wielojęzyczność natywna w LLM (GPT-4o-mini, Claude Haiku) — baza wiedzy po polsku wystarczy, LLM tłumaczy

**Logowanie konwersacji:**
- Treść wiadomości powiązana z `session_id` (opaque UUID) — nie z danymi osobowymi gościa
- Manager hotelu widzi: najczęstsze pytania, fallback rate, unanswered queries — nie treść per gość
- Provider LLM = sub-procesor → DPA z OpenAI/Anthropic wymagane (potwierdzono w Sesji 1)

**Rekomendacja modelu LLM:**
- MVP: **GPT-4o-mini** — $258,75/mies. dla 100 hoteli z RAG; koszt AI per hotel: $2,59/mies. (<1% ceny SaaS)
- Prompt caching: GPT-4o-mini (próg 1 024 tok.) → możliwy przy RAG; Haiku 4.5 (próg 4 096 tok.) → trudniejszy
- Semantic caching (Redis): 30–70% zapytań hotelowych powtarzalnych → duże oszczędności latency i kosztu
- Latency cel: <1,5 s end-to-end; streaming (SSE/WebSocket) poprawia perceived performance
- Stack: Qdrant lub FAISS jako vector DB, `text-embedding-3-small` dla embeddings

**Czego NIE ma na MVP (potwierdzone benchmarkami):**
- Integracja PMS real-time (CSV wystarczy)
- Booking w czacie / zmiany rezerwacji
- Voice assistant, proactive messaging, sentiment analysis
- Fine-tuning modelu

### Zamknięte decyzje HITL
- ✅ HITL #7: Tylko informuje — concierge nie wykonuje akcji na MVP. Sugeruje usługi, gość sam składa zamówienie przez UI. Konsekwencja: brak integracji silnika zamówień z AI na MVP, niższa złożoność.
- ✅ HITL #8: Zawsze transparentny — EU AI Act + standard rynkowy. Hotel może nadać imię botowi (panel), ale wzmianka "wirtualny asystent" jest obowiązkowa. Konsekwencja: zero ryzyka regulacyjnego.
- ✅ HITL #9: Standard rynkowy — hotel = właściciel treści i odpowiada za jej poprawność; platforma = operator silnika i odpowiada za dostępność. Wyłączenie odpowiedzialności platformy za błędy z niepoprawnych danych hotelowych musi być w umowie przed wdrożeniem.

### Otwarte pytania do następnej sesji
- Sesja 5 (SaaS): czy AI concierge wchodzi w pakiet podstawowy czy jako add-on? Wpływ na model cenowy.
- Sesja 6 (Tech): wybór vector DB (Qdrant vs Pinecone vs FAISS), czy semantic cache (Redis) jest zależnością infrastrukturalną
- Sesja 6 (Tech): potwierdzenie decyzji HITL #12 (build vs buy dla komponentów AI) — RAG własny vs zewnętrzny serwis

---

## Sesja 5 — Model SaaS i Onboarding
*Status: ✅ zamknięta — 2026-06-25*

### Subagenty uruchomione [SUBAGENT]
- `saas-pricing-hospitality.md` — modele cenowe SaaS hospitality, benchmarki, AI add-on vs included ✅
- `rodo-dpa-requirements.md` — wymagania DPA Art. 28, EDPB Opinion 22/2024, CJEU IX 2025, Anthropic DPA ✅
- `hotel-saas-onboarding-patterns.md` — onboarding Duve/Canary/Oaky, time-to-value, offboarding ✅

### Ustalenia z sesji

**Model cenowy i faza Lighthouse:**
- HITL #10 (Lighthouse Program): 3–5 hoteli gratis przez 3–6 miesięcy → case study + referencje + prawo do wywiadu
- Po fazie lighthouse: per-room €5–8/mies. z minimum €150/mies. + 15–20% dyskonto roczne
- Alternatywnie: flat fee property-based €99–179/mies. (łatwiejsze do sprzedania małym hotelom)
- Zero setup fee; opcjonalne white-glove onboarding €199 (waiver przy rocznej umowie)
- AI concierge: included we wszystkich planach (nie add-on) — trend rynkowy 2024–2025 (HiJiffy Aplysia 3, Duve)
- Permanent freemium NIE jest standardem w hospitality SaaS (koszt onboardingu zbyt wysoki)

**Stack cenowy dla SMB (20–150 pokoi) — kontekst konkurencji:**
- Hotel 30 pokoi: €420–900/mies. na cały stack (PMS + channel manager + guest app)
- Nasza platforma: €99–179/mies. → "no-brainer addition" do istniejącego stacku
- apaleo: €8/pokój/mies. (€240 dla 30 pokoi); Duve: $120–200/mies. min.; HiJiffy: ~€4/pokój/mies.

**SLA standards:**
- MVP: 99.5% uptime (standard dla early-stage SaaS)
- Growth: 99.9% uptime (standard mid/enterprise)
- 4h resolution dla critical issues; daily backup obowiązkowe
- Support tier MVP: email w 24h; Pro: email + chat w 4h

**Onboarding hotelu — zaktualizowane ustalenia:**
- Korekta z Sesji 2: cel to **48h do first value** (nie 3 dni robocze)
- Model: auto-setup + 1x kickoff call 30 min (nie white-glove, nie blank canvas)
- Bottlenecki: brak treści (hotel musi za dużo stworzyć), rotacja personelu, brak IT
- Template-first + guided in-app wizard = kluczowe; nie zewnętrzna dokumentacja
- Definition of Done (4 warstwy): Tech (QR aktywne, import CSV) + Communication (szablon welcome wysłany) + Product (≥3 usługi aktywne, AI seeded) + Ops (≥1 staff przeszkolony)
- Najwyższy churn: pierwsze 90 dni + zmiana GM → CS musi zareagować w 48h
- CS structure dla 30–80 hoteli: 1–2 CSM po 40–60 hoteli

**Offboarding — standard rynkowy:**
- Export danych: CSV na żądanie hotelu (zamówienia, baza wiedzy AI) — standard od dnia 1
- Retencja po zakończeniu: 30 dni (hotel może pobrać dane), potem usunięcie
- Gość: token sesji wygasa automatycznie (checkout + 2h) — brak danych do usunięcia po stronie gościa
- Logi serwera: usunięcie po 30 dniach (standard); zamówienia: 5 lat (obowiązek podatkowy)

**RODO / DPA — kluczowe ustalenia:**
- HITL #11 potwierdzone: hotel = ADM, platforma = procesor → DPA z każdym hotelem przed wdrożeniem
- Opaque UUID nie zwalnia z DPA (hotel łączy token z rezerwacją po swojej stronie)
- Imię + token + pokój = dane osobowe w kontekście hotelowym (TSUE C-434/16)
- EDPB Opinion 22/2024: platforma musi proaktywnie informować hotel o sub-procesorach (nie tylko na żądanie)
- CJEU wrzesień 2025: UUID może być nieosobowe dla sub-procesora LLM jeśli brak klucza mapowania i brak PII w prompcie → decyzja architektoniczna do udokumentowania
- Anthropic DPA: dostępne online (privacy.claude.com), 15-dniowy notice o sub-procesorach
- Breach notification chain: platforma → hotel max 24h; hotel → UODO max 72h (Art. 33)
- Brak DPA = sankcja Art. 83 ust. 4: do €10M lub 2% globalnego obrotu

**Obowiązkowe klauzule DPA hotel-platforma (Art. 28 RODO):**
1. Opis przedmiotu i celu przetwarzania (dane rezerwacji, sesje gości, zamówienia)
2. Zakaz przetwarzania w innych celach (krytyczne przy AI)
3. Lista sub-procesorów (Anthropic, hosting provider) + 15-dniowy notice przy zmianach
4. Techniczne i organizacyjne środki bezpieczeństwa
5. Mechanizm breach notification (24h platforma → hotel)
6. Retencja per kategorię danych
7. Prawo hotelu do audytu
8. Usunięcie danych po zakończeniu umowy (30 dni na export, potem delete)

**Czego NIE ma na MVP:**
- Per-user pricing (zbyt skomplikowane dla małych hoteli)
- Revenue share (wymaga integracji z POS/PMS — poza scope MVP)
- Multi-property discount UI (ale `property_id` w schemacie od początku)
- Integracja płatności / PCI DSS (charge to room, HITL #5)

### Zamknięte decyzje HITL
- ✅ HITL #10: Lighthouse Program — 3–5 hoteli gratis 3–6 mies. za case study + referencje. Decyzja oparta na standardzie rynkowym (Duve, Oaky, Canary). Konsekwencja: nie walidujemy WTP w fazie pilotowej — weryfikacja po przejściu na model płatny.
- ✅ HITL #11: Hotel = ADM, platforma = procesor. Potwierdzone przez RODO research (Art. 28, EDPB) + de facto przez HITL #3. DPA obowiązkowe z każdym hotelem przed pierwszym wdrożeniem — bez wyjątków.

### Otwarte pytania do Sesji 6
- HITL #12 (build vs buy dla AI): RAG własny (Qdrant + embeddings) czy zewnętrzny serwis? → Sesja 6
- HITL #13 (zewnętrzny vs własny zespół): determinuje poziom szczegółowości specyfikacji → Sesja 6
- Infrastruktura dla SLA 99.5%: monitoring, alerting, automaty retencji (cron jobs) → Sesja 6
- Czy white-glove onboarding (€199) realizuje team wewnętrzny czy partner zewnętrzny? → decyzja operacyjna

---

## Sesja 6 — Technologia i Infrastruktura
*Status: ✅ zamknięta — 2026-06-25*

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

### Subagenty uruchomione
- `multitenant-patterns.md` — Shared DB + RLS, wzorce Next.js + Supabase, property_id conventions ✅
- `pwa-techstack-2026.md` — Next.js App Router, Supabase Auth + QR flow, hosting Railway vs Vercel, monitoring ✅
- `security-qr-sessions.md` — JWT vs opaque token, rate limiting, token harvesting defense, anomaly detection ✅

### Ustalenia z sesji

**Stack frontendowy (werdykt: Next.js 15 App Router):**
- **Next.js 15 App Router** + TypeScript + Tailwind CSS + next-intl (i18n PL/EN)
- Eliminuje Remix (niepewna roadmapa) i SvelteKit (słabszy ekosystem admin paneli, mniejsza pula PL developerów)
- RSC redukuje bundle PWA poniżej 150 KB bez heroicznego wysiłku (potwierdzenie Sesji 3)
- SSE: Next.js Route Handler z `runtime = "nodejs"` — nie Edge Functions (limit 2s CPU wyklucza semantic cache + streaming AI)
- **Krytyczne:** SSE wymaga serwera persystentnego → Vercel odpada (serverless timeouty przy long-lived SSE)

**Backend — Supabase jako jedyna warstwa:**
- Supabase Pro: Postgres + Auth + Storage = $25/mies.
- **Supabase Auth dla gości:** Anonymous Sign-In + Custom Access Token Hook → wstrzyknięcie `property_id` do JWT → RLS używa tego claima
  - QR URL → jednorazowy init_token (15 min TTL) → `signInAnonymously()` → Custom Hook → JWT z `property_id`
  - Opaque UUID jako `session_id` pozostaje w tabeli sessions (rewokacja, audit trail)
- **Supabase Realtime: NIE dla zamówień** — Pro plan limit 500 concurrent connections; 200 hoteli × 50 gości = 10K połączeń → za drogie przy skali
- Zamówienia: custom SSE przez PostgreSQL `LISTEN/NOTIFY` (MVP single-instance)

**Multi-tenancy — Shared Database + RLS:**
- Koszt: Shared DB ~$25-50/mies. (200 hoteli) | Schema-per-tenant ~$100/mies. | Database-per-tenant ~$5,000/mies.
- **Wzorzec RLS:** `property_id = current_setting('app.property_id', true)::uuid` — nie subquery (10-20x wolniej)
- **Obowiązkowe indeksy** na `property_id` w każdej tabeli
- Ujednolicona nazwa: `property_id` wszędzie (agnostyczne wobec sieci hotelowych)
- Tabele z RLS: `services`, `orders`, `sessions`, `reservations`, `hotel_users`, `qr_codes`, `knowledge_chunks`
- Tabele bez RLS (tylko service_role): `audit_logs`, `platform_config`, `job_queue`

**AI Concierge — Prompt Injection na MVP [HITL #12]:**
- RAG jest overkill dla małych hoteli z małą bazą wiedzy
- Mała KB hotelu: 50-100 Q&A + menu + polityki ≈ 5-10K tokenów
- GPT-4o-mini: 128K context window → **cała KB hotelu bezpośrednio w kontekście** systemu
- Wzorzec: `[SYSTEM PROMPT] + [HOTEL KNOWLEDGE BASE (markdown)] + [CONVERSATION]`
- Semantic cache (Upstash Redis): hash pytania → cached odpowiedź; 30-70% hit rate
- **Ścieżka upgradu:** pgvector extension w Supabase (zero dodatkowej infrastruktury) gdy hotel urośnie

**Hosting — Railway (MVP) → Fly.io Warsaw (wzrost):**
- **MVP: Railway** — najprostszy deployment Next.js, preview environments, instant rollback
  - Koszt łączny: $40-60 (Railway) + $25 (Supabase Pro) + $10-20 (Upstash Redis) ≈ **$75-105/mies. total**
- **Wzrost: Fly.io Warsaw (`waw`)** — jedyna platforma z DC w Polsce, RODO data residency
- **Vercel: NIE** — long-lived SSE timeouty w serverless to bloker architektoniczny

**CI/CD — GitHub Actions + Railway:**
- GitHub Actions: lint + type-check + unit tests przy każdym PR
- Railway: preview deployment per branch → staging (main) → production (manual promote)
- Rollback: Railway instant rollback (jeden klik)

**Monitoring — trzy narzędzia od dnia 1:**
| Narzędzie | Koszt | Co monitoruje |
|---|---|---|
| **Sentry** | Free tier | Błędy JS, wyjątki server-side |
| **PostHog EU Cloud** | Free (< 1M eventów/mies.) | Adoption rate QR, session depth — RODO compliant (EU hosting) |
| **Better Stack** | $24/mies. | Uptime, log aggregation, alerty SLA 99.5% |

**Bezpieczeństwo — potwierdzenia i uzupełnienia:**
- UUID opaque token potwierdzony — natychmiastowa rewokacja to wymóg biznesowy
- `__Host-session` cookie — eliminuje cookie injection i HTTP downgrade na hotelowym WiFi
- Rate limiting: 5 prób/15min per IP, podwyższone do 100 dla NAT hotelowego (Upstash Redis middleware)
- Anomaly detection po ASN (nie IP) — `COUNT(DISTINCT asn) > 2` w 30 min → alert; country jump → auto-revoke
- QR koduje `room_id`, nie `reservation_id` — kontrola przez `room_active_reservation(valid_from, valid_until)`
- Early check-out: jedna SQL transakcja unieważnia sesje i zamyka okno pokoju

**Stack ostateczny:**
```
Frontend:  Next.js 15 App Router + TypeScript + Tailwind CSS + next-intl
Auth:      Supabase Auth (Anonymous Sign-In + Custom Access Token Hook)
Database:  Supabase Postgres + RLS (property_id + current_setting wzorzec)
Realtime:  Custom SSE via Next.js Route Handler (runtime=nodejs) + LISTEN/NOTIFY
Cache:     Upstash Redis (serverless) — semantic cache AI + rate limiting
AI:        GPT-4o-mini + prompt injection (cała KB hotelu w kontekście)
Vector DB: pgvector w Supabase (gotowe, nie aktywowane na MVP)
Hosting:   Railway MVP → Fly.io waw (wzrost)
CI/CD:     GitHub Actions + Railway preview deployments
Monitoring: Sentry + PostHog EU Cloud + Better Stack
```

### Zamknięte decyzje HITL
- ✅ HITL #12: Prompt injection na MVP (nie RAG, nie zewnętrzny serwis). GPT-4o-mini 128K ctx wystarczy dla całej KB małego hotelu. pgvector w Supabase jako zero-cost ścieżka upgradu. Semantic cache (Upstash Redis). Uzasadnienie: RAG overkill gdy cała KB hotelu mieści się w kontekście — dodatkowa infrastruktura bez wartości na MVP.
- ✅ HITL #13: Solo + Claude Code + Spec Driven Development. Ten research (Sesje 1-6) = specyfikacja techniczna. Implikacje: stack opinionated z minimalnymi opcjami; Railway > Fly.io na start; Supabase jako "one-stop backend" eliminuje zarządzanie wieloma serwisami solo.

### Otwarte pytania do Sesji 7
- Metryki adopcji QR: jaki % gości skanuje QR w pierwszej dobie — leading indicator sukcesu MVP
- PostHog events schema: jakie events trackować od dnia 1 (QR scan, order placed, concierge message, fallback triggered)
- HITL #14: Jaki minimalny wynik uznasz za "MVP działa" i uzasadnia dalszą inwestycję?
- HITL #15: Ile hoteli i ile tygodni to wystarczający test?

---

## Sesja 7 — Metryki i Walidacja MVP
*Status: ✅ zamknięta — 2026-06-25*

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

### Subagenty uruchomione [SUBAGENT]
- `hotel-upsell-benchmarks.md` — benchmarki upsell branży hotelarskiej, konwersja, kategorie, Canary/Oaky/Duve ✅
- `mvp-validation-frameworks.md` — framework walidacji B2B2C, minimalna próba, leading/lagging, błędy pilotów ✅
- `analytics-stack-mvp.md` — event taxonomy PostHog, automatyczny pomiar AI concierge, RODO, dashboard founder ✅

### Ustalenia z sesji

**Metryki hotelowe:**
- Baseline branżowy upsell: 10-25% konwersja pre-arrival (golden window 48-72h przed przyjazdem); in-stay niższe
- Early check-in / late checkout = #1 konwertująca kategoria (>Spa, >Room service, >Transfer)
- Digital upsell: 4x wyższy conversion niż tradycyjny front-desk (benchmark Canary 2025)
- Revenue per guest: Oaky €35-200/mies. dla hoteli z dojrzałym programem; cel realistyczny MVP: €5-15/pobyt/gość
- Odciążenie recepcji: mierzalne przez `front_desk_inquiry_count` — cel: widoczny spadek po 60 dniach

**Metryki gościa (PostHog event taxonomy — 10 core events od dnia 1):**

| Lejek | Event | Kluczowe właściwości |
|---|---|---|
| Hotel operator | `hotel_login` | `days_since_signup` |
| Hotel operator | `hotel_settings_updated` | `setting_type` |
| Hotel operator | `guest_order_received` | `order_value`, `hotel_id` (GROUP) |
| Gość — top funnel | `guest_qr_scanned` | `hotel_id`, session UUID (opaque) |
| Gość — browse | `guest_item_details_opened` | `item_id`, dwell time |
| Gość — konwersja | `guest_order_submitted` | `order_value`, `fulfillment_type` |
| Gość — retention | `guest_session_returned` | 7/30-day cohort flag |
| AI concierge | `concierge_query_submitted` | `category_detected`, `hotel_id` |
| AI concierge | `concierge_response_delivered` | `confidence_score`, latency ms |
| AI concierge | `concierge_response_escalated` | fallback trigger |

- **Adoption rate cel**: ≥30% gości skanuje QR w ciągu pierwszej doby pobytu (leading indicator, tydzień 1-7)
- **Session depth cel**: ≥2 sekcje odwiedzone per sesja
- **Retention cel**: ≥40% gości wraca do appki 2+ razy podczas pobytu

**Metryki AI concierge (automatyczne — bez manualnego review każdej rozmowy):**
- **Containment rate** (% queries bez eskalacji): target 40-65% (Gartner 2025); alert gdy >35% escalation
- **Response latency**: alert jeśli >5s end-to-end; target <1,5s (streaming SSE poprawia perceived)
- **Confidence score histogram**: alert gdy avg <0,6 dla kategorii (sygnał że baza wiedzy niekompletna)
- **Downstream action rate**: czy gość składa zamówienie w ciągu 2 min po odpowiedzi concierge
- **Monthly spot-audit**: 10 próbek (5 eskalowanych + 5 high-confidence) — kalibracja progów bez pełnego audytu

**Feedback loop (jakościowy):**
- Tygodniowe synce z hotel championem (staff adoption owner + GM)
- Exit survey gościa: 5 pytań po checkout (<2 min) — świadomość appki, użycie, NPS
- Monthly 10-sample audit AI concierge — ręczna ocena przez personel hotelu
- Biweekly data review z danymi pilotu (early warning na spadek engagement)

**Kryteria sukcesu MVP — 3 z 3 (HITL #14):**
1. **Leading (tydzień 1-7):** ≥30% gości skanuje QR w ciągu doby 1. pobytu
2. **Lagging (tydzień 4-6):** ≥10% konwersja upsell (≥1 zamówienie na 10 aktywnych gości)
3. **Retention (miesiąc 3):** hotel kontynuuje bez wyraźnego "stop" — nie rezygnuje po fazie Lighthouse

Kryterium kill (co oznacza "nie iść dalej"):
- <15% adoption QR po 14 dniach (i hotel aktywnie promował appkę) → problem produktowy
- Brak ani jednego zamówienia przez appkę po 30 dniach → problem value proposition
- Hotel prosi o wyłączenie przed końcem 6 tygodni → implementation lub product fail

**Skala pilotu (HITL #15):** 3 hotele × 6 tygodni
- Tygodnie 1-2: setup, training personelu, pierwsze QR aktywne
- Tygodnie 3-6: aktywny okres używania przez gości (2-3 cykle rotacji)
- Po 6 tygodniach: decyzja go/no-go na podstawie leading + lagging metrics
- Dywersyfikacja: min. 2 hotele boutique/niezależne + 1 mid-size; różne geografie (catch implementation variation)

**Dashboard founder (PostHog):**
- **Daily "Pulse"** (5 min): gości online, zamówień/24h, QR scans/24h, escalation rate, hotel operators aktywnych 7d
- **Weekly "Growth"** (piątek): guest funnel (QR→order), cohort activation hoteli wg wieku, AI performance per kategoria, top/bottom hotel comparison

**Separacja product-fit od implementation-fit:**
- Jeśli hotel nie ukończył trainingu → dane tego hotelu wykluczone z walidacji produktu
- Track: `staff_training_completion` (gate) + `hotel_promotion_activity` (emails/signage/frontdesk)
- Wysoka świadomość gości + niska adopcja = problem UX (product-fit); niska świadomość = problem promotji (implementation)

**PostHog RODO compliance:**
- `guest_id` = opaque server-side UUID (nie email/imię/pokój) — retencja 90 dni, potem purge
- Brak PII w propertiach eventów
- Consent banner dla gości: "Mierzymy użycie bez danych osobowych"
- PostHog EU Cloud = sub-procesor → DPA z PostHog obowiązkowe (jak Anthropic DPA z Sesji 1)

### Zamknięte decyzje HITL
- ✅ HITL #14: Rygorystyczny — 3 z 3 warunków muszą być spełnione jednocześnie: ≥30% QR adoption/dobę + ≥10% upsell conversion + hotel kontynuuje po 3 mies. Decyzja: rygorystyczna definicja przed testami, nie post-hoc. Kryterium kill: <15% adoption + brak zamówień + hotel rezygnuje.
- ✅ HITL #15: 3 hotele × 6 tygodni. W ramach Lighthouse Program (3-5 hoteli gratis). Dywersyfikacja: 2 boutique + 1 mid-size. Tygodnie 1-2 setup; tygodnie 3-6 dane. Minimum 50-100 aktywnych gości per hotel dla statystycznej sensowności.

### Otwarte pytania do następnej sesji
- **Sesja 7 jest ostatnią sesją research roadmapy.** Kolejny krok: specyfikacja implementacyjna (SDD — Spec Driven Development) na podstawie Sesji 1-7.
- Pytania do rozważenia przy implementacji:
  - Kolejność implementacji: Auth + QR flow (Sesja 1) → Panel minimum (Sesja 2) → Guest UI (Sesja 3) → AI Concierge (Sesja 4) → Analytics events (Sesja 7)
  - PostHog Group Analytics (hotel cohorts) wymaga paid tier — zaplanować moment upgrade
  - Confidence score z GPT-4o-mini: weryfikacja czy model zwraca `logprobs` lub czy lepiej użyć własnej heurystyki (długość odpowiedzi + czy fallback triggered)

---

## Changelog

| Data | Sesja | Co zostało zamknięte |
|---|---|---|
| 2026-06-25 | Sesja 1 — Identity | Model tokenu QR, RODO (token anonimowy + DPA + imię), czas sesji (fixed expiry = checkout+2h), model bez PMS |
| 2026-06-25 | Sesja 2 — Panel | 6 modułów panelu MVP, 4 role RBAC, template-first onboarding, Owner=ADM=billing, self-service + wsparcie jako płatna opcja, dashboard 3 widoków (GM/F&B/Recepcja) |
| 2026-06-25 | Sesja 3 — Interfejs Gościa | Flow 10 sekund: splash→welcome→5 kategorii, 3-tap order, "charge to room", SSE status zamówień, PWA App Shell <150 KB, fallback states P0/P1/P2 |
| 2026-06-25 | Sesja 4 — AI Concierge | RAG z chunking per typ treści, GPT-4o-mini ($2,59/hotel/mies.), semantic cache, fallback pattern, tone of voice neutralny z opcją imienia — czeka na HITL #7, #8, #9 |
| 2026-06-25 | Sesja 3 — Interfejs Gościa | Welcome screen z imieniem, 5 kategorii top-level, 3-4 tap flow zamówień (charge to room), sekcja "Polecamy" na home (3 kafelki), PWA z App Shell + SSE (no push na MVP), PL+EN z AI translate treści, stany brzegowe P0/P1/P2 |
| 2026-06-25 | Sesja 5 — SaaS & Onboarding | Lighthouse Program (HITL #10), DPA obowiązkowe hotel=ADM platforma=procesor (HITL #11), model cenowy per-room €5–8 lub flat €99–179/mies. po lighthouse, zero setup fee, AI included (nie add-on), 48h time-to-value, template-first onboarding, offboarding: CSV export + 30-dniowa retencja po zakończeniu |
| 2026-06-25 | Sesja 6 — Technologia | Stack: Next.js 15 App Router + Supabase + Railway + Upstash Redis + GPT-4o-mini prompt injection; HITL #12 (prompt injection nie RAG) + HITL #13 (solo + Claude Code + Spec Driven Dev); Vercel wyeliminowany (SSE bloker); pgvector jako ścieżka upgradu RAG |
| 2026-06-25 | Sesja 7 — Metryki | HITL #14 (Rygorystyczny sukces: 3/3 warunki: ≥30% QR adoption + ≥10% upsell conversion + hotel kontynuuje 3 mies.) + HITL #15 (3 hotele × 6 tygodni Lighthouse); 10 core PostHog events; automatyczny pomiar AI concierge (containment rate, confidence score, latency); RODO-compliant opaque guest_id; daily Pulse + weekly Growth dashboard |

---

*Dokument jest żywy. Każda sesja robocza kończy się aktualizacją tego pliku.*
*Przed zamknięciem sesji: uzupełnij ustalenia, zaktualizuj rejestr HITL, zapisz otwarte pytania.*
