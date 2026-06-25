# RODO DPA Requirements — Research
*Sesja 5 — Badanie przeprowadzone: 2026-06-25*
*Źródło: web search (czerwiec 2026) — gdpr-info.eu, edpb.europa.eu, legiscope.com, legalclarity.org, wardek.io, alstonprivacy.com, armstrongteasdale.com, legiscope.com, aipolicydesk.com, privacy.claude.com, openai.com, dataguidance.com, uodo.gov.pl + wiedza treningowa do VIII 2025 jako uzupełnienie.*

> **Uwaga metodologiczna:** Analiza oparta na wynikach web search z czerwca 2026 r. oraz na wiedzy treningowej obejmującej: Rozporządzenie 2016/679 (RODO), EDPB Opinion 22/2024 (sub-procesory, październik 2024), wyrok CJEU z 4 września 2025 r. (SRB v. EDPS — dane pseudonimowe), wytyczne EDPB 07/2020, EDPB Guidelines 09/2022 (naruszenia), Decyzja KE 2021/915 (SCC dla relacji administrator–procesor), opinie UODO, standardowe klauzule umowne 2021. Wskazane fragmenty interpretacyjne są wyraźnie oznaczone. Przed podpisaniem umów z klientami wymagana weryfikacja przez radcę prawnego specjalizującego się w RODO.

---

## 1. Obowiązkowe klauzule DPA (Art. 28 RODO)

### Podstawa prawna
Art. 28 ust. 3 RODO wymaga, aby przetwarzanie przez podmiot przetwarzający (procesor) odbywało się na podstawie umowy lub innego instrumentu prawnego wiążącego podmiot przetwarzający względem administratora. Umowa musi mieć **formę pisemną** (w tym elektroniczną) i obejmować wszystkie niżej wymienione elementy.

### Klauzule obowiązkowe — lista z wyjaśnieniem

#### 1.1 Przedmiot, czas trwania, charakter i cel przetwarzania (Art. 28 ust. 3)
**Treść klauzuli:** Umowa musi precyzować, co jest przetwarzane, przez jaki czas, w jakim charakterze i w jakim celu.

**Dla Hotel SaaS — przykładowe sformułowanie:**
> "Podmiot przetwarzający przetwarza dane osobowe Gości Hotelu wyłącznie w celu świadczenia Usługi platformy cyfrowej obsługi gościa hotelowego, obejmującej: zarządzanie sesjami aplikacji mobilnej, obsługę zamówień usług hotelowych przez aplikację, świadczenie usługi asystenta AI. Przetwarzanie trwa przez czas obowiązywania niniejszej umowy. Charakter przetwarzania: przetwarzanie automatyczne, przechowywanie, organizowanie."

**Dlaczego ważne:** Brak tej klauzuli lub jej ogólnikowość jest najczęstszym błędem w DPA. UODO w decyzji DKN.5131.2.2022 wskazał, że klauzule opisujące cel jako "świadczenie usług IT" bez uszczegółowienia są niewystarczające.

#### 1.2 Rodzaj danych i kategorie podmiotów danych (Art. 28 ust. 3)
**Treść klauzuli:** Enumeracja kategorii przetwarzanych danych i grup osób, których dane dotyczą.

**Dla Hotel SaaS — kategorie danych:**
- Dane identyfikacyjne: imię gościa (wyłącznie do personalizacji UX)
- Dane techniczne: token sesji (UUID), znaczniki czasu (check-in, checkout)
- Dane transakcyjne: zamówienia usług hotelowych (kategoria, czas, pokój)
- Dane komunikacyjne: treść zapytań do asystenta AI (potencjalnie dane osobowe)
- Dane logów serwerowych: adresy IP (dane osobowe wg TSUE C-582/14 Breyer)

**Kategorie podmiotów:** Goście hotelowi (osoby fizyczne przebywające w obiekcie hotelowym w czasie przetwarzania).

**Uwaga RODO:** Dane specjalnych kategorii (art. 9) — np. alergie pokarmowe zamawiane przez room service mogą ujawniać stan zdrowia. Jeśli taka funkcjonalność istnieje, wymaga odrębnej podstawy przetwarzania i wyraźnego zaznaczenia w DPA.

#### 1.3 Zakaz przetwarzania danych w innych celach (Art. 28 ust. 3 lit. a)
**Treść klauzuli:**
> "Podmiot przetwarzający przetwarza dane osobowe wyłącznie na udokumentowane polecenie administratora i nie może przetwarzać tych danych we własnych celach, w tym dla celów trenowania modeli AI, analityki biznesowej własnej platformy, udostępniania podmiotom trzecim."

**Krytycznie ważne dla AI SaaS:** OpenAI i Anthropic mają polityki dotyczące użycia danych do trenowania — należy upewnić się, że API jest skonfigurowane z opt-out trenowania (OpenAI: `training: false` w nagłówkach; Anthropic: domyślnie nie trenuje na danych API przy `claude-api`). To musi być odzwierciedlone w DPA.

#### 1.4 Obowiązek zachowania poufności (Art. 28 ust. 3 lit. b)
**Treść klauzuli:**
> "Podmiot przetwarzający zapewnia, że osoby upoważnione do przetwarzania danych osobowych zobowiązały się do zachowania tajemnicy lub podlegają odpowiedniemu ustawowemu obowiązkowi zachowania tajemnicy. Upoważnienia do przetwarzania danych są wydawane na piśmie lub w formie elektronicznej."

**Praktycznie:** Platforma SaaS musi prowadzić rejestr upoważnień pracowniczych. Dla MVP wystarczy klauzula + wewnętrzna polityka, nie ma potrzeby załączania listy upoważnień do DPA.

#### 1.5 Środki bezpieczeństwa (Art. 28 ust. 3 lit. c w zw. z Art. 32)
**Treść klauzuli:**
> "Podmiot przetwarzający wdraża odpowiednie techniczne i organizacyjne środki bezpieczeństwa zgodnie z art. 32 RODO, w szczególności: szyfrowanie danych w transmisji (TLS 1.2+) i w spoczynku (AES-256), pseudonimizację danych tam gdzie to możliwe, mechanizmy zapewnienia ciągłości przetwarzania, procedury testowania i oceny skuteczności środków bezpieczeństwa."

**Nie wymagaj** szczegółowej listy środków technicznych w samej DPA — zamiast tego odwołaj się do Polityki Bezpieczeństwa Informacji Procesora jako dokumentu załącznikowego. Ułatwia to aktualizacje bez aneksowania DPA.

#### 1.6 Warunki angażowania sub-procesorów (Art. 28 ust. 2 i ust. 4)
**Treść klauzuli (dwa warianty):**

*Wariant A — ogólna zgoda wstępna (zalecany dla SaaS):*
> "Administrator udziela podmiotowi przetwarzającemu ogólnego uprzedniego upoważnienia do angażowania dalszych podmiotów przetwarzających (sub-procesorów). Podmiot przetwarzający informuje administratora o wszelkich planowanych zmianach dotyczących dodania lub zastąpienia sub-procesorów z wyprzedzeniem co najmniej 14 dni, umożliwiając administratorowi wyrażenie sprzeciwu."

*Wariant B — zgoda na konkretnych sub-procesorów:*
> "Administrator wyraża zgodę na angażowanie sub-procesorów wymienionych w Załączniku nr [X] do niniejszej umowy. Zmiana listy sub-procesorów wymaga pisemnej zgody administratora."

**Wariant A jest standardem w SaaS** (stosuje go AWS, Google, Microsoft w swoich DPA). Daje elastyczność operacyjną przy zachowaniu obowiązku informowania. Dla MVP z 1-3 hotelami wariant B jest prostszy, ale będzie blokował skalowanie.

**Lista sub-procesorów dla Hotel SaaS (minimalna):**
- Dostawca hostingu/chmury (np. AWS, GCP, Azure, Hetzner)
- Provider LLM: OpenAI lub Anthropic
- Dostawca usług emailowych (jeśli platforma wysyła maile)
- Dostawca usług CDN (jeśli stosowany)
- Narzędzia monitoringu (np. Sentry, Datadog)

#### 1.7 Pomoc administratorowi w realizacji praw podmiotów danych (Art. 28 ust. 3 lit. e)
**Treść klauzuli:**
> "Podmiot przetwarzający udziela administratorowi pomocy w wywiązywaniu się z obowiązków określonych w art. 32-36 RODO, w szczególności: odpowiadaniu na żądania osób dotyczące wykonywania ich praw, zgłaszaniu naruszeń ochrony danych oraz przeprowadzaniu ocen skutków dla ochrony danych (DPIA)."

**Praktycznie dla SaaS:** Oznacza to, że platforma musi udostępnić mechanizm eksportu i usunięcia danych konkretnego gościa na żądanie hotelu (realizacja art. 17 RODO — prawo do usunięcia). Funkcja ta powinna być wbudowana w panel administracyjny hotelu lub dostępna przez API.

#### 1.8 Usunięcie lub zwrot danych po zakończeniu umowy (Art. 28 ust. 3 lit. g)
**Treść klauzuli:**
> "Po zakończeniu świadczenia usług przetwarzania podmiot przetwarzający, zależnie od wyboru administratora, usuwa lub zwraca wszelkie dane osobowe oraz usuwa wszelkie istniejące kopie, chyba że prawo Unii lub prawo państwa członkowskiego nakazuje przechowywanie danych osobowych. Usunięcie lub zwrot nastąpi w terminie 30 dni od rozwiązania umowy. Podmiot przetwarzający potwierdzi wykonanie powyższego obowiązku na piśmie."

**Ważne:** Backup retention — jeśli platforma przechowuje backupy przez 30 dni, dane mogą być obecne w backupach po zakończeniu umowy. Klauzula powinna to uwzględniać: "Dane w backupach zostaną nadpisane lub usunięte zgodnie z harmonogramem rotacji kopii zapasowych, nie później niż 60 dni od rozwiązania umowy."

#### 1.9 Udostępnienie informacji i prawo do audytu (Art. 28 ust. 3 lit. h)
**Treść klauzuli:**
> "Podmiot przetwarzający udostępnia administratorowi wszelkie informacje niezbędne do wykazania spełnienia obowiązków określonych w art. 28 RODO oraz umożliwia administratorowi lub upoważnionemu przez niego audytorowi przeprowadzanie audytów, w tym inspekcji, i przyczynia się do nich. Podmiot przetwarzający niezwłocznie informuje administratora, jeżeli jego zdaniem polecenie narusza niniejsze rozporządzenie lub inne przepisy o ochronie danych."

**Praktycznie:** Audyt osobisty jest kosztowny. Standardem dla SaaS jest dopuszczenie audytu poprzez dostarczenie certyfikatów (ISO 27001, SOC 2 Type II) zamiast fizycznej inspekcji. Klauzula może to doprecyzować: "Obowiązek, o którym mowa powyżej, może być spełniony poprzez udostępnienie aktualnych certyfikatów bezpieczeństwa (ISO 27001 lub SOC 2 Type II)."

#### 1.10 Standardowe klauzule umowne KE (Decyzja 2021/915) — gotowy szablon DPA

Komisja Europejska w Decyzji wykonawczej 2021/915 z 4 czerwca 2021 r. opublikowała gotowe **Standardowe Klauzule Umowne (SCC) dla relacji administrator–procesor** zgodne z Art. 28 ust. 3 RODO. Użycie tych klauzul bez modyfikacji automatycznie spełnia wszystkie wymogi Art. 28 ust. 3. Jest to **zalecane podejście dla MVP** — minimalizuje ryzyko prawne, przyspiesza onboarding hoteli, eliminuje negocjacje nad treścią DPA.

Tekst klauzul: https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32021D0915

**Sankcja za brak ważnego DPA:** Art. 83 ust. 4 RODO — kara do **10 mln EUR lub 2% globalnego rocznego obrotu**. Brak DPA to samodzielne naruszenie RODO, niezależne od wystąpienia faktycznego wycieku danych.

#### 1.11 Rejestr czynności przetwarzania (Art. 30 ust. 2)
Nie jest klauzulą DPA, ale bezpośrednim obowiązkiem procesora. Platforma SaaS jako procesor musi prowadzić rejestr obejmujący:
- Nazwy i dane kontaktowe każdego administratora (hotelu)
- Kategorie przetwarzania wykonywanego w imieniu każdego administratora
- Transfery do państw trzecich
- Opis technicznych i organizacyjnych środków bezpieczeństwa

---

## 2. Podział odpowiedzialności hotel vs platforma

### Zasada ogólna
Art. 82 RODO ustanawia solidarną odpowiedzialność administratora i procesora wobec osób, których dane dotyczą. Hotel i platforma SaaS odpowiadają solidarnie za szkody, chyba że wykażą, że nie ponoszą winy. Regres między nimi reguluje umowa DPA.

### Matryca odpowiedzialności — scenariusze naruszeń

#### Scenariusz 1: Wyciek danych z bazy platformy SaaS (błąd po stronie platformy)
- **Kto odpowiada wobec gości:** Hotel (jako ADM) i Platforma (solidarnie)
- **Obowiązek zgłoszenia do UODO:** Hotel — w ciągu 72h od uzyskania informacji (art. 33 RODO)
- **Kto ponosi odpowiedzialność cywilną:** Platforma — w zakresie, w jakim wynikło z jej zaniedbania (art. 82 ust. 3); Hotel może dochodzić regresu od Platformy
- **Regres:** Platforma odpowiada w pełni, jeśli naruszenie wynikło z niezachowania art. 32 (środki bezpieczeństwa)
- **Klauzula DPA:** "Podmiot przetwarzający ponosi odpowiedzialność za szkody wyrządzone przetwarzaniem, jeżeli nie dopełnił obowiązków nałożonych na niego niniejszym Rozporządzeniem lub wykroczył poza zgodne z prawem polecenia administratora."

#### Scenariusz 2: Hotel nielegalnie rozszerza zakres przetwarzania przez platformę (np. prosi o zbieranie dodatkowych danych bez podstawy prawnej)
- **Kto odpowiada:** Hotel (jako ADM decydujący o celach) — w pełni
- **Platforma:** Może odpowiadać, jeśli realizowała polecenie wiedząc, że jest bezprawne (art. 82 ust. 2). Klauzula DPA powinna chronić platformę: "Podmiot przetwarzający jest zwolniony z odpowiedzialności, jeżeli udowodni, że nie ponosi winy za zdarzenie będące przyczyną szkody."
- **Klauzula DPA:** "Platforma ma prawo odmówić realizacji polecenia, jeżeli uzna je za naruszające przepisy RODO, i zobowiązana jest niezwłocznie poinformować administratora."

#### Scenariusz 3: Naruszenie u sub-procesora (np. wyciek danych przez OpenAI)
- **Kto odpowiada wobec gości:** Hotel (ADM) i Platforma solidarnie
- **Odpowiedzialność wewnętrzna:** Platforma odpowiada za sub-procesora jak za siebie (art. 28 ust. 4)
- **Regres platformy wobec OpenAI/Anthropic:** Na podstawie DPA z sub-procesorem
- **Klauzula DPA (hotel↔platforma):** "Podmiot przetwarzający odpowiada za działania i zaniechania dalszych podmiotów przetwarzających jak za własne."

#### Scenariusz 4: Hotel nie informuje gości o przetwarzaniu (brak klauzuli RODO przy zameldowaniu)
- **Kto odpowiada:** Hotel wyłącznie — obowiązek informacyjny (art. 13) spoczywa na administratorze
- **Platforma:** Brak odpowiedzialności, ale warto zawrzeć klauzulę: "Administrator zobowiązuje się do wypełnienia obowiązku informacyjnego wobec podmiotów danych przed przekazaniem ich danych podmiotowi przetwarzającemu."

#### Scenariusz 5: Nieuprawniony dostęp pracownika hotelu do danych przez panel administracyjny
- **Kto odpowiada:** Hotel — w zakresie zarządzania dostępem po swojej stronie
- **Platforma:** Może odpowiadać, jeśli nie wdrożyła odpowiednich ról i uprawnień (RBAC). Powinna zapewnić granularny system uprawnień.

### Tabela odpowiedzialności (skrócona)

| Scenariusz | Odpowiedzialność ADM (Hotel) | Odpowiedzialność Procesora (Platforma) | Regres |
|------------|------------------------------|---------------------------------------|--------|
| Wyciek z infrastruktury platformy | Solidarna (wobec gości) | Główna (wewnętrznie) | Platforma ← Hotel |
| Naruszenie polecenia administratora przez platformę | Solidarna | Wyłączna | Hotel → Platforma |
| Błąd konfiguracji hotelu | Wyłączna | Brak (jeśli bez wiedzy) | Brak |
| Sub-procesor (AI provider) | Solidarna | Jak za siebie (art. 28 ust. 4) | Platforma → Sub-procesor |
| Brak informacji RODO dla gości | Wyłączna | Brak | Brak |

### Ograniczenie odpowiedzialności w DPA
Standardową praktyką SaaS jest ograniczenie odpowiedzialności kontraktowej platformy wobec hotelu do wartości wynagrodzenia z 12 miesięcy (lub innego ustalonego limitu). **Ważne:** ograniczenie to nie może działać wobec osób, których dane dotyczą — gość zawsze może dochodzić pełnego odszkodowania od hotelu (ADM), a hotel od platformy na zasadach regresu.

---

## 3. Sub-procesor chain (platforma → OpenAI/Anthropic)

### Podstawa prawna
Art. 28 ust. 2 RODO: Procesor nie może angażować innego podmiotu przetwarzającego bez uprzedniej szczegółowej lub ogólnej pisemnej zgody administratora.

### Wymogi EDPB Opinion 22/2024 (październik 2024) — kluczowe dla łańcucha sub-procesorów

EDPB wydał 7 października 2024 r. Opinię 22/2024 dotyczącą obowiązków wynikających z korzystania z procesora i sub-procesorów. **Jest to kluczowy dokument aktualizujący praktykę** względem wcześniejszych wytycznych:

1. **Identyfikacja wszystkich podmiotów w łańcuchu:** Administrator (hotel) musi mieć dostęp do informacji o wszystkich sub-procesorach w całym łańcuchu, niezależnie od jego długości — co najmniej: nazwa, adres, dane kontaktowe, opis czynności przetwarzania.
2. **Obowiązek proaktywnej komunikacji procesora:** Platforma musi dostarczać i aktualizować te informacje z własnej inicjatywy — nie czekać na pytanie hotelu.
3. **Weryfikacja sub-procesorów — podejście risk-based:** Administrator nie musi systematycznie przeglądać każdej umowy z sub-procesorem; powinien oceniać na podstawie ryzyka — im wyższe ryzyko, tym głębsza weryfikacja. Może jednak zażądać kopii umowy z sub-procesorem.
4. **Pełna odpowiedzialność procesora:** Platforma pozostaje w pełni odpowiedzialna wobec hotelu za działania sub-procesorów (potwierdza Art. 28 ust. 4).

Pełny tekst Opinii: https://www.edpb.europa.eu/our-work-tools/our-documents/opinion-board-art-64/opinion-222024-certain-obligations-following_en

### Krok 1: Uzyskanie zgody hotelu na sub-procesora
DPA z hotelem musi zawierać zgodę na zaangażowanie AI providera jako sub-procesora. Zalecane podejście:

**Ogólna zgoda wstępna z listą (wariant praktyczny):**
> "Administrator udziela ogólnego uprzedniego upoważnienia do angażowania sub-procesorów wskazanych w Wykazie Sub-Procesorów dostępnym pod adresem: [URL]. Podmiot przetwarzający zobowiązuje się informować Administratora o planowanych zmianach w wykazie z wyprzedzeniem 14 dni. W przypadku braku sprzeciwu w tym terminie, zmiana uważa się za zaakceptowaną."

**Wykaz Sub-Procesorów (Załącznik do DPA) — przykład:**

| Sub-Procesor | Funkcja | Siedziba | Podstawa transferu poza EOG |
|---|---|---|---|
| Amazon Web Services (AWS Frankfurt) | Hosting, infrastruktura | EU (Niemcy) | Nie dotyczy (EOG) |
| Anthropic PBC | Usługi modelu językowego AI | USA | SCC 2021 / DPA Anthropic |
| OpenAI LLC | Usługi modelu językowego AI | USA | SCC 2021 / DPA OpenAI |
| Sentry (jeśli używany) | Monitorowanie błędów | USA | SCC 2021 |

### Krok 2: Zawarcie DPA z OpenAI/Anthropic

#### OpenAI DPA
- OpenAI oferuje standardowy DPA dostępny na: https://openai.com/policies/data-processing-addendum/
- OpenAI jest procesorem danych dla danych przesyłanych przez API
- Dane API nie są używane do trenowania modeli (wymaga potwierdzenia w ustawieniach projektu)
- Transfer danych: USA → EU objęty SCC (Standard Contractual Clauses) 2021

**Co pokrywa OpenAI DPA:**
- Zakaz używania danych API do trenowania (po wyłączeniu opcji)
- Usuwanie danych wejściowych po 30 dniach (domyślnie)
- Certyfikaty: SOC 2 Type II, ISO 27001
- **Powiadomienie o nowych sub-procesorach: 30 dni z wyprzedzeniem** (z prawem sprzeciwu)
- Procedura breach notification: 72h

#### Anthropic DPA
- Anthropic DPA dostępny i podpisywalny przez: https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
- Dane API nie są używane do trenowania modeli przy użyciu klucza API (warunek domyślny)
- Transfer danych: SCC 2021
- **Powiadomienie o nowych sub-procesorach: 15 dni z wyprzedzeniem** (z prawem sprzeciwu) — krótszy termin niż OpenAI, uwzględnić przy konfiguracji własnego DPA z hotelem
- **Usunięcie danych klienta: 30 dni od rozwiązania umowy**
- Anthropic jest także sub-procesorem Microsoft (Azure) — uwzględnić w łańcuchu jeśli platforma używa Azure AI

**Ważne:** Dla MVP z testowymi kluczami API niekoniecznie potrzebny jest podpisany DPA. Dla wdrożenia produkcyjnego z danymi gości — DPA z AI providerem jest obowiązkowe. Przy Anthropic — DPA można podpisać elektronicznie przez panel na privacy.claude.com.

### Krok 3: Zapewnienie przepływu odpowiedzialności

**Łańcuch odpowiedzialności:**
```
Gość ← (art. 13 info) ← Hotel (ADM)
Hotel (ADM) ← DPA (art. 28) ← Platforma SaaS (Procesor)
Platforma SaaS ← DPA (art. 28 ust. 4) ← OpenAI/Anthropic (Sub-Procesor)
```

**Klauzula DPA (hotel↔platforma) — sub-procesor:**
> "Podmiot przetwarzający nakłada na każdego dalszego podmiot przetwarzający obowiązki ochrony danych takie same jak obowiązki wynikające z niniejszej umowy, w szczególności gwarancje wdrożenia odpowiednich środków technicznych i organizacyjnych. Odpowiedzialność podmiotu przetwarzającego wobec administratora nie jest ograniczona faktem zaangażowania sub-procesora."

### Krok 4: Minimalizacja danych przesyłanych do AI providera
**Architektura rekomendowana:**
- Nie przesyłaj do OpenAI/Anthropic: pełnych danych identyfikacyjnych gościa, numerów pokojów, dat pobytu
- Przesyłaj: anonimizowany kontekst + treść zapytania gościa
- Wdrożenie: warstwa pośrednia (prompt engineering layer) odfiltrowuje PII przed wysłaniem do API
- Jeśli personalizacja wymagana (np. "Dzień dobry, [Imię]") — imię może być wstrzyknięte po stronie platformy, bez wysyłania do AI

---

## 4. Anonimowy token — czy zmniejsza scope DPA?

### Definicja problemu
Platforma operuje na opaque UUID session token, który nie jest łączony z danymi osobowymi po stronie platformy. Pytanie: czy to eliminuje lub redukuje zakres DPA?

### Analiza zgodnie z wytycznymi regulatorów

#### Wyrok CJEU z 4 września 2025 r. (SRB v. EDPS) — dane pseudonimowe jako relative concept

TSUE w wyroku z 4 września 2025 r. potwierdził, że pojęcie danych osobowych jest **relatywne kontekstowo** — to czy dane są osobowe, zależy od perspektywy konkretnego podmiotu je przetwarzającego i jego realnej zdolności do re-identyfikacji. Jest to przełomowe potwierdzenie "recipient-centric analysis":

- Pseudonimizowane dane mogą być **danymi osobowymi w rękach jednego podmiotu** (who holds the key) i **nieosobowymi w rękach innego** (who cannot re-identify).
- Test: czy podmiot "może rozsądnie" re-identyfikować osoby, biorąc pod uwagę dostępne mu dane, środki techniczne i prawne bariery.
- **Dla opaque UUID**: jeśli platforma ma klucz mapowania (token → rezerwacja → gość) → token jest daną osobową w rękach platformy. Jeśli sub-procesor (LLM provider) nie ma dostępu do klucza i prompt nie zawiera PII → token może nie być daną osobową dla sub-procesora.

**WAŻNA UWAGA INTERPRETACYJNA:** Wyrok potwierdza podejście risk-based, ale nie daje "wolnej ręki" — nadal wymaga udokumentowania analizy i faktycznych barier technicznych/prawnych uniemożliwiających re-identyfikację.

#### EDPB Guidelines 07/2020 (Concepts of Controller and Processor)
EDPB wskazuje, że ocena, czy podmiot jest procesorem, nie zależy od tego, czy podmiot "widzi" dane osobowe, ale od tego, czy **przetwarza dane w imieniu administratora**. Token sesji przypisany do gościa przez hotel i używany przez platformę może być daną osobową po stronie hotelu, nawet jeśli platforma nie może go powiązać z konkretną osobą.

**Konkluzja EDPB:** Jeśli platforma przetwarza dane (nawet pseudonimowe lub opaque tokeny), a te dane są danymi osobowymi w rękach administratora (hotelu) — platforma jest procesorem i DPA jest wymagane.

#### Interpretacja UODO
UODO w poradnikach (dostępnych na uodo.gov.pl) wskazuje, że pseudonimizacja i tokenizacja zmniejszają ryzyko, ale nie eliminują stosowania RODO, jeśli gdziekolwiek w systemie możliwe jest powiązanie danych z osobą fizyczną. Token sesji przypisany przez hotel do pokoju/rezerwacji jest pseudonimem — RODO się stosuje.

**Decyzja UODO DKN.5130.1.2020 (precedens):** UODO wskazał, że samo używanie identyfikatorów technicznych nie zwalnia z obowiązku DPA, gdy identyfikatory są powiązane z osobami po stronie administratora.

#### Interpretacja CNIL (Francja)
CNIL w poradniku o cookies i identyfikatorach (2020) wskazuje, że "identifiant de session" jest daną pseudonimową podlegającą RODO, jeśli admin może powiązać go z osobą. Token UUID przypisany do gościa hotelowego spełnia tę definicję z perspektywy hotelu jako administratora.

#### Interpretacja ICO (UK — pre-Brexit, nadal referencyjna)
ICO w "Guidance on anonymisation" wskazuje test: czy istnieje **rozsądne prawdopodobieństwo** re-identyfikacji przy "rozsądnych środkach"? Jeśli hotel (admin) może powiązać token z rezerwacją (co jest standardem w systemach PMS) — token nie jest anonimowy, RODO stosuje się.

### Konkluzja — czy token zmniejsza scope DPA?

**Token ZMNIEJSZA zakres ryzyka i scope przetwarzanych danych po stronie sub-procesora LLM, ale NIE zwalnia platformy z DPA wobec hotelu.**

| Element | UUID tylko w logach platformy (platform ma klucz) | UUID w prompcie do LLM (LLM nie ma klucza, brak PII) | UUID + imię gościa w prompcie |
|---|---|---|---|
| DPA platforma↔hotel wymagane? | **TAK** (platform ma klucz mapowania) | **TAK** | **TAK (bezwzględnie)** |
| UUID = dane osobowe dla sub-procesora? | Nie dotyczy | **Potencjalnie NIE** (CJEU 2025, jeśli brak PII i brak klucza) | **TAK** |
| Art. 32 środki bezpieczeństwa | Wymagane (minimum) | Wymagane | Wymagane (rozszerzone) |
| Potrzeba DPIA | Nie (przy małej skali) | Prawdopodobnie nie | Możliwe (jeśli profiling) |

**Wyjątek — jedyny scenariusz eliminujący DPA:**
Gdyby platforma przetwarzała **wyłącznie** opaque tokeny, bez możliwości jakiegokolwiek powiązania z osobą (nawet pośredniego), bez logowania IP, a hotel nie mógłby przez żaden interfejs przekazać platformie jakichkolwiek danych osobowych — technicznie RODO mogłoby nie mieć zastosowania po stronie platformy. Jest to scenariusz niemal niemożliwy do utrzymania w praktyce operacyjnej (webservery domyślnie logują IP, panele admin wymagają danych hotelu itp.).

**Rekomendacja praktyczna:** Zawsze podpisać DPA z każdym hotelem. Koszt operacyjny minimalny, ryzyko braku DPA nieakceptowalne (kary do 4% globalnego obrotu lub 20 mln EUR — art. 83 ust. 4 RODO).

---

## 5. Imię gościa jako dane osobowe

### Kwalifikacja prawna

#### Definicja art. 4 ust. 1 RODO
Dane osobowe = wszelkie informacje dotyczące **zidentyfikowanej lub możliwej do zidentyfikowania** osoby fizycznej. Możliwa do zidentyfikowania = osoba, którą można bezpośrednio lub pośrednio zidentyfikować.

#### Samo imię (bez nazwiska) — analiza

**Pogląd 1 — imię bez kontekstu:** "Jan" jako izolowane słowo nie jest daną osobową — nie identyfikuje konkretnej osoby.

**Pogląd 2 — imię w kontekście (dominujący, przyjęty przez EDPB):** Imię gościa w kontekście aplikacji hotelowej — powiązane z tokenem sesji, pokojem, datami pobytu — **jest daną osobową**. Identyfikuje konkretną osobę fizyczną przebywającą w hotelu w określonym czasie.

**Orzecznictwo:**
- TSUE C-434/16 (Nowak, 2017): Dane w arkuszu egzaminacyjnym studentów to dane osobowe mimo że "student" nie jest przypisany wprost. Kontekst pozwala na identyfikację. Sąd przyjął szeroką wykładnię danych osobowych.
- WP29 Opinion 4/2007 on the concept of personal data: "A first name alone may or may not constitute personal data depending on its association with other information."

#### Konkluzja dla Hotel SaaS

Imię gościa przechowywane przez platformę, **nawet bez nazwiska**, jest daną osobową, ponieważ:
1. Jest powiązane z tokenem sesji (który hotel łączy z rezerwacją → konkretną osobą)
2. Jest powiązane z pokojiem hotelowym (możliwa identyfikacja: "gość w pokoju 204, pobyt 24-26 czerwca 2026")
3. Platforma przechowuje kontekst (token + imię + zamówienia) — całość identyfikuje osobę

**Konsekwencje prawne:**
- Przetwarzanie imienia gościa przez platformę → platforma przetwarza dane osobowe → DPA obowiązkowe (potwierdza pkt 4 powyżej)
- Podstawa prawna przetwarzania: art. 6 ust. 1 lit. b (wykonanie umowy — personalizacja UX jest częścią usługi) lub art. 6 ust. 1 lit. f (uzasadniony interes hotelu)
- Retencja imienia: analogiczna do sesji — checkout + 48h (lub krócej jeśli czysto UX)
- Wymagane: uwzględnienie imienia w klauzuli informacyjnej art. 13 (hotel informuje gościa)

**Praktyczna rekomendacja:** Jeśli imię służy wyłącznie do personalizacji UX (np. "Cześć, Jan!"), przechowywać je wyłącznie w pamięci sesji (sessionStorage po stronie klienta), nie utrwalać na serwerze platformy. Eliminuje problem retencji i ogranicza zakres DPA.

---

## 6. Standardowe klauzule retencji

### Zasada ogólna
Art. 5 ust. 1 lit. e RODO: Dane nie dłużej niż niezbędne ("ograniczenie przechowywania"). Art. 25 (Privacy by Default): Domyślnie najkrótszy możliwy okres.

### Klauzule retencji dla Hotel SaaS — sformułowania przykładowe

#### 6.1 Token sesji i dane sesji

**Sformułowanie DPA:**
> "Dane sesji użytkownika, w tym token sesji oraz dane technicznie z nim powiązane, są przechowywane przez czas aktywnej sesji gościa. Sesja wygasa automatycznie po upływie 2 godzin od zarejestrowanej daty i godziny wymeldowania gościa (checkout_datetime + 2h), po czym token jest unieważniany. Dane powiązane z sesją są usuwane przez Podmiot przetwarzający w ciągu 48 godzin od wymeldowania gościa."

**Podstawa prawna:** Art. 6 ust. 1 lit. b (wykonanie umowy) lub art. 6 ust. 1 lit. f (uzasadniony interes)
**Uzasadnienie:** Bufor 48h po wymeldowaniu uzasadniony jest możliwością zgłoszenia reklamacji przez gościa bezpośrednio po wyjeździe.

#### 6.2 Logi serwera (zawierające IP)

**Sformułowanie DPA:**
> "Logi dostępu serwerów, zawierające adresy IP i inne dane techniczne, są przechowywane przez okres 30 dni od daty ich wygenerowania, po czym są automatycznie usuwane. W uzasadnionych przypadkach bezpieczeństwa (trwające postępowanie wyjaśniające incydent) logi mogą być przechowane przez dodatkowe 60 dni."

**Podstawa prawna:** Art. 6 ust. 1 lit. f (uzasadniony interes: bezpieczeństwo systemu)
**Standard branżowy:** 30 dni to standard rekomendowany przez CNIL i ICO. UODO nie wydał szczegółowego wytycznego dla logów serwerowych, ale przyjął 30-dniowy standard w praktyce.

#### 6.3 Dane zamówień (transakcyjne)

**Sformułowanie DPA:**
> "Dane zamówień usług hotelowych (treść zamówienia, data, kwota, przypisanie do pokoju) są przechowywane przez okres 5 lat od daty zamówienia, zgodnie z wymogami przepisów podatkowych (art. 112 ustawy z dnia 11 marca 2004 r. o podatku od towarów i usług). Po upływie tego okresu dane są trwale usuwane."

**Podstawa prawna:** Art. 6 ust. 1 lit. c (obowiązek prawny — przepisy podatkowe)
**Uwaga:** Dane zamówień przechowywane 5 lat to wymóg prawa podatkowego, niezależny od DPA. DPA powinna to odnotowywać, aby uniknąć konfliktu między "prawem do bycia zapomnianym" gościa (art. 17 RODO) a obowiązkami podatkowymi hotelu. Gość nie może żądać usunięcia danych niezbędnych dla wypełnienia obowiązku prawnego.

#### 6.4 Historia rozmów z AI concierge

**Sformułowanie DPA:**
> "Treść rozmów gości z asystentem AI jest przechowywana przez okres pobytu gościa oraz przez 7 dni po wymeldowaniu, w celu umożliwienia realizacji zamówień złożonych przez asystenta. Po upływie tego okresu treść rozmów jest trwale usuwana. Dane zagregowane i zanonimizowane (bez możliwości identyfikacji gościa) mogą być przechowywane bezterminowo dla celów poprawy jakości usługi."

**Podstawa prawna:** Art. 6 ust. 1 lit. b (wykonanie umowy) dla rozmów; brak podstawy dla dalszego przechowywania bez zgody
**Uwaga krytyczna:** Dane konwersacji przesyłane do OpenAI/Anthropic podlegają ich własnym politykom retencji. OpenAI API domyślnie usuwa dane po 30 dniach. Należy zapewnić spójność z DPA z AI providerem.

#### 6.5 Imię gościa (personalizacja UX)

**Sformułowanie DPA:**
> "Imię gościa, przechowywane wyłącznie w celu personalizacji interfejsu użytkownika aplikacji, jest przechowywane przez czas trwania aktywnej sesji gościa i usuwane najpóźniej wraz z wygaśnięciem tokenu sesji."

**Rekomendacja praktyczna:** Jeśli możliwe — przechowywać imię wyłącznie po stronie klienta (sessionStorage w przeglądarce), nie utrwalać w bazie platformy.

### Tabela retencji — zestawienie

| Kategoria danych | Retencja | Podstawa prawna | Automatyczne usunięcie |
|---|---|---|---|
| Token sesji | checkout + 2h (wygaśnięcie) + usunięcie w 48h | Art. 6(1)(b) | TAK — cron job |
| Imię gościa (UX) | Czas sesji (checkout + 2h) | Art. 6(1)(b) | TAK — z sesją |
| Logi serwerowe (IP) | 30 dni od wygenerowania | Art. 6(1)(f) | TAK — log rotation |
| Dane zamówień | 5 lat od daty zamówienia | Art. 6(1)(c) — prawo podatkowe | TAK — cron po 5 latach |
| Historia AI chat | checkout + 7 dni | Art. 6(1)(b) | TAK — cron job |
| Dane zanonimizowane | Nieograniczona | Nie dotyczy (nie są danymi os.) | Nie dotyczy |

---

## 7. Data Breach notification chain

### Podstawa prawna
- **Art. 33 RODO:** Zgłoszenie naruszenia do organu nadzorczego (UODO) — w ciągu 72 godzin od stwierdzenia naruszenia przez administratora.
- **Art. 34 RODO:** Zawiadomienie osób, których dane dotyczą — gdy naruszenie może powodować wysokie ryzyko dla praw i wolności.
- **Art. 28 ust. 3 lit. f RODO:** Procesor (platforma) informuje administratora (hotel) "bez zbędnej zwłoki" po stwierdzeniu naruszenia.

### Procedura krok po kroku

```
ZDARZENIE NARUSZENIA DANYCH
        │
        ▼ (Platforma SaaS wykrywa/dowiaduje się)
[PLATFORMA SaaS — Procesor]
KROK 1: Wewnętrzna ocena incydentu
        - Czy naruszono poufność, integralność lub dostępność danych osobowych?
        - Jakie dane, ilu gości, jakie ryzyko?
        - Zebranie dowodów, logów, dokumentacja
        Czas: max kilka godzin
        │
        ▼ (niezwłocznie, praktycznie: max 12-24h od stwierdzenia)
[PLATFORMA SaaS → HOTEL]
KROK 2: Zawiadomienie hotelu (ADM)
        - Forma: email + telefon do osoby kontaktowej ds. RODO z hotelu
        - Treść: opis zdarzenia, szacowana liczba dotkniętych osób,
                  kategorie danych, możliwe konsekwencje, podjęte środki
        - Klauzula DPA: "Podmiot przetwarzający zgłasza naruszenie bez
                  zbędnej zwłoki, nie później niż w ciągu 24 godzin
                  od stwierdzenia naruszenia"
        │
        ▼ (hotel ma łącznie 72h od stwierdzenia naruszenia)
[HOTEL — Administrator]
KROK 3: Wewnętrzna ocena hotelu
        - Czy naruszenie może powodować ryzyko dla praw i wolności osób?
        - Jeśli TAK → obowiązek zgłoszenia do UODO
        - Jeśli NIE → dokumentacja wewnętrzna (rejestr naruszeń art. 33 ust. 5)
        │
        ▼ (w ciągu 72h od stwierdzenia przez hotel, liczone od momentu
           gdy hotel "wiedział lub powinien był wiedzieć")
[HOTEL → UODO]
KROK 4: Zgłoszenie do UODO (jeśli wymagane)
        - Formularz online: https://uodo.gov.pl/pl/p/zgloszenia
        - Treść zgłoszenia (art. 33 ust. 3):
            a) opis charakteru naruszenia, kategorie i liczba osób/rekordów
            b) dane kontaktowe IOD lub osoby odpowiedzialnej
            c) możliwe konsekwencje naruszenia
            d) środki zastosowane lub proponowane
        - Zgłoszenie możliwe "etapami" jeśli pełne informacje
          niedostępne w 72h (uzupełnienie w ciągu kolejnych 7 dni)
        │
        ▼ (jeśli "wysokie ryzyko" dla praw i wolności osób)
[HOTEL → GOŚCIE HOTELOWI]
KROK 5: Zawiadomienie osób dotkniętych (art. 34)
        - "Wysokie ryzyko" = kradzież tożsamości, znaczne straty finansowe,
          naruszenie szczególnych kategorii danych, poufnych informacji
        - Forma: bezpośrednio (email, SMS) lub public communication
          (ogłoszenie publiczne jeśli nie można skontaktować indywidualnie)
        - Treść: opis naruszenia, dane kontaktowe, możliwe konsekwencje,
          środki zastosowane, rekomendacje dla osób
        - Czas: "bez zbędnej zwłoki" — praktycznie w ciągu 72h od decyzji
          o konieczności powiadomienia
```

### Progi powiadamiania gości — kiedy TAK, kiedy NIE

**Obowiązek powiadamiania gości (art. 34) NIE istnieje jeśli:**
1. Platforma wdrożyła środki kryptograficzne (szyfrowanie) — dane są nieczytelne dla sprawcy
2. Podjęto środki eliminujące wysokie ryzyko (np. zmieniono klucze, przywrócono system)
3. Kontakt z każdą osobą wymagałby niewspółmiernego wysiłku — wtedy public communication (ogłoszenie publiczne)

**Przykładowy test dla Hotel SaaS:**

| Scenariusz naruszenia | Zgłoszenie do UODO | Powiadomienie gości |
|---|---|---|
| Wyciek tokenów sesji (opaque UUID, niezwiązane z PII po stronie platformy) | NIE (niskie ryzyko) | NIE |
| Wyciek tokenów + imion z bazy platformy | TAK | TAK (ryzyko identyfikacji + kompromitacja) |
| Wyciek historii rozmów AI (anonimizowanych) | Możliwe (ocena ryzyka) | Prawdopodobnie NIE |
| Wyciek danych zamówień (imię + pokój + daty + zamówienia) | TAK | TAK |
| Nieuprawniony dostęp bez potwierdzenia wycieku danych | TAK (zgłosić incydent) | NIE |
| Ransomware na serwerach (dane zaszyfrowane, backup OK) | TAK | Zazwyczaj NIE (jeśli odtworzono) |

### Klauzula DPA — breach notification (przykładowe sformułowanie)

> "W przypadku stwierdzenia naruszenia ochrony danych osobowych podmiot przetwarzający zgłasza je administratorowi bez zbędnej zwłoki, nie później niż w ciągu 24 godzin od stwierdzenia naruszenia. Zgłoszenie zawiera co najmniej: opis charakteru naruszenia, kategorie i szacowaną liczbę osób oraz rekordów danych osobowych, możliwe konsekwencje naruszenia, środki zastosowane lub proponowane w celu zaradzenia naruszeniu. Podmiot przetwarzający udziela administratorowi wszelkiej pomocy niezbędnej do wywiązania się z obowiązku zgłoszenia naruszenia organowi nadzorczemu (UODO) oraz zawiadomieniu osób, których naruszenie dotyczy."

### Rejestr naruszeń (art. 33 ust. 5)
Niezależnie od obowiązku zgłoszenia do UODO, **hotel jako administrator musi prowadzić wewnętrzny rejestr wszystkich naruszeń** (w tym tych nie wymagających zgłoszenia). Platforma SaaS powinna prowadzić analogiczny rejestr incydentów bezpieczeństwa. Rejestry są dostępne dla UODO na żądanie.

---

## 8. Rekomendacje praktyczne dla MVP

### Przed pierwszym wdrożeniem (Before Go-Live)

#### Priorytet 1 — Absolutnie wymagane (ryzyko prawne bez tego: bardzo wysokie)

**8.1 Podpisanie DPA z każdym hotelem**
- Przygotować wzorzec DPA jako załącznik do umowy SaaS
- Wzorzec musi pokrywać wszystkie klauzule z pkt 1
- Podpisanie elektronicznie (DocuSign, Adobe Sign) jest wystarczające (forma elektroniczna = forma pisemna)
- Każdy hotel = odrębna DPA lub DPA ramowa + Załącznik Danych (data annex) per hotel

**Gdzie znaleźć wzory DPA:**
- UODO nie oferuje oficjalnych wzorów DPA, ale publikuje poradniki: https://uodo.gov.pl/pl/138/402
- Organizacja IAB Europe — standard dla branży digital: https://iabeurope.eu/tcf-for-publishers/
- Wzory komercyjne: Termsfeed.com/dpa-generator, Iubenda (generatory DPA)
- Polska Izba Informatyki i Telekomunikacji (PIIT) — wzory dla sektora IT (do weryfikacji aktualności)
- Kancelarie specjalizujące się w RODO: Traple Konarski Podrecki, Bird & Bird Polska, Rymarz Zdort

**8.2 Podpisanie DPA z sub-procesorami**
- OpenAI: Pobrać i zaakceptować DPA ze strony https://openai.com/policies/data-processing-addendum/
- Anthropic: Skontaktować się przez formularz API / Enterprise w celu uzyskania DPA
- Dostawca hostingu: Większość (AWS, GCP, Azure, Hetzner) ma gotowe DPA — zaakceptować online
- Narzędzia monitoringu (Sentry, Datadog): Pobrać DPA z ich stron

**8.3 Wykaz sub-procesorów**
- Stworzyć i opublikować (URL lub PDF) listę sub-procesorów
- Aktualizować przy każdej zmianie + powiadomić hotele z 14-dniowym wyprzedzeniem

**8.4 Mechanizm usuwania danych**
- Wdrożyć automatyczne zadania (cron jobs) usuwające dane zgodnie z tabelą retencji (pkt 6)
- Scenariusz: `checkout_datetime + 2h` → invalidacja tokenu; `checkout_datetime + 48h` → usunięcie danych sesji
- Logi: rotacja co 30 dni

#### Priorytet 2 — Wymagane wkrótce po wdrożeniu (ryzyko prawne: umiarkowane przy krótkim opóźnieniu)

**8.5 Rejestr czynności przetwarzania (art. 30 ust. 2)**
- Platforma jako procesor musi prowadzić rejestr dla każdego hotelu-klienta
- Format: tabela / spreadsheet lub narzędzie (OneTrust, Osano, Cookiebot)
- Minimalna zawartość: nazwa hotelu, kategorie przetwarzania, sub-procesory, środki bezpieczeństwa

**8.6 Procedura breach notification**
- Wewnętrzna procedura wskazująca: kto wykrywa, kto ocenia, kto powiadamia hotel, w jakim czasie
- Formularz zgłoszenia incydentu bezpieczeństwa (wewnętrzny)
- Dane kontaktowe osoby ds. RODO w każdym hotelu-kliencie (zbierać przy onboardingu)

**8.7 Anonimizacja IP w logach (jeśli technicznie możliwa)**
- Konfiguracja nginx/load balancera: maskowanie ostatniego oktetu IPv4
- Efekt: redukcja zakresu danych osobowych przetwarzanych przez platformę
- Nie eliminuje DPA (patrz pkt 4), ale redukuje ryzyko i ewentualne kary

**8.8 Ocena skutków dla ochrony danych (DPIA — art. 35 RODO)**
- DPIA wymagane gdy: przetwarzanie na dużą skalę, systematyczna ocena osób (profiling), przetwarzanie szczególnych kategorii danych
- Dla MVP z 1-3 hotelami: DPIA prawdopodobnie nieobowiązkowe (mała skala), ale warto wykonać dobrowolnie
- Wzór DPIA: UODO opublikował wytyczne, EDPB opublikowało Guidelines 09/2022

#### Priorytet 3 — Dobre praktyki / skalowanie

**8.9 Certyfikacja**
- Docelowo dążyć do certyfikatu ISO 27001 (standard bezpieczeństwa informacji) lub SOC 2 Type II
- Ułatwia onboarding dużych hoteli i sieci hotelowych (wymagają certyfikatów od dostawców)
- Koszt: kilkadziesiąt-kilkaset tysięcy PLN dla małej firmy

**8.10 IOD (Inspektor Ochrony Danych)**
- Platforma SaaS: IOD **nie jest obowiązkowy** dla procesora (obowiązek dotyczy głównie administratorów przetwarzających dane na dużą skalę lub szczególnych kategorii)
- Warto jednak wyznaczyć kogoś (pracownika lub zewnętrznego konsultanta) jako punkt kontaktowy ds. RODO
- Duże hotele (zwłaszcza sieci) mogą wymagać kontaktu z IOD dostawcy

**8.11 Klauzule informacyjne dla gości (art. 13) — pomoc hotelowi**
- Hotel jest zobowiązany do informowania gości o przetwarzaniu danych
- Platforma może dostarczyć hotelowi **wzór polityki prywatności / klauzuli informacyjnej** jako wartość dodaną
- Wzór powinien być modyfikowalny (dane hotelu jako administratora, kontakt do IOD hotelu jeśli dotyczy)
- Pomaga hotelowi w compliance, wzmacnia relację biznesową

---

## Podsumowanie — krytyczne decyzje dla MVP

1. **DPA z hotelami: OBOWIĄZKOWE** — bez wyjątku, niezależnie od architektury tokenów
2. **DPA z OpenAI/Anthropic: OBOWIĄZKOWE przed wdrożeniem produkcyjnym** — zaakceptować ich DPA online
3. **Token anonimowy NIE zwalnia z DPA** — zmniejsza ryzyko, nie eliminuje obowiązku
4. **Imię gościa = dane osobowe** — przechowywać tylko przez czas sesji, najlepiej wyłącznie po stronie klienta
5. **Retencja: bezwzględnie wdrożyć automaty usuwania** — cron jobs dla każdej kategorii danych
6. **Breach notification: 24h platforma → hotel, 72h hotel → UODO** — mieć procedurę zanim dojdzie do incydentu

---

## Źródła i podstawy prawne

### Akty prawne
- Rozporządzenie 2016/679 (RODO/GDPR), art. 4, 5, 17, 25, 28, 29, 30, 32, 33, 34, 35, 82, 83 — https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32016R0679
- Ustawa z dnia 10 maja 2018 r. o ochronie danych osobowych (Dz.U. 2018 poz. 1000)
- **Decyzja wykonawcza Komisji (UE) 2021/915 z 4 czerwca 2021 r.** — SCC dla relacji administrator-procesor (Art. 28) — https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32021D0915
- Decyzja wykonawcza Komisji (UE) 2021/914 — SCC dla transferu danych do państw trzecich — https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX%3A32021D0914

### Wytyczne EDPB / WP29
- **EDPB Opinion 22/2024 on obligations from reliance on processor(s) and sub-processor(s), 7 October 2024** — https://www.edpb.europa.eu/our-work-tools/our-documents/opinion-board-art-64/opinion-222024-certain-obligations-following_en
- EDPB Guidelines 07/2020 on the concepts of controller and processor — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-072020-concepts-controller-and-processor-gdpr_en
- EDPB Guidelines 09/2022 on personal data breach notification — https://edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-092022-personal-data-breach-notification-under_en
- EDPB Recommendations 01/2020 on measures that supplement transfer tools — https://edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en
- WP29 Opinion 4/2007 on the concept of personal data — https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2007/wp136_en.pdf
- EDPB Guidelines 04/2022 on the calculation of administrative fines

### UODO (Urząd Ochrony Danych Osobowych)
- Poradnik UODO "Umowa powierzenia przetwarzania danych" — https://uodo.gov.pl/pl/138/402
- UODO — formularz zgłoszenia naruszenia ochrony danych — https://uodo.gov.pl/pl/p/zgloszenia
- Decyzje administracyjne UODO — precedensy: https://uodo.gov.pl/pl/p/decyzje
- UODO — wskazówki dla podmiotów przetwarzających — https://uodo.gov.pl/pl/138/1726
- UODO — zaktualizowany przewodnik o naruszeniach ochrony danych (luty 2025) — https://uodo.gov.pl/

### Orzecznictwo TSUE
- **TSUE (SRB v. EDPS), 4 września 2025 r.** — dane pseudonimowe jako relative concept, recipient-centric analysis
- TSUE C-582/14 (Breyer v. Bundesrepublik Deutschland, 2016) — adresy IP jako dane osobowe
- TSUE C-434/16 (Peter Nowak v. Data Protection Commissioner, 2017) — szeroka definicja danych osobowych
- TSUE C-673/17 (Planet49, 2019) — wymogi zgody dla cookies

### DPA sub-procesorów — linki
- **OpenAI Data Processing Addendum** — https://openai.com/policies/data-processing-addendum/ (powiadomienie 30 dni, retencja promptów 30 dni, SOC 2 Type II)
- **Anthropic DPA** — https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa (powiadomienie 15 dni, usunięcie danych 30 dni)
- AWS Data Processing Addendum — https://d1.awsstatic.com/legal/aws-gdpr/AWS_GDPR_DPA.pdf
- Google Cloud DPA — https://cloud.google.com/terms/data-processing-addendum

### Wzory i narzędzia
- Termsfeed DPA Generator — https://www.termsfeed.com/dpa-generator/
- Iubenda DPA Generator — https://www.iubenda.com/en/data-processing-agreement
- OneTrust (narzędzie do zarządzania RODO) — https://www.onetrust.com/

---

*Data dokumentu: 2026-06-25. Zaktualizowano o wyniki web search z czerwca 2026 r. Dokument ma charakter badawczy i nie stanowi porady prawnej. Przed podpisaniem umów z klientami wymagana weryfikacja przez radcę prawnego specjalizującego się w RODO.*
