# RODO Analysis — Hotel Guest App
*Sesja 1 — Badanie przeprowadzone: 2026-06-25*

> **Uwaga metodologiczna:** Narzędzia WebSearch i WebFetch były niedostępne w tym środowisku (brak uprawnień). Analiza oparta jest na wiedzy z zakresu RODO do sierpnia 2025 r., obejmującej: Rozporządzenie 2016/679, wytyczne EDPB (05/2020 zgoda, 03/2022 dark patterns, 01/2017 DPO, 07/2020 pojęcia administratora/procesora), opinię WP29 248 (pliki cookies), polską Ustawę o ochronie danych osobowych z 10 maja 2018 r. oraz decyzje UODO. Przed wdrożeniem produkcyjnym zaleca się weryfikację pod kątem ewentualnych decyzji UODO i wytycznych EDPB wydanych po sierpniu 2025 r.

---

## Kluczowe ustalenia

- **Anonimowy token sesji bez żadnych danych identyfikacyjnych NIE jest sam w sobie daną osobową**, ale może się nią stać przez powiązanie z adresem IP lub danymi rezerwacji hotelowej.
- **Adres IP jest daną osobową** — potwierdził to TSUE w sprawie C-582/14 (Breyer), EDPB i UODO. Każdy log zawierający IP wymaga podstawy prawnej z art. 6 RODO.
- **Uzasadniony interes (art. 6 ust. 1 lit. f)** jest najsilniejszą podstawą dla technicznego przetwarzania w modelu "zero PII" — obejmuje logi bezpieczeństwa, zapobieganie nadużyciom, stabilność systemu.
- **Wykonanie umowy (art. 6 ust. 1 lit. b)** stosuje się do zamawiania usług (room service, spa, bagaż) — bez zgody, gdy gość aktywnie zleca usługę.
- **Hotel jest administratorem danych**, platforma SaaS jest procesorem — umowa powierzenia (DPA) jest wymagana nawet przy architekturze "zero PII", jeśli platforma przetwarza IP gości.
- **Prawdziwy "zero PII"** (brak IP w logach platformy, brak danych rezerwacji, jedynie opaque token) technicznie mógłby eliminować obowiązek DPA po stronie platformy, ale to architektura bardzo trudna do utrzymania w praktyce.
- **Czas retencji sesji** powinien być równy długości pobytu + krótki bufor (24-48h po wymeldowaniu) dla sesji aktywnych; logi techniczne — maksymalnie 30 dni przy IP, lub krócej.
- **Cookie consent** jest wymagany dla cookies niezbędnych do śledzenia/analityki; **nie jest wymagany** dla strictly necessary cookies (techniczne cookies sesji).

---

## Podstawa prawna przetwarzania (art. 6 RODO)

### Kontekst: gość wchodzi przez QR kod, brak rejestracji

Brak rejestracji nie eliminuje obowiązków RODO — liczy się **faktyczne przetwarzanie danych**, nie forma wejścia do systemu.

### Podstawy wchodzące w grę

#### 1. Wykonanie umowy — art. 6 ust. 1 lit. b
**Zastosowanie:** zamówienia usług hotelowych przez aplikację (room service, SPA, transport, bagaż).

Gdy gość aktywnie zamawia usługę, dochodzi do zawarcia umowy świadczenia usługi między gościem a hotelem. Przetwarzanie danych (token sesji, treść zamówienia, pokój) jest niezbędne do wykonania tej umowy. **Zgoda nie jest wymagana.**

Warunek: hotel musi być w stanie powiązać zamówienie z konkretnym gościem — jeśli jedynym identyfikatorem jest token sesji niepowiązany z rezerwacją, podstawa jest słabsza (token nie identyfikuje osoby w sensie prawnym).

**Praktyczne zastosowanie w Hotel Guest App:**
- Zamówienie room service: art. 6(1)(b) — wykonanie umowy
- Zgłoszenie usterki w pokoju: art. 6(1)(b) — wykonanie umowy (umowa zakwaterowania)
- Rezerwacja stołu w restauracji hotelowej: art. 6(1)(b)
- Prośba o usługi concierge (np. taksówka): art. 6(1)(b)

#### 2. Uzasadniony interes — art. 6 ust. 1 lit. f
**Zastosowanie:** techniczne przetwarzanie dla bezpieczeństwa, zapobiegania nadużyciom, logowanie błędów.

Test trójstopniowy (balancing test):
1. **Cel jest uzasadniony:** bezpieczeństwo systemu, zapobieganie atakom, debugowanie — TAK
2. **Przetwarzanie jest niezbędne:** logi z IP są standardem branżowym — TAK (przy minimalnym zakresie)
3. **Interesy gościa nie przeważają:** gość używający aplikacji hotelowej ma rozsądne oczekiwanie, że system loguje techniczne zdarzenia — TAK (przy krótkim czasie retencji)

**Zastosowanie:**
- Logi dostępu serwera (IP + timestamp + endpoint) — max 30 dni
- Logi błędów aplikacji — max 7-14 dni
- Detekcja anomalii/nadużyć (rate limiting) — czas trwania sesji + kilka dni

**Nie stosuje się** do: marketingu, profilowania, analizy zachowań gości.

#### 3. Zgoda — art. 6 ust. 1 lit. a
**Zastosowanie:** funkcje wykraczające poza wykonanie usługi i uzasadniony interes.

Wymagana dla:
- Analityka behawioralna (śledzenie kliknięć, heat mapy)
- Marketing (personalizacja ofert, komunikacja po wyjeździe)
- Cookies analityczne i marketingowe (tu na podstawie dyrektywy ePrivacy implementowanej przez Prawo Telekomunikacyjne, art. 173)
- Udostępnianie danych partnerom

**Kluczowy problem z modelem QR-code bez rejestracji:** skuteczna zgoda RODO musi być **swobodna, konkretna, świadoma i jednoznaczna** (art. 4 ust. 11). Przy wejściu przez QR kod zgoda zbierana jako "warunek wejścia do aplikacji" może być zakwestionowana jako nieswobodna. Rekomendacja: zbierać zgodę tylko dla funkcji opcjonalnych (analityka), nie blokować dostępu do usługi.

#### 4. Niezbędność do wypełnienia obowiązku prawnego — art. 6 ust. 1 lit. c
**Zastosowanie:** obowiązki hotelu jako przedsiębiorcy.

- Przechowywanie dokumentacji zamówień (rachunki, faktury) — przepisy podatkowe wymagają do 5 lat
- Ustawa z 29 sierpnia 1997 r. o usługach hotelarskich — wymogi ewidencji gości (art. 36 i 40)
- Inne przepisy branżowe

---

## Token sesji a dane osobowe

### Definicja danych osobowych (art. 4 ust. 1 RODO)
Dane osobowe to wszelkie informacje dotyczące **zidentyfikowanej lub możliwej do zidentyfikowania** osoby fizycznej. Kryterium: czy identyfikacja jest możliwa przy "rozsądnie prawdopodobnych środkach".

### Anonimowy token sesji — analiza

#### Scenariusz A: Czysty token (opaque identifier)
Token sesji generowany jako losowy ciąg znaków (np. UUID v4), niepowiązany z żadnymi danymi osobowymi, niełączony z IP, bez powiązania z rezerwacją.

**Status:** dane pseudonimowe lub anonimowe — zależy od tego, czy ktokolwiek może powiązać token z osobą.

- Jeśli **platforma** nie może powiązać tokenu z osobą → dla platformy: dane anonimowe, RODO nie stosuje się
- Jeśli **hotel** może powiązać token z rezerwacją (zna numer pokoju gościa) → dla hotelu: dane pseudonimowe, RODO stosuje się
- Dane pseudonimowe wciąż są danymi osobowymi (motyw 26 RODO)

**Wniosek dla architektury:** token sesji niepowiązany z rezerwacją = anonimowy dla platformy. Ale: jeśli hotel używa tokenu do identyfikacji gościa (przypisuje do pokoju/rezerwacji) — staje się daną osobową w kontekście hotelu.

#### Scenariusz B: Token + adres IP
Adres IP sam w sobie jest daną osobową (TSUE C-582/14 Breyer, 2016). Wyrok potwierdza, że **dynamiczny adres IP może być daną osobową**, gdy podmiot przetwarzający ma możliwość (przez dostawcę internetu lub inne legalne środki) ustalenia tożsamości.

- IP dynamiczne: dane osobowe, jeśli podmiot może uzyskać tożsamość (np. przez nakaz sądowy)
- IP statyczne: dane osobowe niemal zawsze
- IP + token sesji w tym samym logu: tworzy profil technicznej tożsamości — dane pseudonimowe

**Wniosek:** każdy log zawierający IP + timestamp + token sesji jest przetwarzaniem danych osobowych i wymaga podstawy z art. 6 RODO.

#### Scenariusz C: Token + dane rezerwacji (numer pokoju, nazwisko)
Gdy system hotelowy łączy token sesji z rezerwacją (np. gość skanuje QR z pokoju, aplikacja zna numer pokoju → PMS łączy pokój z rezerwacją → imię i nazwisko gościa):

- Token sesji staje się de facto identyfikatorem osoby
- Przetwarzanie podlega pełnym wymogom RODO
- Konieczna podstawa prawna (art. 6(1)(b) — wykonanie umowy zakwaterowania)
- Konieczna informacja RODO (art. 13)

### Podsumowanie matrycy

| Dane | Status RODO | Podstawa prawna |
|------|-------------|-----------------|
| Token sesji (czysty, bez powiązania) | Potencjalnie anonimowe (dla platformy) | Nie dotyczy |
| Token sesji + numer pokoju | Pseudonimowe | Art. 6(1)(b) |
| Token sesji + IP | Pseudonimowe | Art. 6(1)(f) |
| Token + IP + rezerwacja | Dane osobowe | Art. 6(1)(b) |
| Token + analityka zachowań | Dane osobowe | Art. 6(1)(a) — zgoda |

---

## Administrator vs Procesor

### Definicje (art. 4 RODO)
- **Administrator (controller):** podmiot, który samodzielnie lub wspólnie z innymi ustala cele i sposoby przetwarzania
- **Procesor (processor):** podmiot przetwarzający dane w imieniu administratora

### Hotel Guest App — podział ról

#### Hotel = Administrator danych
Hotel decyduje:
- Jakie dane gości zbierać (imię, numer pokoju, preferencje)
- W jakim celu (obsługa pobytu, marketing, fakturacja)
- Jak długo przechowywać (retencja dokumentacji)
- Komu udostępniać (partnerzy, systemy PMS)

Hotel ma bezpośrednią relację z gościem (umowa o zakwaterowanie).

**Konsekwencje dla hotelu jako administratora:**
- Obowiązek informacyjny wobec gości (art. 13 RODO) — musi poinformować gości o przetwarzaniu danych
- Prowadzenie rejestru czynności przetwarzania (art. 30) — jeśli przetwarzają dane regularnie lub na dużą skalę
- Odpowiedź na żądania gości (dostęp, usunięcie, sprzeciw) — art. 15-22
- Odpowiedzialność za naruszenia danych wobec UODO i gości
- Wyznaczenie IOD (DPO) jeśli przetwarzają dane na dużą skalę (duże sieci hotelowe)

#### Platforma SaaS = Procesor
Platforma SaaS:
- Przetwarza dane wyłącznie na polecenie hotelu
- Nie decyduje samodzielnie o celach przetwarzania
- Zapewnia infrastrukturę techniczną

**Konsekwencje dla platformy jako procesora:**
- Obowiązek zawarcia umowy powierzenia przetwarzania danych (DPA) z każdym hotelem (art. 28 RODO)
- Przetwarzanie tylko zgodnie z udokumentowanymi poleceniami administratora
- Wdrożenie odpowiednich środków technicznych i organizacyjnych (art. 32)
- Pomoc administratorowi w realizacji praw podmiotów danych
- Zgłaszanie naruszeń administratorowi bez zbędnej zwłoki
- Usunięcie lub zwrot danych po zakończeniu umowy
- Prowadzenie rejestru wszystkich kategorii czynności przetwarzania (art. 30 ust. 2)
- Sub-procesory: podpisanie umów z podwykonawcami (hosting, CDN, AI provider)

### Umowa DPA (Data Processing Agreement)

**Art. 28 RODO wymaga, aby DPA zawierała co najmniej:**
1. Przedmiot, czas trwania, charakter i cel przetwarzania
2. Rodzaj danych i kategorie podmiotów
3. Obowiązki i prawa administratora
4. Zakaz przetwarzania danych w innych celach
5. Zobowiązanie do zachowania poufności
6. Wdrożenie odpowiednich środków bezpieczeństwa
7. Warunki angażowania sub-procesorów
8. Pomoc w realizacji praw podmiotów
9. Usunięcie/zwrot danych po zakończeniu
10. Udostępnienie informacji do audytów

**Ważne w modelu multi-tenant SaaS:** każdy hotel (tenant) musi mieć odrębną umowę DPA lub umowa ramowa z załącznikiem per tenant.

### Czy "zero PII" eliminuje konieczność DPA?

**Odpowiedź: nie w pełni, ale znacząco redukuje zakres.**

Argumentacja:
1. Jeśli platforma przetwarza **wyłącznie** opaque tokeny i nigdy nie otrzymuje IP (np. serwer proxy hotelu anonimizuje IP przed przesłaniem do platformy), a tokeny są w pełni anonimowe — RODO technicznie nie stosuje się do platformy. DPA nie jest wymagane.
2. Jeśli jednak platforma przetwarza IP gości w logach dostępowych (standard webserverów) — przetwarza dane osobowe gości na zlecenie hotelu → DPA **jest wymagane**.
3. Jeśli platforma obsługuje AI concierge przetwarzający treść wiadomości gości — treść rozmów może zawierać dane osobowe → DPA wymagane.

**Praktyczny wniosek:** w Hotel Guest App z AI concierge i logami serwera, DPA jest niemal nieuniknione. Architektura "zero PII" jest aspiracyjna — wymaga bardzo ścisłego inżynieryjnego wdrożenia (anonymizacja IP na warstwie load balancera przed logowaniem, brak treści wiadomości w logach platformy, itp.).

**Rekomendacja:** podpisać DPA z każdym hotelem jako standard (niski koszt, zero ryzyka prawnego) i jednocześnie dążyć do architektury minimalizującej dane po stronie platformy.

---

## Czas retencji danych

### Zasada ogólna (art. 5 ust. 1 lit. e RODO)
Dane przechowywane nie dłużej niż jest to niezbędne do celów, w których są przetwarzane ("ograniczenie przechowywania").

### Retencja dla różnych kategorii danych w Hotel Guest App

#### Dane sesji technicznej (token + timestamp)
- **Cel:** obsługa żądań HTTP, autentykacja między requestami
- **Rekomendowana retencja:** czas pobytu gościa + 24-48h (buffer na late checkout i ewentualne reklamacje)
- **Maksimum przy sporach:** do 14 dni po wymeldowaniu
- **Podstawa:** art. 6(1)(f) uzasadniony interes

#### Logi dostępu serwera (IP + token + endpoint + timestamp)
- **Cel:** bezpieczeństwo, debugging, wykrywanie nadużyć
- **Rekomendowana retencja:** 7-30 dni
- **Branżowy standard:** 30 dni (rekomendacja CNIL, podobnie UODO)
- **Maksimum:** 90 dni przy udokumentowanym uzasadnieniu bezpieczeństwa
- **Podstawa:** art. 6(1)(f) uzasadniony interes

#### Dane zamówień (room service, usługi)
- **Cel:** realizacja usługi, rozliczenia, reklamacje
- **Rekomendowana retencja:** do wymeldowania + 30 dni (reklamacje)
- **Minimalna retencja dla rachunków/faktur:** 5 lat (przepisy podatkowe — art. 112 ustawy o VAT)
- **Podstawa:** art. 6(1)(b) wykonanie umowy, art. 6(1)(c) obowiązek prawny (dokumentacja podatkowa)

#### Historia rozmów z AI concierge
- **Cel:** obsługa gościa w trakcie pobytu
- **Rekomendowana retencja:** czas pobytu + 7 dni
- **Jeśli personalizacja między pobytami:** wymaga osobnej zgody (art. 6(1)(a))
- **Podstawa:** art. 6(1)(b) wykonanie umowy

#### Dane anonimowe/zagregowane (statystyki, analytics)
- **Cel:** analiza użytkowania, doskonalenie usług
- **Retencja:** nieograniczona — dane anonimowe nie podlegają RODO
- **Warunek:** prawdziwa anonimizacja (niemożność re-identyfikacji)

### Zasada domyślnej ochrony danych (art. 25 RODO — Privacy by Default)
Retencja powinna być **domyślnie najkrótsza możliwa**. Dłuższe okresy wymagają udokumentowanego uzasadnienia. Wdrożyć automatyczne procedury usuwania danych (data deletion jobs).

---

## Implikacje dla architektury

### 1. Identyfikator sesji — projektowanie

**Rekomendacja:** używać dwuwarstwowego modelu tokenów:
- **Session token** (w przeglądarce): krótkotrwały, losowy UUID, ważny na czas pobytu. Nie zawiera danych osobowych. Przechowywany w sessionStorage (nie localStorage).
- **Stay token** (backend): wiąże sesję z pobytem (numer pokoju, daty). Przechowywany wyłącznie po stronie serwera hotelowego (lub zaszyfrowany). Nigdy nie wysyłany do platformy SaaS wprost.

Platforma SaaS widzi tylko session token → dla niej dane anonimowe/pseudonimowe.

### 2. Anonimizacja IP w logach platformy

Wdrożyć anonimizację IP na poziomie load balancera lub nginx (usunięcie ostatniego oktetu IPv4 / ostatnich 80 bitów IPv6) przed zapisem do logów. Narzędzia: nginx `log_format` z `$remote_addr_trunc`, moduł GeoIP bez zapisu pełnego IP.

Efekt: platforma nie przetwarza pełnych adresów IP → argument do ograniczenia zakresu DPA.

### 3. AI concierge — dane w prompcie

Wiadomości gości kierowane do AI concierge mogą zawierać dane osobowe (imię wspomniane w tekście, numer pokoju, szczegóły zdrowotne przy zamawianiu posiłków). Architektura:
- Nie logować treści wiadomości po stronie platformy
- Jeśli logować — pseudonimizacja (zamiana identyfikatorów na opaque ID)
- Zewnętrzny provider AI (np. Anthropic, OpenAI) = sub-procesor → wymaga DPA z tym providerem

### 4. Cookie consent i informacja RODO

**Strictly necessary cookies/storage** (token sesji w sessionStorage):
- Nie wymagają zgody — niezbędne do działania usługi
- SessionStorage: technicznie nie jest "cookie" (nie podlega dyrektywie ePrivacy w klasycznym sensie), ale analogiczne zasady
- Wyświetlić informację (bez okienka akceptacji): "używamy danych sesji niezbędnych do działania aplikacji"

**Analytics cookies** (jeśli wdrożone):
- Wymagają zgody PRZED zapisem (opt-in)
- Baner cookie consent zgodny z wytycznymi EDPB 03/2022 (brak dark patterns: przyciski "zgoda" i "odmowa" równorzędne wizualnie)

**Informacja RODO (art. 13)** — wymagana przy zbieraniu danych bezpośrednio od osoby:
- Kiedy wyświetlić: przy pierwszym wejściu do aplikacji (przed zbieraniem jakichkolwiek danych poza session token)
- Gdzie wyświetlić: link "Polityka prywatności" dostępny zawsze w stopce/menu
- Co zawrzeć: tożsamość administratora (hotel), cele przetwarzania, podstawy prawne, czas retencji, prawa gości, dane kontaktowe IOD (jeśli wyznaczony)
- Nie musi być modal blokujący — wystarczy czytelna, dostępna polityka prywatności

### 5. Multi-tenant — implikacje DPA

W modelu SaaS multi-tenant:
- Każdy hotel jest odrębnym administratorem danych
- Platforma musi mieć umowę DPA z każdym hotelem-tenantem
- Dane różnych tenantów muszą być **logicznie izolowane** (Tenant ID w każdym rekordzie)
- Naruszenie danych u jednego tenanta nie może ujawniać danych innego tenanta
- Backup i restore musi zachowywać izolację (nie wolno przywrócić danych tenanta A do środowiska tenanta B)

### 6. Rejestr czynności przetwarzania (art. 30)

Platforma jako procesor musi prowadzić rejestr (art. 30 ust. 2):
- Nazwa i dane każdego administratora (hotelu)
- Kategorie przetwarzania w ich imieniu
- Transfery do państw trzecich (jeśli AI provider poza EOG)
- Środki bezpieczeństwa

Jeśli hotel przetwarza dane "na dużą skalę" (duże hotele, sieci) — musi prowadzić własny rejestr (art. 30 ust. 1) i może być zobowiązany do wyznaczenia IOD.

### 7. Rekomendowane minimum dla MVP

Priorytet 1 (przed wdrożeniem):
- [ ] Wzór umowy DPA do podpisania z każdym hotelem
- [ ] Polityka prywatności generowana per hotel (template z danymi hotelu)
- [ ] Anonimizacja IP w logach platformy (lub dokument uzasadniający retencję)
- [ ] Automatyczne usuwanie danych sesji (cron job: usuń tokeny starsze niż data wymeldowania + 48h)

Priorytet 2 (wkrótce po wdrożeniu):
- [ ] Rejestr czynności przetwarzania dla platformy (art. 30 ust. 2)
- [ ] Procedura zgłaszania naruszeń (art. 33: 72h do UODO, art. 34: do osób jeśli wysokie ryzyko)
- [ ] DPA z sub-procesorami (hosting, AI provider, CDN)
- [ ] Privacy Impact Assessment (DPIA) jeśli AI profiluje gości lub przetwarza dane wrażliwe

---

## Źródła i podstawy prawne

### Akty prawne
- Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 z 27 kwietnia 2016 r. (RODO/GDPR) — https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32016R0679
- Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych (Dz.U. 2018 poz. 1000) — implementacja RODO w Polsce
- Dyrektywa 2002/58/WE (ePrivacy) — art. 5 ust. 3 — cookies i podobne technologie
- Ustawa z dnia 16 lipca 2004 r. — Prawo telekomunikacyjne (art. 173) — implementacja ePrivacy w Polsce

### Wytyczne EDPB / WP29
- EDPB Guidelines 05/2020 on consent — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en
- EDPB Guidelines 03/2022 on dark patterns — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-032022-dark-patterns-social-media-platform-interfaces_en
- EDPB Guidelines 07/2020 on concepts of controller and processor — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- WP29 Opinion 248 on cookies and similar technologies (2014) — https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2014/wp224_en.pdf
- EDPB Guidelines 01/2022 on data subject rights — art. 13 i 14

### Orzecznictwo TSUE
- TSUE C-582/14 (Breyer v. Bundesrepublik Deutschland, 2016) — adres IP jako dana osobowa
- TSUE C-673/17 (Planet49, 2019) — wymogi zgody dla cookies (opt-in)
- TSUE C-252/21 (Meta Platforms, 2023) — uzasadniony interes, równowaga interesów

### UODO (Urząd Ochrony Danych Osobowych)
- Stanowisko UODO w sprawie IP jako danej osobowej — https://uodo.gov.pl
- Poradnik UODO "Jak wdrożyć RODO" — https://uodo.gov.pl/pl/138/402
- UODO — wskazówki dotyczące plików cookies — https://uodo.gov.pl/pl/138/1301
- Decyzje UODO dot. naruszeń przy przetwarzaniu danych hotelowych (precedensy branżowe)

### Inne źródła branżowe
- CNIL (Francja) — Cookie guidelines (podobne standardy, wpływowe w EOG) — https://www.cnil.fr/en/cookies-and-other-trackers/how-prepare-your-cookie-management-solution
- ICO (UK) — Guidance on cookies (pre-Brexit, nadal referencyjne) — https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/
- Europejska Sieć Organizacji Hotelarskich — standardy przetwarzania danych (HOTREC)
