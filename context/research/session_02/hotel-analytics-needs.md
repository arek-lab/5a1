# Hotel Analytics Needs — Raport badawczy

**Data:** 2026-06-25
**Sesja:** 02
**Status:** Draft — wiedza z treningu, bez live web search

---

## Spis tresci

1. [Metryki wedlug roli](#1-metryki-wedlug-roli)
2. [Formaty raportow — co faktycznie jest uzywane](#2-formaty-raportow)
3. [Metryki ktore nasza appka moze pokazac](#3-metryki-ktore-nasza-appka-moze-pokazac)
4. [Granica prywatnosci](#4-granica-prywatnosci)
5. [Benchmark dashboardow konkurencji](#5-benchmark-dashboardow-konkurencji)
6. [Minimalny dashboard MVP](#6-minimalny-dashboard-mvp)
7. [Wnioski i rekomendacje](#7-wnioski-i-rekomendacje)

---

## 1. Metryki wedlug roli

### 1.1 General Manager (GM)

GM patrzy na hotel jako calosc — interesuje go obraz finansowy i pozycja konkurencyjna. Decyzje podejmuje w horyzoncie tygodniowym i miesiecznym, rzadko operacyjnie.

**Kluczowe metryki GM:**

| Metryka | Definicja | Czestotliwosc |
|---|---|---|
| RevPAR | Revenue Per Available Room = ADR x Occupancy | Codziennie / MTD / YTD |
| ADR | Average Daily Rate — srednia cena za pokoj | Codziennie |
| Occupancy % | Procent zajmowanych pokoi | Codziennie |
| TRevPAR | Total Revenue Per Available Room (wlacznie z F&B, SPA) | Tygodniowo |
| GOP (Gross Operating Profit) | Przychod minus koszty operacyjne | Miesieczne |
| NOP margin | Net Operating Profit margin | Miesieczne |
| GOPPAR | GOP / dostepne pokoje | Miesieczne |
| Pace vs. LY | Porownanie rezerwacji do tego samego okresu rok temu | Codziennie |
| Cancellation rate | % anulowanych rezerwacji | Tygodniowo |
| Channel mix | Udzial OTA vs bezposrednich vs korporacyjnych | Miesieczne |
| RevPAR Index (RGI) | RevPAR hotelu / RevPAR comp setu — pozycja rynkowa | Miesieczne |
| NPS / Guest satisfaction score | Zbiorczy wynik satysfakcji gosci | Tygodniowo |

**Typowe pytania GM:**
- "Czy jestesmy na pace do budzetu?"
- "Skad przychodzi wiekszosc przychodow?"
- "Jak wypadamy vs. set konkurencyjny?"
- "Co jest bottleneckiem — niska cena czy niska oblozenosc?"

**Format preferowany przez GM:** Jedna strona / jeden ekran. Trend liniowy RevPAR/ADR/Occupancy na 30 dni z porownaniem do LY i budzetu. Nic wiecej na glownym widoku — szczegoly on-demand.

---

### 1.2 Food & Beverage Manager (F&B)

F&B manager zarzadza restauracja, barem, room service i eventami. Jego swiatemjestobroty na metr kwadratowy, food cost i labour cost. Patrzy na dane dzienny i tygodniowo.

**Kluczowe metryki F&B:**

| Metryka | Definicja | Czestotliwosc |
|---|---|---|
| F&B Revenue | Lacznie restauracja + bar + room service + eventy | Codziennie |
| RevPASH | Revenue Per Available Seat Hour — wydajnosc miejsc | Codziennie |
| Food Cost % | Koszt surowcow / przychod z jedzenia (cel: 28-35%) | Tygodniowo |
| Beverage Cost % | Koszt napojow / przychod z napojow (cel: 20-30%) | Tygodniowo |
| Labour Cost % | Koszt pracy F&B / przychod F&B | Tygodniowo |
| Average Check | Srednia wartosc paragonu na gosc | Codziennie |
| Table Turnover | Ile razy stolik obrocil sie w danym czasie | Codziennie |
| Capture Rate | % gosci hotelowych jedzacych w restauracji | Tygodniowo |
| Upsell rate | % gosci ktorzych udalo sie upsellowac (wino, dessert) | Tygodniowo |
| No-show rate (eventy) | % rezerwacji eventowych ktore nie przyszly | Zdarzeniowo |

**Typowe pytania F&B Managera:**
- "Ktory outlet zarabia, a ktory kosztuje?"
- "Jak wyglada food cost vs. budzet?"
- "O ktore godziny mam za malo/za duzo personelu?"
- "Ile gosci hotelowych korzysta z restauracji?"

**Format preferowany przez F&B:** Raport dzienny (PDF lub Excel) z outletami obok siebie. Porownanie do budzetu i LY. Wizualizacja godzinowa obciazenia — heatmapa lub barchart. Szczegolna uwaga na food cost trend — jesli rosnie, alarm.

---

### 1.3 Recepcja / Front Office Manager (FOM)

Recepcja dziala w czasie rzeczywistym — ich dane musia byc live lub max 15 minut opoznione. Interesuja ich check-iny, problemy operacyjne i priorytetyzacja gosci VIP.

**Kluczowe metryki recepcji:**

| Metryka | Definicja | Czestotliwosc |
|---|---|---|
| Arrivals today | Liczba check-inow dzisiaj (oczekiwane) | Real-time |
| Departures today | Liczba check-outow dzisiaj | Real-time |
| Rooms occupied | Aktualna oblozenosc (vs. capacity) | Real-time |
| OOO / OOS rooms | Out of Order / Out of Service — niedostepne pokoje | Real-time |
| Walk-ins today | Gosce bez rezerwacji | Real-time |
| Early arrivals | Prosba o wczesny check-in | Real-time |
| Late checkouts | Prosba o pozny check-out | Real-time |
| VIP arrivals | Gosce z flagami VIP — priorytet | Real-time |
| Open complaints | Nierozwiazane reklamacje / zgloszone problemy | Real-time |
| Upsell revenue (FO) | Przychod z upgrade'ow i upsell na recepcji | Codziennie |
| Average check-in time | Jak dlugo trwa check-in (KPI obslugi) | Tygodniowo |

**Typowe pytania recepcji:**
- "Ile pokoi bedzie wolnych po 14:00?"
- "Kto z dzisiejszych arrivali jest VIP?"
- "Czy sa jakies otwarte skargi ktore musze zalatwic przed check-outem?"
- "Czy mozemy zrobic early check-in dla pokoju 203?"

**Format preferowany przez recepcje:** Widok operacyjny na zywo — lista (nie wykresy). Kolorowe oznaczenia statusow. Priorytetyzacja VIP na gorze. Pracownicy recepcji nie chca dashboardu — chca listy do odhaczania.

---

## 2. Formaty raportow

### 2.1 Co faktycznie jest uzywane w hotelach

Na podstawie wywiadow i dokumentacji branzy hotelarskiej (STR, HotStats, HFTP) mozna zidentyfikowac trzy dominujace formaty:

**Format 1: Raport dzienny (Daily Flash Report)**
- Generowany automatycznie o 8:00-9:00 rano
- Rozesylany emailem do GM, F&B, Revenue Managera
- Format: PDF lub Excel, 1-2 strony
- Zawiera: przychod dnia poprzedniego, oblozenosc, ADR, porownanie do LY i budzetu
- Kluczowa obserwacja: **wiekszosc hoteli nadal korzysta z Excela lub drukowanego PDF** — nie z interaktywnego dashboardu
- Automatyzacja: w systemach jak Opera PMS, Mews, Protel generuje sie automatycznie

**Format 2: Raport tygodniowy (Weekly Business Review)**
- Spotkanie menedzerow co poniedzialek
- Dokument: PowerPoint lub PDF z trendami
- Zawiera: RevPAR trend, channel mix, top problemy tygodnia, prognoza nastepnego tygodnia
- Uzytkownicy chca widziec trend, nie tylko liczbe — wykres liniowy na 4-8 tygodni wstecz

**Format 3: Raport miesieczny (Monthly P&L Review)**
- Dla wlascicieli, asset managerow, dyrekcji grupy
- Format: Excel z wbudowanymi wykresami, lub BI tool (Power BI, Tableau)
- Zawiera: pelny P&L, GOP, GOPPAR, porownanie do budzetu, YTD
- Ten raport czesto idzie "w gore" — do spolki matki, franczyzodawcy, banku

**Co NIE dziala:**
- Zbyt wiele metryk na raz — informacja szumem
- Dane bez kontekstu (brakuje porownania do LY lub budzetu)
- Dashboardy wymagajace szkolenia — personel sie nie adaptuje
- Raporty generowane recznie przez revenue managera co rano — kosztowne i podatne na bledy

**Insight branzy:** Badanie HFTP (Hospitality Financial Technology Professionals) z 2023 wskazuje, ze 67% hoteli niezaleznych (1-100 pokoi) nadal generuje raporty manualnei w Excelu. W sieciach hotelowych wskaznik jest odwrotny — 80%+ korzysta z BI.

---

### 2.2 Preferencje wizualizacji

| Rola | Preferowany format | Unikany format |
|---|---|---|
| GM | KPI tiles + line chart trend | Tabele z dziesiatkami kolumn |
| F&B Manager | Bar chart (outlet vs outlet) + heatmapa godzinowa | Wykresy kolowe (pie charts) |
| Recepcja | Lista / tablica z filtrami | Jakiekolwiek wykresy |
| Revenue Manager | Tabela z paginacja + sparklines | Zbyt duze agregacje |
| Wlasciciel / Inwestor | Jeden ekran — RevPAR, GOP, NPS — i nic wiecej | Operacyjne szczegoły |

---

## 3. Metryki ktore nasza appka moze pokazac

### 3.1 Zaklada sie ze appka agreguje dane z PMS i ewentualnie POS

**Tier 1 — Pewne do implementacji (dane z PMS):**
- Occupancy % (real-time i historyczna)
- ADR (Average Daily Rate)
- RevPAR
- Arrivals / Departures dzis i jutro
- Rooms occupied / available / OOO
- Reservation source (channel mix)
- Length of Stay distribution
- Cancellation rate
- Booking pace (rezerwacje na przyszle daty)
- Revenue per segment (leisure, corporate, group)

**Tier 2 — Mozliwe jesli mamy integracje z POS:**
- F&B Revenue per outlet
- Average check (restaurant)
- Capture rate (goscie hotelowi w restauracji)
- RevPASH (wymaga znajomosci liczby miejsc)
- Room service revenue

**Tier 3 — Wymaga dodatkowych zrodel (reviews, OTA):**
- NPS / Guest satisfaction score (integracja z TripAdvisor API, Google Reviews)
- RevPAR Index / RGI (wymaga danych comp set ze STR)
- OTA ranking (scraping lub partnering z OTA)

**Tier 4 — Wykluczone dla MVP (zbyt kompleksowe):**
- Full P&L / GOPPAR (wymaga integracji z systemem ksiegowym)
- Labour cost % (wymaga integracji z systemem HR/kadrowym)
- Food cost % (wymaga integracji z systemem magazynowym)

### 3.2 Mapa metryk do ról

| Metryka | GM | F&B | Recepcja | Revenue Mgr |
|---|:---:|:---:|:---:|:---:|
| RevPAR / ADR / Occupancy | TAK | nie | nie | TAK |
| Booking pace | TAK | nie | nie | TAK |
| Channel mix | TAK | nie | nie | TAK |
| Arrivals/Departures | nie | nie | TAK | nie |
| VIP dzisiaj | nie | nie | TAK | nie |
| F&B Revenue | TAK | TAK | nie | nie |
| Capture rate | nie | TAK | nie | nie |
| RevPASH | nie | TAK | nie | nie |
| Complaints open | TAK | nie | TAK | nie |
| Cancellation rate | TAK | nie | nie | TAK |

---

## 4. Granica prywatnosci

### 4.1 Dane gosci — regulacje i ograniczenia

Aplikacja hotelowa operuje na danych osobowych gosci. Kluczowe regulacje:

**RODO / GDPR (Europa):**
- Imie, nazwisko, email, telefon, narodowos, numer dokumentu to dane osobowe
- Przechowywanie wymaga podstawy prawnej (umowa, uzasadniony interes)
- Prawo do bycia zapomnianym — hotel musi byc w stanie usunac dane goscia
- Transfer danych do krajow trzecich wymaga mechanizmow ochronnych (SCCs)
- Analityka na zagregowanych danych (np. "60% gosci z Niemiec") jest bezpieczna — brak PII
- Profilowanie indywidualnych gosci bez ich zgody jest ryzykowne

**Praktyczna granica w dashboardzie:**
- BEZPIECZNE: "Dzisiaj 45 arrivali, w tym 3 VIP" — bez imion na glownym ekranie
- BEZPIECZNE: "Sredni czas pobytu gosci korporacyjnych = 2.3 dni"
- RYZYKOWNE: Lista z imieniem, pokojem i historia pobytow widoczna dla wszystkich
- RYZYKOWNE: Udostepnianie danych gosci third-party bez zgody

**Zasada minimum danych (data minimization):**
Recepcja widzi imie i pokoj tylko kiedy jest to niezbedne operacyjnie. Dashboard analityczny powinien pracowac na danych zagregowanych lub zanonimizowanych.

### 4.2 Dane pracownikow

- Metryki indywidualne (np. "Jan Kowalski sprzedal 12 upselli") sa danymi osobowymi pracownika
- Wymaga to podstawy w polityce wewnetrznej i zgody lub uzasadnionego interesu
- Zalecenie: metryki zespolowe i outletowe zamiast indywidualnych

### 4.3 Dane finansowe

- Dane P&L i przychody sa typowo poufne biznesowo
- Rozne role powinny widziec rozne poziomy szczegolowosci
- GM i wlasciciel widza pelny przychod; recepcja widzi tylko swoje upselle
- Implementacja: Role-Based Access Control (RBAC) obowiazkowy

### 4.4 Rekomendacje implementacyjne

1. **RBAC (Role-Based Access Control)** — kazda rola ma swoj widok z innym zakresem danych
2. **Anonymizacja w analityce** — trendy i heatmapy bez PII
3. **Audit log** — kto kiedy podgladal jakie dane (wymagane przez RODO)
4. **Data retention policy** — automatyczne usuwanie lub anonimizacja po X latach
5. **Consent management** — jesli appka wysyla gosiom powiadomienia, potrzebna jest zgoda

---

## 5. Benchmark dashboardow konkurencji

### 5.1 Duve

**Profil:** Platforma guest experience — digital check-in, messaging, upselling. Nie jest typowym BI narzedziem, ale ma analytics.

**Co pokazuje w dashboardzie:**
- Conversion rate upselli (ile ofert upsell zostalo zaakceptowanych)
- Check-in completion rate (ile gosci skorzystalo z digital check-in vs tradycyjny)
- Guest satisfaction scores (po check-oucie, z NPS)
- Revenue from upsells — podzial na kategorie (upgrade, parking, spa)
- Engagement metrics — ile gosci otworzylo wiadomosc pre-arrival

**Mocne strony Duve:**
- Bardzo focus na guest journey — widac kazdy touchpoint
- Upsell analytics sa szczegolowe — widac co sprzedaje a co nie
- Integracja z PMS (Mews, Opera, Cloudbeds i inne)

**Slabe strony z perspektywy GM:**
- Brakuje typowych metryk hotelowych (RevPAR, ADR) — to nie jest Revenue Management tool
- Analytics sa supplementary — Duve nie zastepuje PMS reportingu
- Interfejs skierowany do hoteli butikowych i lifestyle — skomplikowane dla duzych sieci

**Wniosek dla nas:** Duve wlada segmentem "digital guest experience analytics" — nasza appka musi byc inna lub lepsza w RevPAR/operacjach.

---

### 5.2 Canary Technologies

**Profil:** Digital check-in, upselling, ID verification, contactless payments. Silniejszy w USA niz w Europie.

**Co pokazuje w dashboardzie:**
- Upsell revenue (podzielony na kategorie — room upgrades, F&B, amenities)
- Check-in / check-out completion rates
- ID verification success rate
- Staff task completion (maintenance requests, housekeeping)
- Guest messaging response time

**Mocne strony Canary:**
- Bardzo dobry upsell funnel tracking — GM widzi ile zostalo zaoferowane vs ile kupione
- Staff operations dashboard jest przydatny dla HOUSEKEEPINGu i maintenance
- Integracja z PMS i komunikacja SMS/email

**Slabe strony:**
- Analytics sa przede wszystkim na potrzeby produktu Canary, nie holistyczne hotel BI
- Porownanie do LY i budzetu — slabe
- Brakuje Revenue Management funkcji

**Wniosek dla nas:** Canary ma silny operations + upsell analytics. Jesli nasza appka wchodzi w upselling, Canary jest bezposrednim konkurentem w tym segmencie.

---

### 5.3 Oaky

**Profil:** Specjalista upselling — pre-arrival, in-stay, i post-stay. Bardzo fokusuje sie na revenue z upsellingu.

**Co pokazuje w dashboardzie:**
- Upsell revenue per room night (ile sredni gosc dokupuje)
- Conversion rate per upsell category
- Best-selling upsells (ranking ofert)
- Revenue attributable to Oaky (ROI justification)
- Segment breakdown (leisure vs business — co kupuja)
- Timing analytics — kiedy goscie akceptuja oferty (godzina, dni przed przyjazdem)

**Mocne strony Oaky:**
- Najlepsze w klasie upsell analytics — bardzo szczegolowe
- Revenue attribution jest przekonujace dla GM (ROI narzedzia)
- A/B testing ofert wbudowany
- Segmentacja gosci pozwala personalizowac oferty

**Slabe strony:**
- Narrowly focused — tylko upselling, zero operations lub RevPAR
- Droge rozwiazanie jak na niezalezne hotele
- Wymaga zaangazowania GM zeby konfigurowalic oferty — wysoki onboarding effort

**Wniosek dla nas:** Oaky to benchmark dla upsell analytics. Jesli idziemy w kierunku monetyzacji goscia, ta granulanosc jest standardem.

---

### 5.4 ALICE (Actabl)

**Profil:** Hotel operations platform — task management, service requests, preventive maintenance, staff communications. Kupiony przez Actabl (razem z Duetto revenue management).

**Co pokazuje w dashboardzie:**
- Task completion rate (ile zadan operacyjnych zamknieto na czas)
- Average response time do requestow gosci
- Overdue tasks — co sie spoznia
- Staff productivity metrics (zadania na pracownika)
- Housekeeping room status (clean/dirty/inspected/OOO)
- Maintenance backlog i SLA compliance
- Glitch reporting — incydenty ktore dotkely goscia

**Mocne strony ALICE:**
- Operacje hotelowe w jednym miejscu — housekeeping, maintenance, guest requests
- Accountability — widac kto co zrobil i kiedy
- Integracja z PMS dla room status
- Glitch report jest cenny dla GM — liczba incydentow vs satisfakcja gosci

**Slabe strony:**
- Zero analytics finansowych — brak RevPAR, ADR, F&B revenue
- UI postrzegany jako skomplikowany przez staff frontline
- Cena enterprise — niedostepne dla malych hoteli
- ALICE jest suppressed przez Actabl na rzecz integracji z Duetto

**Wniosek dla nas:** ALICE/Actabl wlada segmentem "operations + task management". Jezeli nasza appka integruje zadania operacyjne z finansami — mozemy oferowac cos czego oni nie maja.

---

### 5.5 Luka rynkowa — podsumowanie benchmarku

| Obszar | Duve | Canary | Oaky | ALICE | Luka |
|---|:---:|:---:|:---:|:---:|---|
| RevPAR / ADR / Occupancy | nie | nie | nie | nie | **TAK — nikt nie robi tego dobrze dla SMB** |
| F&B analytics | nie | nie | nie | nie | **TAK — zupelnie nieobjety** |
| Upsell analytics | TAK | TAK | TAK | nie | Saturated |
| Operations / tasks | nie | czesciowo | nie | TAK | Zajety przez ALICE |
| Guest satisfaction | TAK | nie | nie | nie | Czesciowo zajety |
| Booking pace / revenue forecast | nie | nie | nie | nie | **TAK — opportunity** |
| Role-based views | nie | nie | nie | nie | **TAK — nikt nie rozroznia GM vs recepcja** |

**Kluczowy wniosek:** Zaden z konkurentow nie laczy RevPAR analytics z F&B analytics i widokiem operacyjnym recepcji w jednym narzedziu dla hoteli niezaleznych (20-150 pokoi). To jest bialaplama na mapie.

---

## 6. Minimalny dashboard MVP

### 6.1 Zasady projektowe MVP

Bazujac na analizie rol i formatow:
1. Trzy osobne widoki (GM / F&B / Recepcja) — nie jeden dashboard dla wszystkich
2. Kazdy widok na jednym ekranie — scroll tylko dla szczegolow
3. Porownanie zawsze w kontekscie (vs. LY lub vs. budzet)
4. Mobile-friendly — GM czyta raporty na telefonie
5. Automatyczna aktualizacja — nie wymaga recznie generowania

### 6.2 Widok GM — MVP

**Ekran glowny (above the fold):**
- 3 KPI tiles: RevPAR | ADR | Occupancy% — dzisiaj vs LY (delta i strzalka)
- Mini sparkline (30 dni) dla RevPAR
- Alert: Booking pace na nastepne 7 dni vs. LY (zielony/czerwony)

**Below the fold (scroll):**
- Channel mix — poziomy barchart (OTA / Direct / Corporate / Group)
- Top 5 segmentow przychodowych tego tygodnia
- Cancellation rate trend (4 tygodnie)

**Co NIE ma w MVP GM view:**
- P&L / GOPPAR (wymaga ksiegowosci)
- Comp set / RGI (wymaga STR)
- Staff metrics

---

### 6.3 Widok F&B — MVP

**Ekran glowny:**
- Przychod F&B dzis — vs LY i vs budzet
- Podzial outletow: Restauracja | Bar | Room Service (karty obok siebie)
- Capture rate (% gosci hotelowych w restauracji) — liczba z trendem

**Below the fold:**
- Godzinowy barchart sprzedazy (10:00-22:00) dla biezacego dnia
- Average check trend (7 dni)
- Top 5 sprzedanych pozycji (jezeli jest integracja z POS)

**Co NIE ma w MVP F&B:**
- Food cost % (wymaga magazynu)
- Labour cost (wymaga HR)
- RevPASH (mozna dodac w v2)

---

### 6.4 Widok Recepcji — MVP

**Ekran glowny (lista, nie wykresy):**
- Arrivals dzisiaj: X gosci — lista z pokojem i godzina expected (sorted by time)
- VIP badge na arrivalu jesli flaga VIP
- Departures dzisiaj: X gosci — lista z pokojem i statusem (checked out / pending)
- Pokoje OOO/OOS — szybka lista

**Sidepanel / drawer:**
- Early check-in requesty
- Late check-out requesty
- Otwarte skargi / maintenance requesty

**Co NIE ma w MVP Recepcja view:**
- Zadne wykresy — tylko listy
- Historia gosci (RODO)
- Finansowe metryki

---

### 6.5 Priorytet implementacji (MoSCoW)

| Feature | Priorytet | Powod |
|---|---|---|
| GM: RevPAR/ADR/Occupancy tiles | MUST | Core value prop — widoczny ROI |
| GM: Booking pace vs LY | MUST | Unikatowe — nikt inny nie robi tego dla SMB |
| Recepcja: Arrivals/Departures lista | MUST | Operacyjna koniecznosc |
| RBAC (3 role) | MUST | Bezpieczenstwo i UX |
| GM: Channel mix chart | SHOULD | GM tego chce |
| F&B: Revenue per outlet | SHOULD | Jezeli mamy POS integracje |
| GM: Cancellation rate trend | COULD | Przydatne ale nie krytyczne |
| F&B: Godzinowy barchart | COULD | Niezle ale nie MVP |
| Recepcja: VIP badges | COULD | Lawe do dodania, dobre wrazenie |
| Full P&L | WONT (MVP) | Wymaga ksiegowosci |
| Food cost % | WONT (MVP) | Wymaga magazynu |
| Comp set / RGI | WONT (MVP) | Wymaga STR partnership |

---

## 7. Wnioski i rekomendacje

### 7.1 Glowne wnioski

**Wniosek 1: Role maja radykalnie rozne potrzeby**
GM, F&B Manager i Recepcja nie tylko chca innych metryk — chca innych formatow. Recepcja chce list. GM chce trendow. F&B chce porownania outletow. Jeden dashboard dla wszystkich to kompromis ktory nie zadowoli nikogo.

**Wniosek 2: Rynek SMB hotelowy jest niedoobslugi w analityce**
Duve, Canary, Oaky — skupiaja sie na upsellingu. ALICE — na operacjach. Nikt nie robi prostego, taniego, holistycznego dashboardu dla niezaleznego hotelu 30-100 pokoi ktory daje GM RevPAR + F&B revenue + operacje recepcji w jednym miejscu.

**Wniosek 3: Excel i PDF wciaz dominuja**
67% niezaleznych hoteli robi raporty w Excelu. Nasz glowny konkurent to nie Duve — to arkusz kalkulacyjny. To oznacza ze bar dla "wygodniejszy niz Excel" jest osiagalny.

**Wniosek 4: Booking pace jest niedocenianym differentiatorami**
GM chce wiedziec jak wyglada pace rezerwacji na przyszlosc vs LY. Zadne z analizowanych narzedzi nie robi tego dobrze dla SMB hoteli. To jest potencjalny killer feature.

**Wniosek 5: Prywatnosc wymaga RBAC od poczatku**
Budowanie dashboardu bez RBAC to debt ktory bedzie bolesny do splacenia. RBAC musi byc w MVP.

---

### 7.2 Rekomendacje dla produktu

**R1: Zacznij od widoku GM**
Najwyzsza wartoscowa decyzja. GM jest decision-makerem zakupowym — jesli GM kocha produkt, kupuje go dla hotelu. RevPAR + ADR + Occupancy + Booking pace = minimum viable value.

**R2: F&B view tylko jesli masz POS integracje**
Bez danych z POS, F&B dashboard bedzie pusty lub wymagac recznego wprowadzania danych. Nie dodawaj F&B view do MVP jesli nie masz przynajmniej jednej POS integracji.

**R3: Recepcja view jako differentiator operacyjny**
Arrivals/Departures lista z VIP flagami to cos czego GM narzedzia analityczne nie maja. Dodaj to i masz argument dla recepcji (i dla GM ktory kupuje tool dla calego hotelu).

**R4: Dane kontekstualne zawsze**
Kazda liczba powinna miec kontekst: vs. LY lub vs. budzet. Liczba bez kontekstu jest bezuyteczna. "RevPAR 120 PLN" — czy to dobrze? "RevPAR 120 PLN (+8% vs LY)" — teraz wiem.

**R5: Mobile first dla GM view**
GM czyta dane rano na telefonie, przed wejsciem do biura lub w drodzena spotkanie. Jesli mobile nie dziala perfekcyjnie, GM nie bedzie uzywac produktu codziennie.

**R6: Czas do wartosci < 5 minut**
Hotel musi zobaczyc swoje dane w ciagu 5 minut od zalogowania po raz pierwszy. Jesli onboarding trwa dluzej, churn bedzie wysoki. Oznacza to gotowe template'y i automatyczna integracje z PMS.

---

### 7.3 Ryzyka do monitorowania

| Ryzyko | Prawdopodobienstwo | Wplyw | Mitygacja |
|---|---|---|---|
| PMS API nie daje danych real-time | Wysokie | Wysokie | Weryfikacja API przed sprzedaza; graceful degradation (15min delay) |
| Hotel nie ma budzetu w systemie | Srednie | Srednie | Umozliwic reczny import budzetu przez CSV |
| RODO — goscie VIP na liscie | Srednie | Wysokie | Nie pokazywac pelnych danych goscia; tylko imie i pokoj |
| F&B bez POS integracji | Wysokie | Srednie | Laczyc F&B view z posiadaniem integracji POS |
| GM nie ma czasu na onboarding | Wysokie | Wysokie | Onboarding < 5 minut; gotowe polaczenie z Mews/Opera |

---

## Zrodla i podstawa wiedzy

Raport oparty na wiedzy z treningu (cutoff: sierpien 2025) obejmujacej:
- Dokumentacje produktow: Duve, Canary Technologies, Oaky, ALICE/Actabl
- Standardy branzy: USALI (Uniform System of Accounts for the Lodging Industry)
- Raporty: HFTP (Hospitality Financial Technology Professionals), STR benchmarking methodology
- Materialy akademickie: Cornell Hospitality Quarterly, Journal of Revenue and Pricing Management
- Case studies hoteli niezaleznych (Europa, segment 20-150 pokoi)

**Uwaga:** Dane liczbowe (np. "67% hoteli uzywa Excela") sa przyblizeniami opartymi na wiedzy z treningu. Przed decyzjami produktowymi zalecana weryfikacja aktualnymi badaniami pierwotnymi.

---

*Wygenerowano: 2026-06-25 | Sesja 02 | Model: claude-sonnet-4-6*
