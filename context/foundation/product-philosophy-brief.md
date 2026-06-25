# Product Philosophy & Architecture Brief
**Hotel Guest App — MVP**
*Wersja 1.0 — czerwiec 2026*

---

## Kontekst

Aplikacja dla gości hotelowych wspierająca dostęp do usług hotelowych, ich zamawianie oraz korzystanie z AI concierge. Produkt budowany od zera z myślą o testach MVP w zaprzyjaźnionych hotelach.

---

## Filozofia produktu

### Komu sprzedajemy, dla kogo projektujemy

Produkt sprzedawany jest hotelom. Działa jednak tylko wtedy, gdy realnie służy gościom.

Hotel kupuje wyniki: wzrost upsell, lepsze recenzje, odciążenie recepcji. Gość kupuje doświadczenie: wygodę, dostępność, poczucie opieki. Jedno nie istnieje bez drugiego.

**Kluczowa zasada:** doświadczenie gościa nigdy nie jest poświęcane na rzecz celów sprzedażowych hotelu. Aplikacja która "pachnie" sprzedażą traci zaufanie gościa, przestaje być używana i przestaje generować wyniki dla hotelu.

Guest-first nie jest altruizmem — to strategia sprzedaży do hoteli.

---

## Filar wartości — 5A

5A to architektura wartości produktu. Stanowi język komunikacji z hotelem (warstwa B2B) oraz komunikat powitalny dla gościa (warstwa onboardingu). Nie jest to struktura nawigacji w interfejsie.

| Filar | Znaczenie |
|---|---|
| **Access** | Gość ma natychmiastowy, bezproblemowy dostęp do wszystkiego czego potrzebuje podczas pobytu |
| **Assistance** | Pomoc jest zawsze w zasięgu ręki — bez kolejki, bez bariery językowej, o każdej porze |
| **Amenities** | Pełna oferta hotelowa — płatna i bezpłatna — jest przejrzysta i łatwo dostępna |
| **Activities** | Gość odkrywa co robić — w hotelu i w okolicy — bez szukania w innych źródłach |
| **AI** | Inteligentny concierge oparty na danych hotelowych odpowiada na pytania i wspiera decyzje gościa |

### Jak 5A działa w produkcie

- **Dla hotelu:** propozycja wartości w pitchu i materiałach sprzedażowych
- **Dla gościa:** krótki komunikat powitalny przy pierwszym wejściu do aplikacji
- **Pod spodem:** niewidoczna organizacja logiki i treści produktu

---

## Model biznesowy

Produkt funkcjonuje jako platforma dwustronna:

**Hotel** jest operatorem — zarządza treścią, ofertą i danymi. Płaci za dostęp do platformy (model SaaS).

**Gość** jest użytkownikiem — korzysta z aplikacji jako rozszerzenia obsługi hotelowej.

**Platforma** łączy obie strony i dostarcza infrastrukturę, AI oraz interfejs gościa.

Aplikacja dla gościa jest quasi-usługą uzupełniającą model SaaS — nie jest osobnym produktem, ale bez niej SaaS nie ma wartości.

---

## Architektura platformy — zasady

### Jeden produkt, wiele hoteli

Platforma działa jako jedna instancja obsługująca wielu operatorów hotelowych. Każdy hotel jest tenantam w ramach wspólnej infrastruktury, nie osobną instancją techniczną.

**Konsekwencje:**
- Jeden codebase, jeden deployment, kontrola kosztów infrastruktury
- Zmiany i poprawki wdrażane raz dla wszystkich hoteli
- Onboarding nowego hotelu w minutach, nie dniach
- Skalowalność bez liniowego wzrostu kosztów operacyjnych

### Dwa końce, jeden produkt

MVP wymaga zbudowania obu końców platformy jednocześnie:

**Panel hotelowy** — narzędzie operatora: zarządzanie usługami i treścią, zasilanie danych dla AI concierge, generowanie kodów dostępu, podgląd aktywności.

**Interfejs gościa** — to co widzi i czego używa gość podczas pobytu: przeglądanie oferty, zamawianie usług, czat z AI concierge.

Bez panelu hotel nie może wdrożyć produktu. Bez interfejsu gościa panel nie ma sensu. Nie można testować jednego bez drugiego.

---

## AI Concierge — zakres MVP

Na etapie MVP AI concierge to czat wspomagany danymi dostarczonymi przez hotel.

**Co to oznacza w praktyce:**
- Odpowiada na pytania o ofertę hotelu, godziny, usługi, okolice
- Działa w oparciu o treści które hotel wprowadził do panelu
- Jest przewidywalny i kontrolowany — hotel wie co concierge wie

**Dodatkowa wartość dla hotelu:**
Logi rozmów z concierge to kopalnia insightów — czego gość szuka, czego nie znajduje, co jest niejasne w ofercie. To dane które hotel dostaje przy okazji, bez dodatkowego wysiłku.

Rozszerzenie możliwości AI to obszar kolejnych iteracji, nie MVP.

---

## Co ten dokument nie obejmuje

Niniejszy brief dotyczy wyłącznie filozofii i zasad architektonicznych. Poza zakresem pozostają:

- Stack techniczny i decyzje implementacyjne
- Szczegółowy flow UX i projekt interfejsu
- Model cenowy i warunki SaaS
- Specyfikacja panelu hotelowego
- Integracje zewnętrzne

Powyższe są przedmiotem kolejnych sesji roboczych.

---

*Dokument powstał jako fundament pod specyfikację MVP. Przed rozpoczęciem prac projektowych i technicznych wymaga akceptacji.*
