# Szacunek kosztów operacyjnych LLM — AI Concierge Hotelowy

**Data:** 2026-06-25
**Autor:** Badanie automatyczne (Claude Code)

---

## 1. Założenia scenariusza bazowego

| Parametr | Wartość |
|---|---|
| Liczba hoteli | 100 |
| Aktywnych gości / hotel / dzień | 50 |
| Wiadomości / sesja gościa | 5 |
| Wiadomości dziennie | 25 000 |
| Wiadomości miesięcznie | 750 000 |

### Budżet tokenów na wiadomość

| Scenariusz | Input (tokeny) | Output (tokeny) | Razem |
|---|---|---|---|
| Bez RAG | 200 | 150 | 350 |
| Z RAG (+1500 kontekst) | 1 700 | 150 | 1 850 |

---

## 2. Porównanie cen modeli (czerwiec 2026)

| Model | Input ($/1M tokenów) | Output ($/1M tokenów) | Uwagi |
|---|---|---|---|
| **Claude Haiku 4.5** | $1,00 | $5,00 | Aktywny |
| **GPT-4o-mini** | $0,15 | $0,60 | Aktywny |
| **Gemini 2.0 Flash** | $0,10 | $0,40 | **WYCOFANY 1.06.2026** |
| **Gemini 2.5 Flash-Lite** | $0,10 | $0,40 | Zamiennik dla 2.0 Flash (ta sama cena) |

> **Uwaga:** Gemini 2.0 Flash zostal wycofany 1 czerwca 2026. Jako bezposredni zamiennik stosuje sie **Gemini 2.5 Flash-Lite** w identycznej cenie. Dalej w raporcie zamiast "Gemini 2.0 Flash" stosowane jest oznaczenie "Gemini 2.5 Flash-Lite".

**Zrodla:**
- [Anthropic Pricing](https://platform.claude.com/docs/en/about-claude/pricing) — Claude Haiku 4.5: $1,00/$5,00 / 1M tokenow
- [OpenAI API Pricing](https://openai.com/api/pricing/) — GPT-4o-mini: $0,15/$0,60 / 1M tokenow
- [Google Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing) — Gemini 2.5 Flash-Lite: $0,10/$0,40 / 1M tokenow

---

## 3. Koszt per 1 000 wiadomosci

### 3a. Bez RAG (200 input + 150 output tokenow)

| Model | Koszt input | Koszt output | **Razem / 1 000 msg** |
|---|---|---|---|
| Claude Haiku 4.5 | $0,20 | $0,75 | **$0,95** |
| GPT-4o-mini | $0,03 | $0,09 | **$0,12** |
| Gemini 2.5 Flash-Lite | $0,02 | $0,06 | **$0,08** |

> Obliczenia: 200 000 tokenow input × cena/1M + 150 000 tokenow output × cena/1M

### 3b. Z RAG (1 700 input + 150 output tokenow)

| Model | Koszt input | Koszt output | **Razem / 1 000 msg** |
|---|---|---|---|
| Claude Haiku 4.5 | $1,70 | $0,75 | **$2,45** |
| GPT-4o-mini | $0,255 | $0,09 | **$0,345** |
| Gemini 2.5 Flash-Lite | $0,17 | $0,06 | **$0,23** |

---

## 4. Koszty miesieczne — 100 hoteli (750 000 msg/miesiac)

### 4a. Bez RAG

| Model | Koszt input (150M tok.) | Koszt output (112,5M tok.) | **Razem / miesiac** |
|---|---|---|---|
| Claude Haiku 4.5 | $150,00 | $562,50 | **$712,50** |
| GPT-4o-mini | $22,50 | $67,50 | **$90,00** |
| Gemini 2.5 Flash-Lite | $15,00 | $45,00 | **$60,00** |

### 4b. Z RAG

| Model | Koszt input (1 275M tok.) | Koszt output (112,5M tok.) | **Razem / miesiac** |
|---|---|---|---|
| Claude Haiku 4.5 | $1 275,00 | $562,50 | **$1 837,50** |
| GPT-4o-mini | $191,25 | $67,50 | **$258,75** |
| Gemini 2.5 Flash-Lite | $127,50 | $45,00 | **$172,50** |

---

## 5. Skalowanie — koszty miesieczne z RAG

| Skala | Wiadomosci / miesiac | Claude Haiku 4.5 | GPT-4o-mini | Gemini 2.5 Flash-Lite |
|---|---|---|---|---|
| 100 hoteli (baseline) | 750 000 | $1 837,50 | $258,75 | $172,50 |
| 500 hoteli (5×) | 3 750 000 | $9 187,50 | $1 293,75 | $862,50 |
| 1 000 hoteli (10×) | 7 500 000 | $18 375,00 | $2 587,50 | $1 725,00 |

### Koszt AI na hotel / miesiac (przy 100 hotelach, z RAG)

| Model | Koszt / hotel / miesiac |
|---|---|
| Claude Haiku 4.5 | $18,38 |
| GPT-4o-mini | $2,59 |
| Gemini 2.5 Flash-Lite | $1,73 |

---

## 6. Prompt Caching — analiza

### Claude Haiku 4.5 — caching

| Parametr | Wartosc |
|---|---|
| Minimalny prefix do zbuforowania | **4 096 tokenow** |
| Koszt zapisu do cache (write) | $1,25 / 1M tokenow (+25% vs standard) |
| Koszt odczytu z cache (read) | $0,10 / 1M tokenow (−90% vs standard) |
| TTL cache | ~5 minut |

**Kluczowa uwaga dla scenariusza RAG:**
W domyslnym scenariuszu RAG mamy 1 700 tokenow wejscia (200 bazowych + 1 500 kontekstu). To **ponizej progu 4 096 tokenow** wymaganego do buforowania. Caching w tej konfiguracji **nie zadziala**.

**Kiedy caching dziala:**
- Jezeli statyczny prompt systemowy (informacje o hotelu) ma **4 096+ tokenow**
- Jesli ladujemy caly knowledge base hotelu jako staly prefix (np. 6 000–8 000 tokenow)
- W takiej konfiguracji tylko dynamiczna czesc (pytanie goscia) placi pelna cene

**Przyklad scenariusza z cachingiem (5 000-tokenowy system prompt):**

| Typ kosztu | Bez cachingu | Z cachingiem (odczyt) | Oszczednosc |
|---|---|---|---|
| 5 000 tok. statyczny system prompt / 1 000 msg | $5,00 | $0,50 | −90% |
| 200 tok. dynamiczne (pytanie) / 1 000 msg | $0,20 | $0,20 | — |
| 150 tok. output / 1 000 msg | $0,75 | $0,75 | — |
| **Razem / 1 000 msg** | **$5,95** | **$1,45** | **−76%** |

Przy 750 000 msg/miesiac i gorącym cache: $1 087,50/mies. zamiast $4 462,50/mies.

**Warunek konieczny:** wysoki wskaznik trafien w cache. Przy srednim ruchu 1 goscia/6 min na hotel (rozlozonym na 100 hoteli), cache moze wygasac miedzy zapytaniami. Cache jest bardziej efektywny dla hoteli z duzym, stloczonym ruchem.

### GPT-4o-mini — caching

- Minimalny prefix: **1 024 tokeny** (o wiele nizszy prog niz Haiku!)
- Koszt odczytu: **50% rabatu** (vs 90% u Anthropic)
- Przy RAG z 1 700 tokenami: caching **jest mozliwy** dla statycznej czesci systemu

GPT-4o-mini z cachingiem (~1 200 tok. statycznego kontekstu):

| Scenariusz | Koszt / 1 000 msg |
|---|---|
| Bez cachingu | $0,345 |
| Z cachingiem (50% na 1 200 tok.) | ok. $0,27 |

### Gemini 2.5 Flash-Lite — caching

- Google oferuje buforowanie kontekstu (Context Caching) od 32 768 tokenow dla modeli Flash
- Dla malych scenariuszy (1 700 tok.) caching nie jest dostepny
- Cena bazowa pozostaje najtansza, wiec brak cachingu jest mniej problematyczny

---

## 7. Alternatywne strategie obniżenia kosztow

### 7a. Batch API (przetwarzanie asynchroniczne)
- Anthropic Batch API: **−50%** (input i output) dla nieinteraktywnych zadan
- OpenAI Batch API: **−50%** dla zadan asynchronicznych
- **Ograniczenie:** Niedostepne dla real-time chatu z gosciem. Moze byc uzyte do: generowania raportow, analizy danych, przygotowania embeddingow.

### 7b. Zmniejszenie RAG context window
- Zamiast 1 500 tokenow kontekstu, optymalizacja chunking → 500–800 tokenow
- Redukcja kosztu/wiadomosc z RAG o ~40–50%
- Wymaga staranniejszego chunking i embeddings

| Scenariusz | Input tokeny | Koszt / 1 000 msg (Haiku) | vs pelny RAG |
|---|---|---|---|
| RAG 500 tok. | 700 | $0,70 | −71% |
| RAG 800 tok. | 1 000 | $1,00 | −59% |
| RAG 1 500 tok. (standard) | 1 700 | $2,45 | — |

### 7c. Tiered model approach
- Proste pytania ("Jaki jest numer WiFi?", "Kiedy jest sniadanie?"): Gemini 2.5 Flash-Lite / GPT-4o-mini
- Zlozoney pytania (reklamacje, specjalne prosby): Claude Haiku 4.5 lub Sonnet
- Estymowana dystrybucja: 70% proste / 30% zlozoone
- Szacowana oszczednosc: 20–35% vs jednolity model

### 7d. Cache warstwy aplikacyjnej
- Buforowanie odpowiedzi na identyczne lub bardzo podobne pytania (semantic caching)
- Np. z Redis + embeddings similarity threshold
- Duze hotele: do 20–30% zapytan moze byc powtarzalnych (godziny, uslugi, lokalizacja)

### 7e. Fine-tuning na danych hotelowych
- OpenAI fine-tuning GPT-4o-mini: $0,30 / 1M tokenow treningowych
- Po fine-tuningu: $0,30/$1,20 / 1M (drożej per token!)
- Opłaca się tylko jeśli fine-tuning skraca długość promptow o więcej niż 2×
- **Rekomendacja dla MVP:** Nie implementowac — za duzo narzutu operacyjnego

### 7f. Hybrydowy RAG + pre-cached knowledge base
- Pre-zaladowanie pelnego hotel knowledge base jako cached system prompt (4 096+ tokenow)
- Dynamic retrieval tylko dla bardzo specyficznych pytan
- Eliminacja kosztow wektorowej bazy danych dla rutynowych zapytan

---

## 8. Margin cenowy — AI koszt w subskrypcji hotelowej

### Typowe ceny SaaS dla hoteli (konkurencja)
- Basic hotel tech tools: $100–$300/hotel/miesiac
- Zaawansowane systemy (PMS integracje, AI): $300–$700/hotel/miesiac
- Przyjety cel cenowy dla MVP: **$200–400/hotel/miesiac**

### Udział kosztów AI

| Model | Koszt AI / hotel / mies. (100 hoteli, RAG) | % z pakietu $250 | % z pakietu $400 |
|---|---|---|---|
| Claude Haiku 4.5 | $18,38 | 7,4% | 4,6% |
| GPT-4o-mini | $2,59 | 1,0% | 0,6% |
| Gemini 2.5 Flash-Lite | $1,73 | 0,7% | 0,4% |

### Zalecany margin na koszty AI

- Mnoznik min. **3× do 5×** ponad faktyczne koszty LLM (pokrycie: over-provisioning, bledy tokenow, wzrost ruchu)
- Koszt AI powinien stanowic **max 10–15%** calosci kosztow uslugi (reszta: infrastruktura, support, rozwoj)
- Przy $18,38/hotel (Haiku) lub $2,59/hotel (GPT-4o-mini): oba modele sa w pelni absorbowalne przy cenie $250+/hotel/mies.

---

## 9. Rekomendacja dla MVP

### Wybor modelu

**Rekomendacja MVP: GPT-4o-mini**

| Kryterium | Claude Haiku 4.5 | GPT-4o-mini | Gemini 2.5 Flash-Lite |
|---|---|---|---|
| Koszt / mies. z RAG (100 hoteli) | $1 837,50 | **$258,75** | $172,50 |
| Koszt wzgledny | 10,6× | **1,5×** | 1,0× |
| Prompt caching (min. prefix) | 4 096 tok. | **1 024 tok.** | 32 768 tok. |
| Jakosć dla hoteli | Doskonala | **Bardzo dobra** | Dobra |
| Dojrzałosc API / ekosystem | Wysoka | **Wysoka** | Srednia |
| Stabilnosc modelu | Wysoka | **Wysoka** | Ryzyko deprecacji |
| Rekomendacja | Nie dla MVP | **TAK** | Alternatywa |

**Uzasadnienie wyboru GPT-4o-mini:**
1. Koszt 7× nizszy niz Claude Haiku 4.5 przy podobnej jakosci dla hotel concierge use-case
2. Niski prog cachingu (1 024 tokenow) vs Haiku (4 096) — mozliwosc cachowania juz przy standardowych promptach
3. Dojrzaly ekosystem, dobra dokumentacja, wysoka niezawodnosc
4. W pelni absorbowalne koszty ($2,59/hotel/mies.) przy standardowej cenie SaaS

### Sciezka ewolucji po MVP

```
MVP (0-6 mies.): GPT-4o-mini — niski koszt, szybkie wdrozenie
                 ↓
Wzrost (6-18 mies.): Ocena jakosci → jezeli potrzeba wyzszej jakosci
                     → migracja do Claude Haiku 4.5 lub Sonnet
                 ↓
Skala (18+ mies.): Tiered approach — GPT-4o-mini / Haiku + prompt caching
                   + zoptymalizowany RAG (≤800 tokenow kontekstu)
```

### Priorytety optymalizacji kosztow (po MVP)

1. **Zmniejszenie RAG context do 500–800 tokenow** — najszybsza oszczednosc (−40–50%)
2. **Semantic cache warstwy aplikacyjnej** — oszczednosc 20–30% na popularnych pytaniach
3. **Prompt caching dla statycznych czesci** — gdy system prompt > 1 024 tokenow (GPT) / 4 096 (Claude)
4. **Tiered routing** — dopiero gdy jakosc GPT-4o-mini okazuje sie niewystarczajaca dla zlozonych pytan

---

## 10. Podsumowanie liczbowe

| Metryka | Claude Haiku 4.5 | GPT-4o-mini | Gemini 2.5 Flash-Lite |
|---|---|---|---|
| **Cena input** | $1,00/1M | $0,15/1M | $0,10/1M |
| **Cena output** | $5,00/1M | $0,60/1M | $0,40/1M |
| **Koszt / 1 000 msg bez RAG** | $0,95 | $0,12 | $0,08 |
| **Koszt / 1 000 msg z RAG** | $2,45 | $0,345 | $0,23 |
| **Koszt / mies. bez RAG (100 h.)** | $712,50 | $90,00 | $60,00 |
| **Koszt / mies. z RAG (100 h.)** | $1 837,50 | $258,75 | $172,50 |
| **Koszt / mies. z RAG (500 h.)** | $9 187,50 | $1 293,75 | $862,50 |
| **Koszt / mies. z RAG (1 000 h.)** | $18 375,00 | $2 587,50 | $1 725,00 |
| **Koszt AI / hotel / mies. (100 h.)** | $18,38 | $2,59 | $1,73 |
| **Min. prefix dla cachingu** | 4 096 tok. | 1 024 tok. | 32 768 tok. |
| **Oszczednosc z cachingu (input)** | −90% | −50% | −75% |
| **Rekomendacja MVP** | Nie | **TAK** | Alternatywa |
