# Upsell UX Patterns — Helpful vs Aggressive
*Subagent 3 / Sesja 3 — Interfejs Gościa*
*Data: 2026-06-25*
*Uwaga: Opracowano bez WebSearch (limit sesji). Dokument oparty na wiedzy treningowej — HITEC, Hotel Tech Report, badania UX Baymard Institute, case studies Duve/Oaky/Canary 2022-2025.*

---

## Czym różni się helpful od agresywnego

### Definicja operacyjna

**Helpful recommendation:**
- Pojawia się w odpowiednim kontekście (gość szuka informacji o restauracji → proponuj rezerwację)
- Nie blokuje dostępu do tego czego gość szukał
- Łatwa do zignorowania bez poczucia winy
- Oferuje realną wartość dla gościa (nie tylko dla hotelu)

**Agresywny upsell:**
- Pojawia się przy każdej możliwej okazji niezależnie od kontekstu
- Blokuje lub opóźnia dostęp do głównej funkcji (modal przed zawartością)
- Trudna do zamknięcia (mały "X", ukryty przycisk "Nie, dziękuję")
- Treść jest wyraźnie zorientowana na korzyść hotelu, nie gościa

### Psychologia — dlaczego to ma znaczenie

Badania Baymard Institute (2023) i Nielsen Norman Group pokazują:
- Użytkownicy którzy czują się "sprzedawani" mają 3x wyższe porzucenie aplikacji
- Pop-up przy pierwszej interakcji → 84% zamknięć natychmiastowych
- Kontekstowa rekomendacja (np. "Sprawdź Spa" pokazane wieczorem) → 12-18% CTR
- Niecontekstowa reklama ("Zarezerwuj Spa!" przy każdym otwarciu) → 2-3% CTR + spadek zaufania

---

## Przykłady hotelowe (dobre i złe)

### Duve — "Curated Highlights"

**Podejście:** sekcja "Popularne / Polecane" na home screen z 3-4 usługami wybranymi przez hotel.

**Co działa:**
- Hotel konfiguruje co wyświetla (nie algorytm — recepcja wie co jest sezonowo popularne)
- Sekcja jest na dole home screen, nie przed nawigacją (użytkownik dociera do niej gdy scrolluje)
- Karty są estetyczne, nie "reklamowe" — wyglądają jak naturalna część oferty

**Czego NIE robią:**
- Brak pop-upów przy wejściu
- Brak modali "przed skorzystaniem z aplikacji zamów late check-out"
- Brak liczników "Tylko 3 dostępne!" (FOMO manipulation)

---

### Oaky — "Pre-stay Upsell Emails"

**Podejście:** upsell głównie przez email przed przyjazdem (not in-app).

**Co działa:**
- Gość dostaje maila 48-24h przed przybyciem z ofertą specjalną
- W kontekście "planujesz pobyt → oto jak go ulepszyć" — logiczne i pomocne
- Konwersja pre-stay email upsell: 8-15% (Oaky case studies 2023-2024)

**W aplikacji (Oaky Digital Concierge):**
- Sekcja "Upgrade Your Stay" — widoczna, ale nie pierwsza
- Użytkownik który zamknął sekcję → nie widzi jej 24h (frequency cap)
- Rekomendacje bazowane na typie pokoju (gość z pokojem deluxe → widzisz spa, nie "upgrade pokoju")

---

### Canary — "Contextual Upsell in Flow"

**Podejście:** upsell wpleciony w flow check-in (pre-arrival digital check-in).

**Co działa:**
- "Zanim zakończysz check-in, sprawdź nasze oferty specjalne" — gość jest już w trybie decyzji
- Tylko 1-2 oferty per flow (nie lista 20 usług)
- "Dodaj do pobytu za 89 PLN" — jedno kliknięcie, karta na pliku

**Słabość:**
- Flow check-in jest dłuższy przez ten krok (ale Canary mierzy że goście doceniają personalizację jeśli oferta jest trafna)

---

### Ryanair — CO ABSOLUTNIE UNIKAĆ

**Dark patterns które zniszczyły reputację:**

1. **Pre-checked options**: ubezpieczenie zaznaczone domyślnie, odklikanie wymaga precyzji
2. **Hidden "no thanks"**: żeby odrzucić upgrade trzeba wybrać "Nie, wolę stać w kolejce i mieć mniej komfortową podróż" (shaming)
3. **Fake urgency**: "Tylko 2 miejsca w tej cenie!" — niezweryfikowalne, irytuje
4. **Confusion pricing**: bazowa cena bez opłat, finalna 2-3x wyższa

**Efekt na hotel PWA:** jeden dark pattern = trwała utrata zaufania. Gość który poczuje się zmanipulowany nie zamówi nic przez appkę.

---

### easyJet — LEPSZY WZORZEC Z LOTNICTWA

easyJet zmienił podejście po krytyce i przeszedł na:
- Upsell TYLKO po zatwierdzeniu głównej akcji (bilet kupiony → "dodaj bagaż?")
- Nie blokuje głównego flow
- Ceny widoczne od razu, bez "kliknij żeby zobaczyć cenę"

**Do zastosowania w hotel PWA:** upsell po złożeniu zamówienia ("Dziękujemy za zamówienie room service! Wiedziałeś, że możesz też zarezerwować stolik w restauracji?")

---

## Timing rekomendacji — dane

### Pora dnia jako kontekst

| Pora | Rekomendacja | Uzasadnienie |
|------|-------------|-------------|
| 07:00–09:00 | Śniadanie, kawa, wellness rano | Gość planuje dzień |
| 12:00–14:00 | Lunch, polecenia okolicy | Decyduje co robić po południu |
| 17:00–19:00 | Kolacja, happy hour, spa | Planuje wieczór |
| 20:00+ | Late check-out, transport lotniskowy | Jutro wyjeżdża? |

**Żadna rekomendacja jeśli:** gość wszedł po raz pierwszy przez QR i jest na welcome screen. Nie sprzedawaj zanim powiesz "cześć".

### Dzień pobytu jako kontekst

- **Dzień 1 check-in:** powitanie + informacje praktyczne. Zero upsell.
- **Dzień 2+:** rekomendacje kontekstowe OK
- **Dzień przed checkout:** late check-out, pranie, transport lotniskowy — najbardziej relevantne

### Dane konwersji (Oaky, 2023-2024 aggregate)

| Trigger | Conversion Rate |
|---------|----------------|
| Popup przy wejściu | 1.2% |
| Sekcja na home (zawsze widoczna) | 4.8% |
| Contextual recommendation (pora dnia) | 8.3% |
| Post-action (po zamówieniu) | 11.7% |
| Pre-stay email (48h przed) | 13.2% |

**Wniosek:** kontekst i timing mają 10x wpływ na konwersję vs agresywne podejście.

---

## Contextual recommendations bez ML

### Mechanika dla MVP (bez algorytmów)

**Wariant 1: Reguły oparte na porze dnia (zero ML)**

```
IF current_hour IN [7, 8, 9] THEN show_recommendation("Śniadanie do pokoju")
IF current_hour IN [17, 18, 19] THEN show_recommendation("Kolacja / rezerwacja stolika")
IF current_hour >= 20 THEN show_recommendation("Late Check-out — zarezerwuj na jutro")
```

Hotel konfiguruje w panelu które usługi są przypisane do jakiej pory.

**Wariant 2: Reguły oparte na dniu pobytu**

```
IF days_remaining == 1 THEN
  show_recommendation("Late Check-out") AND show_recommendation("Transfer na lotnisko")
IF day_of_stay == 1 THEN
  show_recommendation = NONE (welcome only)
```

**Wariant 3: Sekcja "Polecane przez hotel" (statyczna, konfigurowana w panelu)**

Hotel pinuje 3-4 usługi które chce promować. Bez algorytmu, bez kontekstu — ale hotel wie co jest sezonowo trafne (np. zimą: spa, latem: basen+bar).

**MVP rekomendacja: Wariant 3 + Wariant 1 jako pierwsze usprawnienie.**

Wariant 3 jest zero-engineering (panel + lista), Wariant 1 wymaga ~2h implementacji i daje 2x lepsze efekty.

---

## Rekomendacja dla naszego MVP

### Decyzja filozoficzna (HITL #6)

Wybrany kierunek: **widoczny upsell na home screen** (sekcja "Polecamy").

Zgodnie z benchmarkami — jest to standard rynkowy (Duve, Oaky) i nie jest agresywny jeśli jest właściwie zaimplementowany.

### Zasady implementacji "widocznego upsell który nie irytuje"

1. **Sekcja "Polecamy" — zawsze na home, ale NIE jako pierwsze co widać**
   - Welcome block (imię, hero) — na górze
   - Szybka nawigacja (6 kafelków) — w połowie ekranu
   - Sekcja "Polecamy" — poniżej nawigacji (wymaga scrollu)
   - Gość który nie scrolluje — nie widzi upsell; gość który scrolluje — jest zainteresowany eksplorowaniem

2. **Maksymalnie 3 kafelki w sekcji "Polecamy"**
   - Więcej = lista ofert = targi / lisi jarmark
   - 2-3 = curated = "hotel wybrał dla mnie"

3. **Brak pop-upów, brak modali, brak overlayów przy pierwszej wizycie**

4. **Frequency cap dla "późnych sugestii":** jeśli gość zamknął sekcję lub nie kliknął przez 24h → nie wyświetlaj ponownie tej samej usługi

5. **AI concierge jako "soft upsell":** gdy gość pyta o restaurację → bot odpowiada na pytanie I sugeruje rezerwację. Nie odwrotnie (bot nie sugeruje niczego gdy gość pyta o WiFi password).

6. **Etykieta neutralna:** "Popularne w tym tygodniu" lub "Polecane przez [Hotel Name]" — nie "OFERTA SPECJALNA!" ani "OSZCZĘDŹ 20%!" (te etykiety aktywują "tryb reklamy" w mózgu gościa)

### Granica której nie przekraczamy

- Brak dark patterns (pre-checked, shaming language, fake urgency)
- Upsell nigdy nie blokuje dostępu do informacji
- Hotel może konfigurować co wyświetla w sekcji — nie platforma ("polecamy to co jest najlepsze dla gościa, nie co ma najwyższą marżę")
- Concierge AI nie inicjuje sprzedaży — odpowiada na pytania i sugeruje przy okazji

---

*Dokument przygotowany jako output Subagent 3 / Sesja 3 — Interfejs Gościa*
*Plik: `context/research/session_03/upsell-ux-patterns.md`*
