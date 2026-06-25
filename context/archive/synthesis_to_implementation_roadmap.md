# Synthesis → Implementation Roadmap
*Faza syntezy — uruchamiana po zamknięciu wszystkich 7 sesji badawczych*
*Wersja 1.0 — czerwiec 2026*

---

## Cel tego dokumentu

Ten dokument prowadzi Claude Code przez fazę syntezy: zebranie wszystkich artefaktów badawczych, zamknięcie decyzji o tech stacku przez HITL, i wyprodukowanie `implementation_roadmap.md` gotowego do przekazania zespołowi deweloperskiego.

**Wejście:** wypełniony `decisions_log.md` + pliki w `research/`
**Wyjście:** `implementation_roadmap.md`

---

## Instrukcja dla Claude Code

> **Claude: wykonaj poniższe etapy sekwencyjnie. Nie przechodź do kolejnego etapu bez jawnego potwierdzenia użytkownika.**

---

## Etap 0 — Weryfikacja gotowości

Przed rozpoczęciem syntezy sprawdź:

1. Wczytaj `decisions_log.md` — czy wszystkie 7 sesji ma status ✅ zamknięta?
2. Sprawdź czy katalog `research/` zawiera pliki wynikowe ze wszystkich sesji
3. Sprawdź rejestr HITL — czy wszystkie 15 decyzji ma status ✅ zamknięta?

Jeśli cokolwiek jest otwarte — wylistuj braki i zatrzymaj się. Nie kontynuuj syntezy na niepełnych danych.

Jeśli wszystko zamknięte — poinformuj użytkownika i przejdź do Etapu 1.

---

## Etap 1 — HITL: Decyzja o tech stacku

> **Claude: to jest punkt HITL. Nie rób nowego researchu — sesja 6 już to pokryła. Wczytaj wyniki, przedstaw użytkownikowi, poczekaj na decyzję. Nie wybieraj stacku samodzielnie.**

### Krok 1a — Wczytaj wyniki sesji 6

Wczytaj wszystkie pliki z `research/session_06/` oraz zamknięte decyzje HITL sesji 6 z `decisions_log.md`.

Zsyntezuj je w zwięzłe porównanie opcji dla każdej warstwy stacku — bez rekomendacji końcowej. Forma: tabela TOP 2 opcji per warstwa + kluczowe trade-offy + szacowany koszt miesięczny (MVP i scale).

### Krok 1b — Przedstaw wyniki i zamknij HITL

Przedstaw użytkownikowi syntezę i zadaj poniższe pytania — **jedna decyzja na raz**, czekaj na odpowiedź przed przejściem do kolejnej:

**HITL-T1: Frontend framework**
Który framework wybieramy? Konsekwencja: determinuje dostępność developerów i sposób hostingu.

**HITL-T2: Backend i baza danych**
Która kombinacja? Konsekwencja: determinuje architekturę multi-tenant i koszty długoterminowe.

**HITL-T3: Warstwa AI/RAG**
Które rozwiązanie? Konsekwencja: vendor lock-in, koszt operacyjny, kontrola nad jakością odpowiedzi.

**HITL-T4: Hosting i DevOps**
Które środowisko? Konsekwencja: lokalizacja danych (RODO), koszty, wymagania operacyjne zespołu.

**HITL-T5: Zespół deweloperski**
Zewnętrzny (agencja/freelancerzy) czy własny? Konsekwencja: determinuje poziom szczegółowości specyfikacji i tempo iteracji.

> **Claude: zapisz wszystkie odpowiedzi do `decisions_log.md` w nowej sekcji "Decyzje tech stack". Dopiero potem przejdź do Etapu 2.**

---

## Etap 2 — Synteza artefaktów badawczych

> **Claude: uruchom subagenty syntetyzujące równolegle w tle. Każdy czyta research z odpowiedniej sesji i produkuje gotowy fragment implementation roadmap.**

### Krok 2a — Subagenty syntetyzujące

```
Uruchom równolegle jako subagenty w tle:

Subagent 1: synthesize-identity-panel
Wczytaj:
- decisions_log.md (sesje 1 i 2, zamknięte decyzje HITL)
- research/session_01/ (wszystkie pliki)
- research/session_02/ (wszystkie pliki)
Wyprodukuj fragment roadmapu implementacji obejmujący:
- Architektura tenantów i model sesji gościa
- Schemat bazy danych: hotel, tenant, guest_session, QR token
- Panel hotelowy: lista ekranów i funkcji z priorytetem (must/should/could)
- Decyzje architektoniczne z uzasadnieniem
- Krytyczne ścieżki do pokrycia testami integracyjnymi (min: generowanie QR, walidacja tokenu, onboarding tenanta)
Zapisz do research/synthesis/roadmap-identity-panel.md

Subagent 2: synthesize-guest-app
Wczytaj:
- decisions_log.md (sesja 3, zamknięte decyzje HITL)
- research/session_03/ (wszystkie pliki)
Wyprodukuj fragment roadmapu implementacji obejmujący:
- Architektura informacji interfejsu gościa
- Lista ekranów i komponentów z priorytetem (must/should/could)
- Flow użytkownika: od QR scan do zamówionej usługi
- Edge cases i stany brzegowe do obsłużenia
- Scenariusze e2e do pokrycia testami (min: QR scan → auth → przeglądanie → zamówienie)
Zapisz do research/synthesis/roadmap-guest-app.md

Subagent 3: synthesize-ai-concierge
Wczytaj:
- decisions_log.md (sesja 4, zamknięte decyzje HITL)
- research/session_04/ (wszystkie pliki)
- research/synthesis/ai-rag-stack.md
Wyprodukuj fragment roadmapu implementacji obejmujący:
- Architektura RAG: format danych wejściowych hotelu, pipeline przetwarzania
- Schemat integracji wybranego stosu AI (z decyzji HITL-T3)
- Zakres wiedzy concierge na MVP i mechanizm fallback
- Co hotel musi dostarczyć i w jakiej formie
Zapisz do research/synthesis/roadmap-ai-concierge.md

Subagent 4: synthesize-saas-metrics
Wczytaj:
- decisions_log.md (sesje 5 i 7, zamknięte decyzje HITL)
- research/session_05/ (wszystkie pliki)
- research/session_07/ (wszystkie pliki)
Wyprodukuj fragment roadmapu implementacji obejmujący:
- Proces onboardingu hotelu: kroki, odpowiedzialności, czas
- Model cenowy i warunki SLA
- Stack analityczny i lista eventów do śledzenia od dnia 1
- Definicja sukcesu MVP: metryki, progi, timeline testu
Zapisz do research/synthesis/roadmap-saas-metrics.md

Kontynuuj po zakończeniu wszystkich subagentów.
```

### Krok 2b — Weryfikacja kompletności

Po zakończeniu subagentów sprawdź:
- Czy każdy plik wynikowy istnieje i ma treść?
- Czy decyzje HITL z `decisions_log.md` są odzwierciedlone w każdym fragmencie?
- Czy nie ma sprzeczności między fragmentami?

Jeśli są sprzeczności — wylistuj je użytkownikowi i rozstrzygnij przed Etapem 3.

---

## Etap 3 — Budowa implementation_roadmap.md

> **Claude: złóż wszystkie fragmenty w jeden spójny dokument. To jest praca sekwencyjna — nie deleguj do subagentów.**

### Struktura docelowego dokumentu

Zbuduj `implementation_roadmap.md` według poniższej struktury. Wypełnij każdą sekcję treścią z odpowiednich plików syntetycznych.

```markdown
# Implementation Roadmap — Hotel Guest App MVP

## 1. Kontekst i założenia
   — z product-philosophy-brief.md
   — zamknięte decyzje HITL z decisions_log.md (skrót)

## 2. Tech Stack
   — decyzje HITL-T1 do HITL-T5 z Etapu 1
   — diagram warstw: frontend / backend / baza / AI / hosting

## 3. Architektura systemu
   — z roadmap-identity-panel.md
   — schemat komponentów i ich zależności
   — schemat bazy danych (tabele i relacje)
   — model multi-tenant

## 4. Panel hotelowy
   — z roadmap-identity-panel.md
   — lista ekranów z priorytetem must/should/could
   — role i uprawnienia

## 5. Interfejs gościa
   — z roadmap-guest-app.md
   — lista ekranów z priorytetem must/should/could
   — user flow od QR do zamówienia

## 6. AI Concierge
   — z roadmap-ai-concierge.md
   — architektura RAG
   — wymagania wobec hotelu (co musi dostarczyć)

## 7. Onboarding hotelu i model SaaS
   — z roadmap-saas-metrics.md
   — kroki onboardingu
   — model cenowy

## 8. Plan wdrożenia MVP
   — fazy: co budujemy w jakiej kolejności
   — zależności między modułami
   — kamienie milowe

## 9. Strategia testowania
   — unit testy: które moduły, framework, pokrycie minimalne
   — testy integracyjne: krytyczne ścieżki (QR auth, zamówienie usługi, RAG pipeline)
   — e2e testy: flow gościa (QR → usługa) i flow hotelu (panel → widoczność w appce)
   — testy AI concierge: jak weryfikować jakość odpowiedzi automatycznie
   — co testujemy przed każdym deploymentem na MVP

## 10. Walidacja MVP
   — z roadmap-saas-metrics.md
   — metryki sukcesu
   — stack analityczny
   — timeline testu

## 11. Otwarte ryzyka i decyzje odroczone
    — wszystkie decyzje HITL ze statusem 🚫 odroczona
    — zidentyfikowane ryzyka techniczne i produktowe
```

### Zasady składania dokumentu

- Każda sekcja musi być gotowa do przekazania developerowi — bez niedomówień
- Decyzje HITL muszą być widoczne jako explicite założenia, nie ukryte w tekście
- Priorytety must/should/could są obowiązkowe przy każdej liście funkcji
- Szacunki czasowe tylko jeśli wynikają z researchu — nie zgaduj

---

## Etap 4 — Weryfikacja i oddanie

### Krok 4a — Autorecenzja

Przed oddaniem dokumentu sprawdź:

- [ ] Czy każda zamknięta decyzja HITL z `decisions_log.md` jest odzwierciedlona w roadmapie?
- [ ] Czy tech stack jest spójny we wszystkich sekcjach (nie ma sprzeczności)?
- [ ] Czy każdy moduł ma jasno określony zakres MVP (co jest w środku, co poza)?
- [ ] Czy sekcja testowania pokrywa unit, integracyjne i e2e — z konkretnymi frameworkami zgodnymi z wybranym stackiem?
- [ ] Czy sekcja "Otwarte ryzyka" zawiera wszystkie decyzje odroczone?
- [ ] Czy dokument jest zrozumiały dla osoby która nie uczestniczyła w sesjach badawczych?

### Krok 4b — Przedstaw użytkownikowi

Przedstaw użytkownikowi:
1. Plik `implementation_roadmap.md`
2. Krótkie podsumowanie: co zostało ustalone, co pozostaje otwarte
3. Sugerowany następny krok (np. przekazanie do dewelopera, sesja estymacji, decyzja o MVP scope)

---

## Pliki wejściowe wymagane do syntezy

```
docs/
├── product-philosophy-brief.md      ✓ wymagany
├── research_roadmap.md              ✓ wymagany
└── decisions_log.md                 ✓ wymagany (wszystkie sesje ✅)

research/
├── session_01/                      ✓ wymagany (3 pliki)
├── session_02/                      ✓ wymagany (3 pliki)
├── session_03/                      ✓ wymagany (3 pliki)
├── session_04/                      ✓ wymagany (3 pliki)
├── session_05/                      ✓ wymagany (3 pliki)
├── session_06/                      ✓ wymagany (3 pliki)
└── session_07/                      ✓ wymagany (3 pliki)
```

## Pliki produkowane przez syntezę

```
research/synthesis/
├── roadmap-identity-panel.md        ← Etap 2, subagent 1
├── roadmap-guest-app.md             ← Etap 2, subagent 2
├── roadmap-ai-concierge.md          ← Etap 2, subagent 3
└── roadmap-saas-metrics.md          ← Etap 2, subagent 4

implementation_roadmap.md            ← Etap 3, output finalny
```

---

*Ten dokument jest instrukcją operacyjną dla Claude Code — nie modyfikuj go podczas syntezy.*
*Po zakończeniu syntezy jedynym dokumentem roboczym jest `implementation_roadmap.md`.*
