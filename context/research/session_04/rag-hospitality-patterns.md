# RAG w branży hotelarskiej — wzorce implementacyjne

**Data badania:** 2026-06-25  
**Źródła:** Dokumentacja techniczna HiJiffy, Quicktext, Asksuite, publikacje akademickie 2024–2026, Milvus, Weaviate, NVIDIA, Databricks

---

## 1. Formaty danych wejściowych

### Co hotel musi przygotować

Dane wejściowe dla systemu RAG w hotelu dzielą się na dwie kategorie: **statyczne** (zmieniają się rzadko) i **dynamiczne** (zmieniają się sezonowo lub na bieżąco).

#### Dane statyczne — fundament bazy wiedzy

| Kategoria | Przykłady treści | Zalecany format |
|-----------|-----------------|-----------------|
| FAQ ogólne | godziny check-in/out, polityki anulowania, zwierzęta | Markdown lub plain text |
| Opis obiektu | liczba pokoi, kategorie, udogodnienia | Structured JSON |
| Restauracja i bar | menu, godziny otwarcia, rezerwacje, polityki alergii | JSON + Markdown |
| Spa i wellness | lista zabiegów, cennik, rezerwacje | Markdown |
| Obszar wokół hotelu | atrakcje, transport, odległości | Plain text |
| Polityki hotelu | regulamin, RODO, polityka dzieci | PDF lub Markdown |
| Pakiety i oferty | opis, co zawiera, warunki | Structured JSON |

#### Dane dynamiczne — wymagają regularnej synchronizacji

- **Dostępność i ceny** — integracja z PMS (Property Management System) przez API w czasie rzeczywistym
- **Sezonowe menu** — aktualizacja pliku źródłowego (nie re-index całości)
- **Aktualne promocje** — oddzielny dokument z datą ważności
- **Informacje o zamkniętych/remontowanych udogodnieniach** — plik tymczasowy z priorytetem

### Jak Quicktext i HiJiffy podchodzą do strukturyzacji danych

**Quicktext (rebranded jako Quinta)** — zbiera i strukturyzuje ponad **3 700 punktów danych** na hotel, w tym dane z PMS, booking engine i systemów CRM. Dane są aktualizowane przez API i webhooki. Ich chatbot Velma obsługuje 85% zapytań automatycznie w 36 językach.

**HiJiffy Aplysia 3** (maj 2025) — wprowadza model dwudokumentowy:
- **Company Knowledge Document** — wiedza wspólna dla całej sieci hotelowej (brand, polityki korporacyjne)
- **Property Knowledge Document** — wiedza specyficzna dla konkretnego obiektu (lokalny regulamin, menu, atrakcje w pobliżu)

Każda aktualizacja dokumentów jest natychmiastowo odzwierciedlana w odpowiedziach chatbota — bez ręcznego re-indexingu.

### Rekomendowany format pliku źródłowego (MVP)

Dla hotelowego MVP optymalny jest **hybrydowy format Markdown z metadanymi YAML frontmatter**:

```markdown
---
category: restaurant
subcategory: menu
valid_from: 2026-04-01
valid_until: 2026-09-30
language: pl
property_id: hotel-123
---

# Menu Restauracji — Sezon Letni 2026

## Śniadania (7:00–11:00)
**Śniadanie kontynentalne** — 45 PLN/os.
Świeżo wypieczone pieczywo, sery, wędliny, sezonowe owoce, soki, kawa/herbata.

**Śniadanie à la carte**
- Jajecznica z wędzonym łososiem i kaparami — 38 PLN
- Granola z jogurtem greckim i owocami leśnymi — 28 PLN
```

Metadane YAML umożliwiają **filtrowanie przy retrieval** (nie zwracaj menu zimowego latem) i **automatyczne wygasanie** treści.

---

## 2. Strategie chunkowania dla danych hotelowych

### Podstawowe zasady doboru rozmiaru chunka

Chunkowanie to nie preprocessing — to architektura. Zły dobór strategii może obniżyć recall o **do 9%** względem optymalnego podejścia (Weaviate, 2024).

**Ogólna zasada dla danych hotelowych:** krótkie, tematycznie spójne chunki > długie chunki wielotematyczne.

Gość pytający "czy jest basen?" powinien dostać chunk zawierający tylko informacje o basenie — nie cały opis SPA na 2000 tokenów.

### Rekomendowane strategie według typu treści

#### FAQ — Question-Answer Chunking (najlepsza strategia)

Każda para pytanie-odpowiedź to **osobny chunk**. Pytanie jest dołączane do treści odpowiedzi podczas embeddingu.

```
Chunk:
Q: O której jest check-out?
A: Check-out odbywa się do godziny 12:00. 
   Możliwy late check-out do 14:00 za dopłatą 100 PLN (dostępność zależy od obłożenia).
   
Token count: ~50 tokenów
```

- Rozmiar: 50–150 tokenów na parę Q&A
- Overlap: nie wymagany (każde Q&A jest samodzielne)
- Zaletą: bardzo wysoka precyzja retrieval dla pytań faktycznych

#### Menu restauracji — Item-Level Chunking

Każda pozycja menu = osobny chunk z kontekstem kategorii:

```
Chunk:
[RESTAURACJA | DANIA GŁÓWNE | MIĘSO]
Polędwica wołowa z grilla (250g) — 145 PLN
Serwowana z puree ziemniaczanym i sosem z zielonego pieprzu.
Dostępne: pon–pt 18:00–22:00, sob–nd 17:00–23:00
Alergeny: gluten (sos), laktoza (puree)

Token count: ~80 tokenów
```

- Rozmiar: 50–100 tokenów
- Kontekst kategorii jako prefix — poprawia retrieval o ok. 15%
- Alergeny jako osobne pole metadanych (umożliwia filtrowanie)

#### Opisy pokoi — Attribute-Structured Chunking

Pokoje mają wiele atrybutów. Najlepsza strategia: **jeden chunk na typ pokoju** z pełnym opisem.

```
Chunk:
[POKÓJ | DELUXE DOUBLE | PIĘTRO 3-5]
Powierzchnia: 32 m². Widok na ogród lub parking.
Łóżko: king-size (180x200). Maks. obłożenie: 2+1.
Udogodnienia: klimatyzacja, smart TV 55", mini-bar, bezpieczny sejf,
ekspres do kawy Nespresso, wanna i prysznic.
Cena od: 450 PLN/noc (śniadanie w cenie od 01.06.2026)
Dostępne łącza dla dodatkowego łóżka: tak (250 PLN/noc)

Token count: ~120 tokenów
```

- Rozmiar: 100–200 tokenów na typ pokoju
- Nie dzielić opisu jednego pokoju na wiele chunków

#### Opisy atrakcji okolicy — Semantic Chunking

Długie, narracyjne opisy okolicy to jedyny przypadek, gdzie warto użyć **semantic chunking**:
- Automatyczne wykrywanie granic semantycznych (zmiana tematu)
- Rozmiar: 300–600 tokenów
- Overlap: 50–80 tokenów (zachowanie kontekstu między sekcjami)

#### Polityki i regulaminy — Recursive Character Splitting

Dla długich dokumentów polityk (>2000 tokenów):
- Algorytm: Recursive Character Text Splitting
- Rozmiar chunka: 400–512 tokenów
- Overlap: 10–15% (40–75 tokenów)
- Uwaga: dodaj nagłówek sekcji jako kontekst do każdego chunka

### Technika Contextual Retrieval (Anthropic, 2024)

Dla każdego chunka LLM generuje 1–2 zdania kontekstu opisujące, gdzie chunk pasuje w dokumencie źródłowym. Ten kontekst jest dołączany do chunka przed embeddingiem.

Przykład dla pozycji menu:
```
Kontekst: "Ten fragment opisuje danie główne z menu restauracji hotelowej, 
dostępne podczas kolacji."
[właściwy chunk z opisem dania]
```

Technika poprawia recall o ok. 20–35% kosztem większego compute podczas indeksowania (jednorazowy koszt).

### Podsumowanie rekomendacji chunkowania

| Typ treści | Strategia | Rozmiar (tokeny) | Overlap |
|------------|-----------|-----------------|---------|
| FAQ | Q&A pairs | 50–150 | Brak |
| Menu | Item-level | 50–100 | Brak |
| Pokoje | Attribute-structured | 100–200 | Brak |
| Polityki | Recursive split | 400–512 | 10–15% |
| Okolica/atrakcje | Semantic | 300–600 | 50–80 |

---

## 3. Obsługa aktualizacji danych

### Incremental Update vs Full Re-index

**Full re-index** (przeindeksowanie całej bazy) jest zbędne w 95% przypadków aktualizacji hotelowych. Jest uzasadniony tylko przy:
- Zmianie modelu embeddingowego
- Całkowitej przebudowie struktury dokumentów
- Pierwszym ładowaniu bazy danych

**Incremental update** (aktualizacja przyrostowa) — rekomendowana strategia dla danych hotelowych:

```
Workflow aktualizacji:
1. Zmiana w dokumencie źródłowym (np. nowe menu)
2. Wykrycie zmienionych chunków (hash comparison)
3. Usunięcie starych wektorów z bazy (DELETE by document_id)
4. Re-embedding zmienionych chunków
5. Zapis nowych wektorów (UPSERT)

Czas: sekundy–minuty (nie godziny jak full re-index)
```

### Wzorzec obsługi zmian sezonowych

Problem: Hotel zmienia menu co sezon (wiosna/lato/jesień/zima) lub oferuje specjalne menu świąteczne.

**Rozwiązanie — Document versioning z datami ważności:**

```json
{
  "document_id": "restaurant-menu-summer-2026",
  "valid_from": "2026-04-01",
  "valid_until": "2026-09-30",
  "supersedes": "restaurant-menu-winter-2026",
  "category": "restaurant",
  "property_id": "hotel-123"
}
```

Podczas retrieval: filtruj po `valid_from <= today <= valid_until`. Stare chunki można archiwizować zamiast usuwać (przydatne dla obsługi zapytań o "menu z poprzedniego sezonu").

### Integracja z PMS w czasie rzeczywistym

Dane o dostępności, cenach i statusie rezerwacji **nie powinny być w bazie wektorowej** — są zbyt dynamiczne i wymagają precyzji 100%.

Rekomendowany wzorzec: **Tool Calling / Function Calling**

```
Gość: "Ile kosztuje pokój na weekend 15–17 sierpnia?"
↓
RAG retrieves: [opis pokoi, polityki cenowe, warunki]
LLM: Wywołuje funkcję get_availability(dates, rooms)
PMS API: Zwraca aktualną cenę i dostępność
LLM: Generuje odpowiedź łącząc opis pokoi z aktualną ceną
```

Dane statyczne (opis, udogodnienia) → RAG.  
Dane dynamiczne (cena, dostępność) → API call do PMS.

### Architektura pipeline aktualizacji (produkcja)

```
[Źródło zmiany] 
    → Webhook / Scheduled job
    → Change detection (hash lub timestamp)
    → Document processor
    → Chunk generator
    → Embedding model
    → Vector DB UPSERT
    → Cache invalidation (semantic cache)
```

HiJiffy Aplysia 3 deklaruje **natychmiastową propagację zmian** — edycja dokumentu przez managera hotelu jest widoczna w chatbocie bez opóźnienia.

---

## 4. Latency i UX

### Benchmarki akceptowalności dla chat UX

| Próg latency | Percepcja użytkownika | Konsekwencja UX |
|---|---|---|
| < 200 ms | Natychmiastowe | Idealne |
| 200–500 ms | Szybkie | Akceptowalne |
| 500 ms – 1 s | Zauważalne | Akceptowalne (chat) |
| 1–2 s | Wolne, ale OK | Graniczne dla chatu |
| > 2 s | Frustrujące | Użytkownicy kończą sesję |
| > 3 s | Nieakceptowalne | Wysoki churn |

Dla hotelowego chatbotu tekstowego: **cel = < 1.5 sekundy** (end-to-end od pytania do odpowiedzi).

Dla voice botów hotelowych: **cel = < 200 ms** (naturalna rozmowa).

**Fairatmos na AWS Bedrock** osiągnął **5 sekund** dla RAG bez optymalizacji → za wolne dla chat UX.

### Jak RAG wpływa na czas odpowiedzi

Typowy RAG pipeline bez optymalizacji:

```
Embedding zapytania:   50–100 ms
Vector search:         20–100 ms
Reranking (opcjonalne): 50–200 ms
LLM generation:        800–2000 ms (zależnie od modelu)
─────────────────────────────────
SUMA:                  ~1–2.4 sekundy (bez cache)
```

### Techniki przyspieszania — priorytet dla MVP

#### 1. Semantic Caching (najwyższy ROI)

Semantic cache przechowuje odpowiedzi dla semantycznie podobnych zapytań. Gdy użytkownik pyta "czy hotel ma parking?" a w cache jest odpowiedź na "czy jest miejsca parkingowe?", cache zwraca odpowiedź bezpośrednio.

**Wyniki produkcyjne:**
- Latency z cache: **200–400 ms** (vs 1.2–2.5 s bez cache)
- Hit rate: 30–70% dla hotelowych chatbotów (pytania hotelowe są powtarzalne!)
- Redukcja kosztów LLM: do 95% dla cachowanych zapytań
- Jeden raport podaje **65x redukcję latency** dla cachowanych zapytań

Implementacja z Redis (Vector Search):
```python
# Uproszczony schemat
query_embedding = embed(user_query)
cache_hit = redis.vector_search(query_embedding, threshold=0.92)
if cache_hit:
    return cache_hit.response  # ~10 ms
else:
    response = rag_pipeline(user_query)  # ~1.5 s
    redis.store(query_embedding, response, ttl=3600)
    return response
```

Próg podobieństwa (threshold): 0.90–0.95 — niższy daje więcej hitów ale ryzyko błędnych odpowiedzi.

#### 2. Streaming odpowiedzi (perceived performance)

Zamiast czekać na pełną odpowiedź, streamuj tokeny:
- Użytkownik widzi pierwsze słowa po ~300–500 ms
- Subiektywne odczucie szybkości: znacznie lepsze
- Implementacja: Server-Sent Events lub WebSocket

#### 3. Pre-fetching odpowiedzi

Dla przewidywalnych pytań (check-in, dostępność wifi, parking) — pre-generuj odpowiedzi i trzymaj w cache przy starcie sesji.

#### 4. Lżejszy model dla prostych pytań

Routing zapytań:
- Proste faktualne pytania (FAQ) → mały, szybki model (GPT-4o-mini, Claude Haiku)
- Złożone pytania (planowanie wyjazdu, skargi) → duży model (GPT-4o, Claude Sonnet)

Czas odpowiedzi małych modeli: **300–700 ms** vs 1–2 s dla dużych.

#### 5. Optymalizacja vector search

- **FAISS** (Facebook): najszybszy dla małych baz (<1M wektorów), idealny dla MVP
- **Qdrant**: dobry balans wydajność/funkcje, wspiera filtry podczas wyszukiwania
- **Pinecone**: managed, mniej overhead operacyjny, dobry dla startu
- ANN (Approximate Nearest Neighbor) zamiast exact search: 10x szybszy, <1% spadek jakości

---

## 5. Modele embeddingowe

### Kryteria dla danych hotelowych

Dobre pytania hotelowe to często **krótkie zapytania faktyczne**: "czy jest basen?", "ile kosztuje śniadanie?", "jak daleko jest centrum?".

Embedding model musi:
1. Dobrze obsługiwać krótkie zapytania (< 10 słów)
2. Obsługiwać język polski (i inne języki gości)
3. Mieć dobry semantic recall dla pytań faktycznych
4. Działać z akceptowalną latencją

### Porównanie modeli (2025–2026)

| Model | Wielojęzyczność | Jakość PL | Latency | Koszt | Rekomendacja |
|-------|----------------|-----------|---------|-------|--------------|
| **BGE-M3** (BAAI) | 100+ języków | Dobra | Średnia | Self-hosted | Produkcja multi-lang |
| **text-embedding-3-large** (OpenAI) | Dobra | Dobra | Szybka | API (płatny) | Produkcja, łatwa integracja |
| **Cohere Embed v4** | Znakomita | Bardzo dobra | Szybka | API (płatny) | Wielojęzyczna produkcja |
| **Qwen3-Embedding-8B** | 100+ języków | Bardzo dobra | Wolniejsza | Self-hosted | Nowy lider open-source |
| **all-MiniLM-L6-v2** | EN-only | Słaba | Najszybsza | Darmowy | NIE dla polskich hoteli |
| **Jina v5-small** | Dobra | Dobra | Szybka | API/Self-hosted | MVP z budżetem |

### Rekomendacja dla hoteli polskich / CE Europy

**MVP (szybki start):** `text-embedding-3-small` (OpenAI) — łatwa integracja, dobra jakość PL, niski koszt (~0.02 USD / 1M tokenów).

**Produkcja wielojęzyczna:** `BGE-M3` self-hosted lub `Cohere Embed v4` — Cohere deklaruje 15–20% przewagę nad OpenAI dla nie-łacińskich skryptów.

**Dla sieci hotelowych z wieloma językami:** `Qwen3-Embedding-8B` — obsługuje 100+ języków, 32K token context window, silna alternatywa open-source.

### Hybrid Search — dlaczego warto

Dla krótkich pytań hotelowych ("basen", "parking", "wifi") **sparse retrieval (BM25/TF-IDF) + dense retrieval (embeddings)** działa lepiej niż samo semantic search:

- BM25 łapie **exact keyword matches** ("basen olimpijski" → chunk zawierający dokładnie te słowa)
- Embeddings łapią **semantic meaning** ("miejsce do pływania" → chunk o basenie)
- Hybryd łączy oba podejścia: lepszy recall, lepsza precyzja

BGE-M3 wspiera hybrid retrieval natywnie (dense + sparse + multi-vector w jednym modelu).

---

## 6. Rekomendacje dla MVP

### Architektura MVPhotelowego chatbotu RAG

```
[Guest Input]
      ↓
[Semantic Cache Check] ──hit──→ [Cached Response] → Guest
      ↓ miss
[Query Embedding] (text-embedding-3-small)
      ↓
[Hybrid Vector Search] (Qdrant / FAISS)
  - Filter: property_id, valid dates, language
  - Top-K: 5 chunków
      ↓
[Optional Reranker] (tylko produkcja, nie MVP)
      ↓
[Context Assembly]
  + Static chunks (FAQ, menu, amenities)
  + Dynamic data (PMS API call jeśli potrzebne)
      ↓
[LLM Generation] (GPT-4o-mini dla prostych, GPT-4o dla złożonych)
      ↓
[Streaming Response] → Guest
      ↓
[Cache Store] (jeśli odpowiedź cacheable)
```

### Priorytety implementacyjne

#### Faza 1 — Fundament (tydzień 1–2)

1. **Przygotowanie bazy wiedzy** — priorytety treści:
   - FAQ (25–50 par Q&A) → najwyższy ROI
   - Opis pokoi (każdy typ oddzielnie)
   - Menu restauracji (sezonowe)
   - Polityki (check-in/out, anulacje, zwierzęta)
   
2. **Strategia chunkowania:**
   - Q&A chunking dla FAQ
   - Item-level dla menu
   - Attribute-structured dla pokoi
   - Metadata YAML dla każdego dokumentu (valid_from/until, category, property_id)

3. **Stack technologiczny minimum viable:**
   - Vector DB: Qdrant (self-hosted) lub Pinecone (managed)
   - Embedding: `text-embedding-3-small` OpenAI
   - LLM: GPT-4o-mini (szybki, tani, dobra jakość)
   - Cache: Redis z Vector Search

#### Faza 2 — Optymalizacja (tydzień 3–4)

4. **Semantic caching** — największy wpływ na latency i koszty
5. **Streaming responses** — poprawa perceived performance
6. **Integracja PMS** przez function calling (ceny, dostępność)
7. **Incremental update pipeline** — webhook przy zmianie dokumentu

#### Faza 3 — Produkcja (tydzień 5+)

8. **Hybrid search** (BM25 + embeddings)
9. **Monitoring & evaluation** — mierz precision@5, recall, latency P95
10. **Multilingual support** — upgrade do BGE-M3 lub Cohere Embed v4

### Czego unikać w MVP

- **Pełnego re-indexu przy każdej zmianie** — używaj incremental updates
- **Zbyt dużych chunków** (>512 tokenów) dla FAQ/menu — precyzja spada
- **Braku filtrowania metadanych** — stare/nieaktualne treści psują doświadczenie
- **Braku semantic cache** — 30–70% zapytań hotelowych jest powtarzalnych
- **Jednego modelu dla wszystkich zapytań** — routing małe/duże modele redukuje koszty
- **Brakujące metadane języka** — goście pytają po angielsku, niemiecku, rosyjsku

### Mierniki sukcesu dla MVP

| Metryka | Cel MVP | Cel produkcja |
|---------|---------|---------------|
| Czas odpowiedzi (P50) | < 2 s | < 1 s |
| Czas odpowiedzi (P95) | < 4 s | < 2 s |
| % zapytań obsłużonych bez human handoff | > 70% | > 85% |
| Semantic cache hit rate | > 30% | > 50% |
| Precision@5 (relevant chunks retrieved) | > 0.75 | > 0.85 |

---

## Referencje i źródła

- HiJiffy Aplysia 3 launch: https://www.hijiffy.com/news/hijiffy-launches-a-new-type-of-hotel-chatbot
- HiJiffy wyjaśnienie RAG: https://www.hijiffy.com/resources/articles/explained-retrieval-augmented-generation-rag
- Quicktext / Quinta platforma: https://www.quinta.im/
- Asksuite wyniki i platforma: https://asksuite.com/
- NVIDIA chunking benchmarks: https://developer.nvidia.com/blog/finding-the-best-chunking-strategy-for-accurate-ai-responses/
- Weaviate chunking strategies: https://weaviate.io/blog/chunking-strategies-for-rag
- Semantic caching latency benchmarks: https://brain.co/blog/semantic-caching-accelerating-beyond-basic-rag
- Embedding model comparison 2026: https://knowledgesdk.com/blog/embedding-model-comparison-2026
- RAG incremental updates: https://dasroot.net/posts/2026/01/incremental-updates-rag-dynamic-documents/
- Milvus RAG latency reference: https://milvus.io/ai-quick-reference/what-is-an-acceptable-latency-for-a-rag-system-in-an-interactive-setting-eg-a-chatbot-and-how-do-we-ensure-both-retrieval-and-generation-phases-meet-this-target
- RAG-based hotel chatbot case study: https://jurnal.itscience.org/index.php/ijmdsa/article/view/7927
- Smart tourism RAG chatbot (Taiwan): https://arxiv.org/html/2509.21367
- Ailog MTEB scores 2025: https://app.ailog.fr/en/blog/guides/choosing-embedding-models
