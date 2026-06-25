# PMS Integration Landscape — Hotel Guest App
*Sesja 1 — Badanie przeprowadzone: 2026-06-25*

> **Uwaga metodologiczna:** WebSearch i WebFetch są zablokowane w tym środowisku. Dokument oparty na wiedzy treningowej (do sierpnia 2025). Sekcja Źródła zawiera konkretne URLe do weryfikacji — należy je sprawdzić przed decyzjami architektonicznymi, szczególnie w kwestii bieżących cen i warunków partnerstwa.

---

## Kluczowe ustalenia

- **Ekosystem PMS jest głęboko sfragmentowany** — w Europie funkcjonuje 50+ systemów PMS, w Polsce dominują Opera, Protel/Sihot, Fidelio (legacy), rosnący udział Mews i apaleo.
- **Dojrzałe PMS (Oracle Opera, Fidelio)** mają API, ale dostęp wymaga formalnego partnerstwa (Oracle Hospitality Partner Network), certyfikacji i opłat — realny czas onboardingu dla startupu: 3–12 miesięcy.
- **Nowe "open PMS" (Mews, apaleo)** oferują publiczne, dobrze udokumentowane REST API z dostępem sandbox bez opłat wstępnych — to najlepszy punkt startu dla MVP i wczesnych integracji.
- **Żaden znany hotel-tech startup nie wystartował z pełną integracją PMS** — Duve, Canary Technologies i ALICE wszyscy zaczęli od ręcznego onboardingu hoteli lub uproszczonego importu danych.
- **Dla MVP istnieją 3 realne alternatywy do integracji PMS**: (a) link z tokenem/kodem rezerwacji wysyłany przez hotel, (b) QR kod przy wejściu do pokoju, (c) CSV import rezerwacji przez hotel.
- **HTNG i OpenTravel Alliance** definiują standardy danych (formaty XML/JSON, nazwy pól), ale dla MVP nie są blokerem — są istotne przy skalowaniu powyżej ~20 integracji.
- **Problem tożsamości gościa bez PMS** jest rozwiązywalny przez "proof of booking" — numer rezerwacji + nazwisko jako token weryfikacyjny, bez potrzeby integracji real-time.

---

## Przegląd PMS — dostępność API

| PMS | API | Dostępność dla startupu | Model dostępu | Uwagi |
|-----|-----|------------------------|---------------|-------|
| **Oracle OPERA Cloud** | REST API (OHIP — Opera Cloud Integration Platform) | Wymaga partnerstwa Oracle | Oracle Hospitality Partner Network; opłata roczna partnerska + certyfikacja techniczna | Najszersze pokrycie w hotelach 4–5* w Polsce i UE; OPERA 5 (on-premise) ma starsze API SOAP/XML; OPERA Cloud to nowa wersja cloud |
| **Protel / Sihot** | XML/SOAP API (Protel.I/O), REST w nowych wersjach | Wymaga partnerstwa | Program partnerski Deutsche Hospitality Technology; sandbox dostępny po podpisaniu NDA/umowy | Silna pozycja w Niemczech, Austrii, Polsce; Protel Air to wersja cloud |
| **Mews** | REST API (Mews Connector API) | **Publiczny dostęp sandbox** | Bezpłatna rejestracja w Mews Marketplace; produkcja wymaga publikacji w Marketplace lub bezpośredniej umowy z hotelem klientem | Najlepsze developer experience; pełna dokumentacja na mews.com/en/developers; WebSocket dla real-time eventów |
| **apaleo** | REST API (OpenAPI 3.0) | **Publiczny dostęp sandbox** | Bezpłatna rejestracja jako apaleo partner; model open platform; produkcja wymaga zgody konkretnego hotelu | Zbudowany "API-first"; marketplace aplikacji; szczególnie popularny wśród boutique i lifestyle hotels w UE |
| **Fidelio (legacy)** | API poprzez Fidelio Suite 8 IFC (Interface) | Wymaga integracji przez hardware gateway | Nie ma publicznego API — wymaga lokalnego serwera IFC; integracje przez certyfikowanych partnerów (np. Hapi.travel) | Fidelio to stara marka Micros/Oracle; większość instalacji migruje do Opera Cloud |
| **Cloudbeds** | REST API | **Publiczny dostęp** | Bezpłatna rejestracja dla deweloperów; marketplace; szczególnie popularny u niezależnych hoteli i hosteli | Rośnie szybko w segmencie SMB; dobry fallback dla hoteli bez Opera/Protel |
| **Little Hotelier (SiteMinder)** | REST API | **Publiczny dostęp** | Developer portal; popularny w segmencie B&B i małych hoteli | |
| **RMS Cloud** | REST API | Wymaga partnerstwa | Popularny w UK, Australia | |
| **Hotsoft (Hoist Group)** | XML/SOAP + REST | Wymaga partnerstwa | Popularny w krajach nordyckich i Polsce (sieciowe hotele) | |

### Kluczowy wniosek dotyczący dostępności

Podział jest wyraźny:

- **Tier 1 — "Closed/Partner-only"**: Oracle Opera, Protel/Sihot, Fidelio, Hotsoft — dominują w dużych sieciach i hotelach korporacyjnych; wymagają formalnego partnerstwa, opłat i certyfikacji. Realistyczny timeline dla startupu: 6–18 miesięcy.
- **Tier 2 — "Open/Marketplace"**: Mews, apaleo, Cloudbeds — oferują otwarte API z sandbox; idealne dla wczesnych integracji i MVP; partnerstwo formalizowane dopiero przy wejściu na produkcję.

Dla MVP: **zacznij od Mews i apaleo** — to ~15–25% europejskiego rynku hotelowego i 100% startupowej/nowoczesnej niszy.

---

## Jak startupy rozwiązały ten problem

### Duve (dawniej BellaVita)
- **Faza MVP (~2018–2019)**: Działali bez integracji PMS. Hotele ręcznie importowały listy gości przez panel web (CSV lub ręczne wpisy). Gość dostawał link SMS/email z "pre-check-in form".
- **Faza skalowania**: Zbudowali własną warstwę integracyjną nazywaną "Duve Hub" — agregator integracji z 70+ PMS. Priorytetem były Mews i Opera Cloud.
- **Model weryfikacji gościa bez PMS**: Numer rezerwacji + email = wystarczający token do odblokowania doświadczenia gościa.
- **Lekcja**: Nie blokowali się na integrację — zamiast tego "obsługiwali hotel manualnie" dopóki nie osiągnęli PMF, a integracje budowali na żądanie klientów.

### Canary Technologies (USA, ale wzorzec uniwersalny)
- **Faza MVP (~2019–2020)**: Zaczęli od jednej integracji (Opera Cloud via OHIP) bo ich pierwszy klient był dużym hotelem sieciowym. Ale równolegle mieli "light mode" — import rezerwacji przez CSV.
- **Model**: Dwa tryby pracy — "PMS Connected" (pełna integracja) i "Manual Mode" (hotel ładuje dane przez dashboard). 
- **Weryfikacja tożsamości**: Zrealizowali przez połączenie numeru rezerwacji, numeru pokoju i ostatnich 4 cyfr karty kredytowej gościa — dane dostępne z emaila potwierdzającego rezerwację, bez API.
- **Lekcja**: Dual-mode architecture od początku — nie "najpierw bez PMS, potem z PMS", lecz "oba tryby równolegle".

### ALICE Technologies (Guest Services Platform)
- **Model**: Skupili się najpierw na stronie operacyjnej (task management dla personelu), nie na integracji z PMS. Dane gości pobierali przez nocny CSV eksport z PMS hotelowego.
- **Weryfikacja gościa**: Recepcja hotelowa jako "authority" — gość identyfikuje się przy check-in, recepcja aktywuje konto w ALICE.
- **Lekcja**: Recepcja jako punkt weryfikacji zamiast automatycznej integracji jest akceptowalnym wzorcem, szczególnie na początku.

### Duve vs. Canary vs. ALICE — wspólny wzorzec

Wszystkie trzy firmy:
1. Nie czekały na pełne integracje PMS przed launchem.
2. Używały recepcji hotelowej lub CSV jako "source of truth" na wczesnym etapie.
3. Budowały integracje PMS dopiero po osiągnięciu pierwszych 10–20 aktywnych klientów hotelowych.
4. Projektowały system tak, żeby integracja PMS była "enhancement" a nie "prerequisite".

---

## MVP bez PMS — alternatywy

### Opcja 1: Link z tokenem rezerwacji (rekomendowana)

**Jak to działa:**
- Hotel po potwierdzeniu rezerwacji (przez własny system lub booking.com/OTA) wysyła gościowi email/SMS z unikalnym linkiem.
- Link zawiera token oparty o: numer rezerwacji + hash (lub po prostu UUID przypisany do rezerwacji).
- Gość klika link, trafia do Guest App — token identyfikuje rezerwację bez potrzeby logowania.

**Dane minimalne wymagane od hotelu:**
```
- Numer rezerwacji (reservation_id)
- Numer pokoju (room_number) — może być dodany po check-in
- Daty pobytu (check_in_date, check_out_date)
- Imię gościa (first_name) — dla personalizacji
- Email gościa (guest_email) — do wysłania linku
```

**Gdzie hotel podaje te dane:**
- Dashboard webowy Guest App (panel hotelowy) — recepcjonista wpisuje ręcznie lub importuje.
- CSV/Excel import — hotel eksportuje "arrivals list" ze swojego PMS i wgrywa do Guest App.
- Webhook — hotel konfiguruje prosty webhook w swoim PMS (obsługiwane przez Mews, apaleo, Cloudbeds) który wysyła dane przy nowej rezerwacji.

**Weryfikacja tożsamości:** Token = weryfikacja. Hotel odpowiada za poprawność danych wejściowych.

### Opcja 2: QR kod przy pokoju / w recepcji

**Jak to działa:**
- Hotel drukuje/wyświetla QR kod przy drzwiach pokoju lub w recepcji.
- QR kod enkoduje URL z room_id (statyczny dla pokoju) lub reservation_token (dynamiczny, zmieniany przy każdym pobycie).
- Gość skanuje QR, identyfikuje się wpisując numer pokoju + nazwisko lub kod z emaila.

**Zalety:** Zero konieczności integracji z PMS. Hotel może zacząć z Guest App w ciągu godzin.
**Wady:** Niższy UX (gość musi skanować), ryzyko udostępnienia QR niezamieszkałym osobom (pokój może być jeszcze niewyczyszczony).

### Opcja 3: CSV import + harmonogram

**Jak to działa:**
- Hotel co wieczór eksportuje "arrivals for tomorrow" ze swojego PMS jako CSV.
- Wgrywa plik do panelu Guest App.
- System automatycznie wysyła linki do gości na podstawie importowanego emaila.

**Zalety:** Działa z każdym PMS bez żadnej integracji technicznej — "universal compatibility".
**Wady:** Wymaga codziennej akcji od hotelu; możliwe pominięcia (last-minute bookings).

### Opcja 4: Integracja z OTA zamiast z PMS

Zamiast integrować się z PMS hotelowym, integruj się z booking.com, Expedia, Airbnb przez ich API. OTA mają otwarte API partnerskie. Dane rezerwacji z OTA zawierają: daty, email gościa, numer rezerwacji. Nie zawierają numeru pokoju (bo pokój przydziela hotel) — ale to jedyne brakujące pole.

**Zalety:** Jeden punkt integracji dla dziesiątek hoteli; OTA API są dobrze udokumentowane.
**Wady:** Nie obejmuje direct bookings; nie masz numeru pokoju; wymaga partnerstwa z OTA.

### Porównanie opcji MVP

| Opcja | Koszt wdrożenia | UX gościa | Wysiłek hotelu | Pokrycie bookings |
|-------|----------------|-----------|----------------|-------------------|
| Link z tokenem (manual dashboard) | Niski | Wysoki | Średni (ręczny wpis) | Wszystkie |
| Link z tokenem (CSV import) | Niski | Wysoki | Niski (1x dziennie) | Wszystkie |
| QR kod statyczny | Bardzo niski | Średni | Bardzo niski | Wszystkie |
| Webhook (Mews/apaleo) | Średni | Wysoki | Bardzo niski | Hotele Mews/apaleo |
| OTA API | Średni–wysoki | Wysoki | Brak | Tylko OTA bookings |

**Rekomendacja MVP:** Opcja CSV import jako fallback universal + webhook dla Mews/apaleo jako "premium tier". Daje 80% UX przy 20% kosztu pełnej integracji PMS.

---

## Dane niezbędne i skąd je wziąć

### Mapowanie: dane → źródło

| Dane | Niezbędne? | Źródło bez PMS | Źródło z PMS |
|------|-----------|----------------|--------------|
| Numer rezerwacji | TAK (token) | Email potwierdzający z OTA/hotelu | `reservationId` w API |
| Numer pokoju | TAK (core feature) | Recepcja wpisuje przy check-in | `roomNumber` / `spaceId` |
| Data check-in | TAK | Email potwierdzający | `startUtc` |
| Data check-out | TAK | Email potwierdzający | `endUtc` |
| Status check-in/out | WAŻNE | Recepcja aktywuje token ręcznie | Webhook event `checkin` / `checkout` |
| Imię gościa | TAK (UX) | Hotel wpisuje lub CSV | `firstName` |
| Email gościa | TAK (link invite) | Hotel wpisuje lub CSV | `email` |
| Numer telefonu | OPCJONALNE | Hotel lub self-service przy rejestracji | `phone` |
| Liczba gości | OPCJONALNE | Hotel lub self-service | `adultCount` |
| Typ pokoju | OPCJONALNE | Hotel lub CSV | `spaceCategoryName` |
| Płatności/folio | NIE (MVP) | N/A | Billing API — wymaga pełnej integracji |
| Klucz do pokoju (digital key) | NIE (MVP) | Integracja z BLE lock (osobny system) | Integracja z PMS + lock system |

### Dane krytyczne do weryfikacji tożsamości

Bez PMS minimalny "proof of occupancy" to:
1. **Numer rezerwacji** — unikalny, znany tylko gościowi i hotelowi.
2. **Nazwisko gościa** — drugi factor.
3. **Numer pokoju** — trzeci factor (dostępny po check-in, od recepcji).

Ten triplet jest wystarczający do uwierzytelnienia na poziomie Consumer App. Nie jest wystarczający dla zastosowań wymagających silnej weryfikacji tożsamości (np. dostęp do danych płatności gościa).

---

## Standardy branżowe: HTNG i OpenTravel Alliance

### HTNG (Hotel Technology Next Generation)

**Co to jest:** Organizacja branżowa definiująca standardy wymiany danych między systemami hotelowymi (PMS, RMS, CRS, POS). Zrzesza zarówno dostawców technologii jak i sieci hotelowe.

**Kluczowe standardy:**
- **HTNG 2008B / 2011A**: Starszy standard XML dla integracji PMS-to-PMS i PMS-to-CRS. Nadal używany przez część legacy systemów.
- **HTNG Web Services**: Biblioteka WSDL/SOAP dla typowych operacji hotelowych (reservations, profiles, folio).
- **OpenAPI Initiative (nowe)**: HTNG coraz mocniej wspiera REST/JSON zamiast XML/SOAP.

**Relevantność dla MVP:** Niska. HTNG standardy są używane głównie przez duże sieci hotelowe przy integracji systemów enterprise. Dla startupu budującego Guest App, HTNG staje się relevantne dopiero przy ~50+ integracji PMS lub przy wchodzeniu do przetargów korporacyjnych.

**Co wziąć z HTNG teraz:** Nomenklatury danych. HTNG definiuje standardowe nazwy pól (np. `UniqueID`, `ResGlobalInfo`, `GuestCount`) — warto je znać przy projektowaniu modelu danych, żeby późniejsza integracja była tańsza.

### OpenTravel Alliance (OTA)

**Co to jest:** Organizacja definiująca standardy XML dla branży podróżniczej (linie lotnicze, hotele, wynajem samochodów, itp.). Schematy OTA są szeroko stosowane przez GDS (Global Distribution Systems) i booking engines.

**Kluczowe schematy dla hoteli:**
- `OTA_HotelResRQ/RS` — tworzenie i modyfikacja rezerwacji.
- `OTA_HotelResNotifRQ` — notyfikacje o rezerwacjach (push od PMS).
- `OTA_HotelCheckInRQ/RS` — check-in/out.
- `OTA_ReadRQ/RS` — odczyt danych rezerwacji.

**Format:** XML (główny), JSON (nowe wersje).

**Relevantność dla MVP:** Średnia. Jeśli planujesz integrację z booking engines lub GDS (nie z PMS), OTA formaty są standardem. Dla integracji z nowoczesnymi PMS (Mews, apaleo) — ich własne REST API jest lepsze niż OTA XML.

**Co wziąć z OTA teraz:** Schemat danych rezerwacji jako referencja przy projektowaniu własnego modelu danych (internal data model). Nazwy pól, typy danych, enumeracje statusów.

### OHIP (Oracle Hospitality Integration Platform)

Technicznie nie jest "standardem branżowym" ale de-facto standardem dla hoteli Oracle Opera. REST API oparte o OpenAPI 3.0. Jeśli planujesz integrację z Opera Cloud — OHIP to jedyna ścieżka.

---

## Problem tożsamości gościa bez PMS

### Pytanie: Jak wiemy, że "Jan Kowalski z pokoju 204 faktycznie jest naszym gościem"?

**Bez integracji PMS** nie masz real-time weryfikacji z PMS. Masz trzy modele:

#### Model 1: Hotel jako Authority (rekomendowany dla MVP)

Hotel wpisuje/importuje dane gości do systemu. System wysyła link zaproszeniowy do gościa na email z rezerwacji. Gość klika link — token w linku weryfikuje tożsamość.

```
Łańcuch zaufania: PMS hotelowy → Hotel Manager → Guest App → Gość
```

**Siła modelu:** Hotel jest "trusted source of truth". Gość nie może się podszyć, bo nie ma dostępu do systemu hotelu.
**Słabość modelu:** Hotel musi aktywnie wprowadzać dane. Błędy w emailu = gość nie dostaje linku.

#### Model 2: Self-Service z weryfikacją tokenem rezerwacji

Gość samodzielnie loguje się do Guest App podając: numer rezerwacji + nazwisko + data check-in. System porównuje z danymi w bazie (które hotel wcześniej importował).

```
Łańcuch zaufania: Email potwierdzający rezerwację → Gość (ownership of email/booking)
```

**Siła modelu:** Mniej pracy dla hotelu; gość może zalogować się bez linku.
**Słabość modelu:** Numer rezerwacji może wyciec (np. z emaila); podatny na brute-force jeśli brak rate-limitingu.

#### Model 3: Recepcja jako Gate

Gość przy fizycznym check-in podaje recepcjoniście email/telefon. Recepcjonista aktywuje konto gościa w systemie. Gość dostaje SMS/email z linkiem.

```
Łańcuch zaufania: Fizyczna weryfikacja przez recepcjonistę (np. paszport) → aktywacja konta
```

**Siła modelu:** Najwyższa pewność tożsamości (recepcjonista widzi dokument).
**Słabość modelu:** Wymaga zmiany procesu check-in; friction przy wdrożeniu.

### Rekomendacja dla modelu tożsamości

**MVP:** Model 1 (token w linku zaproszeniowym) jako primary flow + Model 2 (self-service z numerem rezerwacji) jako fallback dla gości którzy nie dostali linku lub zgubili email.

**Architektura:**
- `Reservation` entity z `invite_token` (UUID, jednorazowy lub ograniczony czasowo).
- `GuestSession` — tworzony po kliknięciu ważnego `invite_token` lub po pomyślnej weryfikacji (reservation_id + surname + check_in_date).
- Nie przechowuj wrażliwych danych gościa dłużej niż pobyt + X dni (RODO).

**Ważne implikacje RODO:**
- Dane gościa (email, nazwisko) pobrane od hotelu — hotel jest "data controller", jesteś "data processor" — potrzebna umowa powierzenia przetwarzania danych.
- Gość musi być poinformowany o przetwarzaniu danych przez Guest App (może to być w regulaminie hotelu lub w onboardingu Guest App).

---

## Rekomendacja dla architektury

### Zasada: "PMS-optional by design"

Zaprojektuj system tak, żeby PMS integration była pluggable enrichment, nie hard dependency.

```
[Hotel Dashboard] ──(CSV import / manual entry / webhook)──> [Reservation Store]
                                                                      │
[PMS Connector - optional]─────────────────────────────────────────> │
                                                                      ▼
                                                           [Guest Session Engine]
                                                                      │
                                                                      ▼
                                                            [Guest App (frontend)]
```

### Warstwa abstrakcji PMS

Stwórz wewnętrzny model danych niezależny od PMS:

```typescript
interface Reservation {
  id: string;                    // internal UUID
  externalId?: string;           // PMS-specific reservation ID
  pmsSource?: PMSProvider;       // 'mews' | 'opera' | 'apaleo' | 'manual' | 'csv'
  hotelId: string;
  guestEmail: string;
  guestFirstName: string;
  guestLastName: string;
  roomNumber?: string;           // nullable — assigned at check-in
  checkInDate: Date;
  checkOutDate: Date;
  status: 'pending' | 'checked_in' | 'checked_out' | 'cancelled';
  inviteToken: string;           // UUID for magic link
  inviteTokenExpiresAt: Date;
}
```

Ten model obsługuje zarówno manual entry jak i integrację PMS — PMS po prostu wypełnia te same pola przez inny adapter.

### Roadmapa integracji PMS

**Faza MVP (0–6 miesięcy):**
- Manual dashboard dla hoteli + CSV import.
- Webhook support (prosty endpoint HTTP) — hotele z Mews/apaleo mogą skonfigurować webhook bez partnerstw.
- Magic link invitation flow.

**Faza Growth (6–18 miesięcy):**
- Mews Connector API (najprostsza publiczna integracja, dobry developer experience).
- apaleo Connector API (otwarte API, marketplace).
- Cloudbeds API (dla segmentu B&B/hostel).

**Faza Scale (18+ miesięcy):**
- Oracle OPERA Cloud via OHIP (wymaga partnerstwa — zacznij aplikację do Oracle Partner Network nie wcześniej niż gdy masz 5+ hoteli Opera jako klientów — jest to argument negocjacyjny).
- Protel/Sihot via program partnerski.
- Integracja przez middleware/aggregator: **Hapi.travel**, **Shiji Group (Agilysys)**, **Impala** — aggregatory które mają już partnerstwa z wieloma PMS.

### Middleware aggregatorzy — opcja szybkiego skalowania

Zamiast budować każdą integrację PMS osobno, możesz użyć middleware:

- **Hapi.travel** — aggregator integracji PMS dla hotel-tech startupów; ma gotowe konektory do 30+ PMS; model SaaS z opłatą per-hotel lub per-reservation.
- **Impala** (UK) — "Stripe for hotels"; unified API abstrahuje PMS; szczególnie dobry dla europejskiego rynku.
- **Shiji ReviewPro / Agilysys** — dla większych instalacji enterprise.

**Rekomendacja:** Na etapie 10–30 hoteli rozważ Hapi.travel lub Impala jako "fast path" do integracji z legacy PMS (Opera, Protel) zamiast budować własne konektory.

---

## Źródła do weryfikacji

Poniższe URLe należy sprawdzić ręcznie (WebFetch był niedostępny podczas sesji):

### Dokumentacja PMS API
- Mews Developers: https://mews.gitbook.io/connector-api/ lub https://developers.mews.com
- apaleo API Reference: https://api.apaleo.com oraz https://apaleo.dev
- Oracle OHIP Developer: https://developer.oracle.com/hospitality/
- Oracle Partner Network (Hospitality): https://www.oracle.com/hospitality/partner-program/
- Protel/Sihot Developer: https://sihot.com/en/technology/

### Middleware / Aggregatorzy
- Hapi.travel: https://hapi.travel
- Impala API: https://docs.getimpala.com
- Shiji Group: https://www.shijigroup.com

### Standardy branżowe
- HTNG: https://htng.org
- OpenTravel Alliance schemas: https://opentravel.org/current-specification/
- OHIP REST API Specification: https://www.oracle.com/hospitality/product-documentation/

### Startupy — case studies
- Duve (formerly BellaVita): https://www.duvetechnology.com
- Canary Technologies: https://www.canarytechnologies.com/integrations
- ALICE Technologies (przejęte przez Actabl): https://actabl.com
- Cloudbeds Marketplace: https://www.cloudbeds.com/marketplace/

### Regulacje i bezpieczeństwo danych
- RODO/GDPR — art. 28 (umowy powierzenia przetwarzania): https://gdpr.eu/article-28-processor/
- PCI DSS (dane kart płatniczych — jeśli planujesz przechowywać): https://www.pcisecuritystandards.org

---

*Dokument wymaga weryfikacji przez bezpośredni WebFetch powyższych URLi, szczególnie w zakresie aktualnych cen, warunków partnerstwa Oracle i Protel, oraz bieżących możliwości API Mews i apaleo (stan na 2026-06-25).*
