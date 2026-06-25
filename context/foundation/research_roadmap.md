# Research Roadmap — Hotel Guest App MVP
*Fundament pod sesje implementacyjne*
*Wersja 1.1 — czerwiec 2026*

---

## Dokumenty projektu

Ten roadmap jest częścią zestawu trzech dokumentów. Czytaj je razem:

| Dokument | Rola | Kiedy używać |
|---|---|---|
| `product-philosophy-brief.md` | Niezmienne "dlaczego" — filozofia i zasady | Przed każdą sesją jako przypomnienie kierunku |
| `research_roadmap.md` | Ten plik — mapa sesji, obszary, HITL | Planowanie i nawigacja między sesjami |
| `decisions_log.md` | Żywy rejestr — ustalenia, decyzje, subagenty | **Podczas każdej sesji i po jej zakończeniu** |

---

## Jak używać tego dokumentu

Każda sesja robocza odpowiada jednemu obszarowi. Sesje są zależne — rekomendowana kolejność jest ważna.

**HITL (Human-in-the-Loop)** — decyzje oznaczone 🧑 wymagają świadomej decyzji człowieka przed kontynuacją. Nie są to domyślne wybory które można pominąć. Każda z nich ma konsekwencje których nie można łatwo cofnąć.

---

## Instrukcja dla Claude — obowiązkowe kroki w każdej sesji

> **Claude: przeczytaj i zastosuj poniższe zasady na początku każdej sesji roboczej.**

### Przed rozpoczęciem sesji
1. Wczytaj `decisions_log.md` i sprawdź status sesji którą zaczynasz — czy poprzednie sesje są zamknięte zgodnie z zależnościami z sekcji "Zależności między sesjami"
2. Sprawdź rejestr HITL w `decisions_log.md` — które decyzje są już zamknięte, które otwarte
3. Nie kontynuuj jeśli wymagana sesja poprzednia ma status "nie rozpoczęta" — poinformuj użytkownika o zależności

### Podczas sesji
4. Przy każdej decyzji HITL 🧑 zatrzymaj się i explicite zapytaj użytkownika o decyzję zanim przejdziesz dalej — nie zakładaj domyślnej odpowiedzi
5. Uruchom blok `[SUBAGENT]` z `decisions_log.md` dla bieżącej sesji na początku pracy badawczej — nie pomijaj subagentów
6. Zapisuj ustalenia na bieżąco, nie czekaj na koniec sesji

### Po zakończeniu sesji
7. Zaktualizuj `decisions_log.md` — uzupełnij sekcję "Ustalenia z sesji", "Zamknięte decyzje HITL", "Otwarte pytania"
8. Zaktualizuj rejestr HITL — zmień statusy zamkniętych decyzji na ✅ i wpisz wynik
9. Zmień status sesji w `decisions_log.md` na "✅ zamknięta" lub "🔄 w toku" jeśli są otwarte pytania
10. Poinformuj użytkownika które sesje są teraz odblokowane zgodnie z drzewem zależności

---

## Sesja 1 — Tenant & Identity Model

**Pytanie przewodnie:** Jak platforma identyfikuje hotel i gościa?

**Obszary do zbadania:**
- Struktura tenanta hotelowego w bazie danych
- Model tokenu QR — co koduje, jak długo żyje, jak jest walidowany
- Dwuetapowa weryfikacja gościa (QR przy ladzie + QR w pokoju) — mechanika i edge case'y
- Anonimowość vs tożsamość gościa — co platforma wie o gościu i po co

**Decyzje HITL 🧑**
- Czy platforma przechowuje dane osobowe gościa, czy operuje wyłącznie na anonimowym tokenie sesji? Konsekwencje: RODO, odpowiedzialność, integracja z PMS hotelu w przyszłości.
- Jak długo żyje sesja gościa? Konsekwencje: bezpieczeństwo vs wygoda (gość nie chce skanować QR przy każdym wejściu).

---

## Sesja 2 — Panel Hotelowy (Operator)

**Pytanie przewodnie:** Co hotel musi umieć zrobić samodzielnie, bez pomocy technicznej?

**Obszary do zbadania:**
- Zarządzanie usługami: dodawanie, edycja, kategoryzacja, ceny, dostępność
- Zarządzanie treścią dla AI concierge: format danych, granulacja, aktualizacje
- Generowanie i zarządzanie kodami QR: dla pokoi, dla recepcji, unieważnianie
- Role i dostępy w panelu: kto w hotelu może co robić
- Podgląd aktywności gości: jakie dane hotel widzi i w jakiej formie

**Decyzje HITL 🧑**
- Kto po stronie hotelu jest właścicielem danych w panelu? Konsekwencje dla odpowiedzialności i wsparcia.
- Jak bardzo rozbudowany jest panel na MVP — co jest niezbędne, a co można zastąpić onboardingiem manualnym? Ryzyko: przebudowanie panelu kosztem interfejsu gościa.

---

## Sesja 3 — Interfejs Gościa

**Pytanie przewodnie:** Jak gość w 10 sekund znajduje to czego szuka?

**Obszary do zbadania:**
- Architektura informacji — jak prezentować usługi płatne i bezpłatne
- Flow po wejściu przez QR — co gość widzi jako pierwsze
- Komunikat powitalny 5A — forma, długość, moment wyświetlenia
- Zamawianie usług — jak prosto, bez rejestracji, bez barier
- Obsługa języków — MVP po polsku i angielsku, mechanika przełączania
- Stany brzegowe: brak internetu, wygasły token, usługa niedostępna

**Decyzje HITL 🧑**
- Czy gość może zamawiać usługi płatne bez podawania danych płatniczych (rachunek do pokoju) czy wymaga to integracji płatniczej już na MVP? Konsekwencje: zakres techiczny, odpowiedzialność za płatność, zależność od hotelu.
- Jak agresywny jest upsell w interfejsie? Gdzie leży granica między pomocną rekomendacją a nachalną sprzedażą? To decyzja filozoficzna z konsekwencjami dla NPS.

---

## Sesja 4 — AI Concierge

**Pytanie przewodnie:** Co concierge wie, czego nie wie i co robi gdy nie wie?

**Obszary do zbadania:**
- Format i struktura danych wejściowych od hotelu (co hotel wgrywa, jak to jest przetwarzane)
- Zakres wiedzy na MVP: oferta hotelu, godziny, okolica, FAQ
- Zachowanie przy braku odpowiedzi — fallback do recepcji ludzkiej
- Tone of voice concierge — neutralny, ciepły, markowy?
- Wielojęzyczność concierge
- Co platforma loguje z rozmów i kto ma do tego dostęp

**Decyzje HITL 🧑**
- Czy concierge może inicjować akcje (np. zamówić usługę w imieniu gościa) czy tylko informuje? Konsekwencje: zakres odpowiedzialności, złożoność integracji, ryzyko błędów.
- Jak transparentny jest concierge wobec gościa — czy gość wie że rozmawia z AI? Rekomendacja: tak, zawsze — ale to decyzja którą hotel może chcieć negocjować.
- Kto jest odpowiedzialny za jakość odpowiedzi concierge — platforma czy hotel który dostarcza dane? To musi być jasne w umowie przed wdrożeniem.

---

## Sesja 5 — Model SaaS i Onboarding Hotelu

**Pytanie przewodnie:** Jak hotel wchodzi na platformę i co za to płaci?

**Obszary do zbadania:**
- Proces onboardingu hotelu: od rejestracji do działającej aplikacji dla gości
- Co hotel konfiguruje sam, co wymaga wsparcia platformy
- Model cenowy: abonament, prowizja od transakcji, hybryda
- Warunki SLA: dostępność, wsparcie, odpowiedzialność za dane
- Offboarding: co się dzieje z danymi hotelu i gości po zakończeniu współpracy

**Decyzje HITL 🧑**
- Model cenowy MVP — czy testujesz z hotelami za darmo żeby zebrać dane, czy od razu waliduje się gotowość do płacenia? Konsekwencja: jakość feedbacku, relacja z hotelem, moment revenue.
- Kto jest stroną przetwarzającą dane gości — platforma czy hotel? To decyzja prawna z konsekwencjami dla umów RODO które musisz podpisać z każdym hotelem.

---

## Sesja 6 — Technologia i Infrastruktura

**Pytanie przewodnie:** Co budujemy, na czym, żeby nie przepisywać tego za rok?

**Obszary do zbadania:**
- Stack frontendowy — aplikacja webowa (PWA), wymagania offline, wydajność na mobile
- Backend i baza danych — architektura multi-tenant
- Hosting i infrastruktura — kontrola kosztów przy skalowaniu
- Strategia deploymentu — CI/CD, środowiska, rollback
- Bezpieczeństwo tokenów QR i sesji gościa
- Monitoring i logi — co mierzymy od dnia pierwszego

**Decyzje HITL 🧑**
- Build vs buy dla komponentów AI — własny RAG czy zewnętrzny serwis? Konsekwencje: koszt, kontrola, vendor lock-in.
- Czy MVP jest budowany przez zewnętrzny zespół czy własny? To determinuje poziom szczegółowości specyfikacji którą musisz przygotować.

---

## Sesja 7 — Metryki i Walidacja MVP

**Pytanie przewodnie:** Skąd będziemy wiedzieć że MVP działa?

**Obszary do zbadania:**
- Metryki hotelowe: wzrost upsell, przychód na gościa, odciążenie recepcji
- Metryki gościa: adoption rate (ile skanuje QR), session depth, powroty do appki
- Metryki AI: ile zapytań, ile bez odpowiedzi, satysfakcja z odpowiedzi
- Feedback loop: jak zbieramy jakościowy feedback od hoteli i gości podczas testów
- Kryteria sukcesu MVP — co musi być prawdą żeby iść dalej

**Decyzje HITL 🧑**
- Jaki jest minimalny wynik który uznajesz za "MVP działa" i uzasadnia dalszą inwestycję? Ustal to przed testami, nie po — żeby wynik nie był interpretowany wstecznie.
- Ile hoteli i ile tygodni to wystarczający test? Zbyt mały próba daje fałszywy sygnał w obie strony.

---

## Zależności między sesjami

```
Sesja 1 (Identity)
    └── Sesja 2 (Panel hotelowy)
            └── Sesja 3 (Interfejs gościa)
            └── Sesja 4 (AI Concierge)
    └── Sesja 5 (SaaS & Onboarding)
            └── Sesja 6 (Technologia)
                    └── Sesja 7 (Metryki & Walidacja)
```

Sesje 3 i 4 mogą toczyć się równolegle po zamknięciu sesji 2.
Sesja 6 może zacząć się wcześniej w zakresie decyzji infrastrukturalnych niezależnych od produktu.

---

## Decyzje HITL — rejestr zbiorczy

| # | Sesja | Decyzja | Status |
|---|---|---|---|
| 1 | Identity | Dane osobowe gościa: przechowywać czy token anonimowy? | ✅ zamknięta — token anonimowy + DPA + imię do UX |
| 2 | Identity | Czas życia sesji gościa | ✅ zamknięta — fixed expiry = checkout + 2h |
| 3 | Panel | Właściciel danych po stronie hotelu | ✅ zamknięta — Owner = billing = ADM, podpisuje DPA |
| 4 | Panel | Zakres panelu na MVP vs manual onboarding | ✅ zamknięta — self-service + wsparcie jako płatna opcja |
| 5 | Interfejs | Płatności: rachunek do pokoju vs bramka płatnicza na MVP | ⬜ otwarta |
| 6 | Interfejs | Granica upsell vs doświadczenie gościa | ⬜ otwarta |
| 7 | AI | Concierge informuje czy może wykonywać akcje? | ⬜ otwarta |
| 8 | AI | Transparentność AI wobec gościa | ⬜ otwarta |
| 9 | AI | Odpowiedzialność za jakość odpowiedzi concierge | ⬜ otwarta |
| 10 | SaaS | Model cenowy MVP: płatny czy free dla pierwszych hoteli? | ✅ zamknięta — Lighthouse Program (3–5 hoteli gratis 3–6 mies. za case study + referencje) |
| 11 | SaaS | Administrator danych gości: platforma czy hotel? | ✅ zamknięta — hotel = ADM, platforma = procesor; DPA obowiązkowe z każdym hotelem |
| 12 | Tech | Build vs buy dla komponentów AI | ⬜ otwarta |
| 13 | Tech | Zespół: zewnętrzny vs własny | ⬜ otwarta |
| 14 | Metryki | Definicja sukcesu MVP przed testami | ⬜ otwarta |
| 15 | Metryki | Skala testu: ile hoteli, ile tygodni | ⬜ otwarta |

---

*Ten dokument definiuje strukturę i zasady. Aktualne ustalenia, decyzje i subagenty żyją w `decisions_log.md` — tam zapisuj wszystko co dzieje się podczas sesji.*
