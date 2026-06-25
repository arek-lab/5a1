# Roadmap implementacji — AI Concierge (MVP)

*Fragment syntezy implementation roadmap. Źródła: decisions_log.md (HITL #7, #8, #9, #12; Sesja 4; Sesja 6 — sekcja "AI Concierge — Prompt Injection na MVP" i "Stack ostateczny"; Decyzje tech stack T3), research/session_04/{rag-hospitality-patterns, ai-concierge-market, llm-cost-estimation}.md, research/session_06/pwa-techstack-2026.md.*

---

## Założenia HITL (obowiązujące, niepodlegające reinterpretacji w implementacji)

| HITL | Decyzja | Konsekwencja implementacyjna |
|---|---|---|
| **#12** (Sesja 6) | **Prompt injection na MVP, NIE RAG.** Cała baza wiedzy hotelu (5–10K tokenów) wstrzykiwana bezpośrednio w kontekst GPT-4o-mini (128K ctx). pgvector w Supabase = ścieżka upgradu. Zero Qdrant/Pinecone/FAISS na MVP. | Brak vector DB, brak embeddings, brak pipeline retrieval na MVP. Cała KB w system promptcie. |
| **T3** (synteza) | GPT-4o-mini + prompt injection; Upstash Redis semantic cache; pgvector jako ścieżka upgradu. | Stack AI zamknięty — brak alternatyw do oceny w trakcie implementacji. |
| **#7** (Sesja 4) | Concierge **tylko informuje i sugeruje** — gość sam składa zamówienie w UI. Brak integracji akcji. | AI nie wywołuje function calling do silnika zamówień. Może odsyłać do konkretnego kafelka/usługi, ale nie tworzy zamówienia. |
| **#8** (Sesja 4) | **Zawsze transparentny** — EU AI Act. Wzmianka "wirtualny asystent" obowiązkowa; hotel może nadać imię botowi. | UI i pierwszy komunikat muszą jawnie informować o AI. Imię bota = pole konfiguracyjne, nie zastępuje disclosure. |
| **#9** (Sesja 4) | **Hotel = właściciel treści** (odpowiada za poprawność KB); **platforma = operator** (uptime, delivery). Wyłączenie odpowiedzialności platformy za błędy z niepoprawnych danych hotelu — w umowie. | KB jest własnością hotelu i edytowalna przez hotel. Platforma loguje, ale nie weryfikuje merytorycznie treści. |
| **#1 / #11** (Sesja 1/5) | Provider LLM (OpenAI/Anthropic) = **sub-procesor → DPA wymagane**. Logowanie konwersacji powiązane z `session_id` (opaque UUID), nie z PII. | Brak PII w promptach do OpenAI. `session_id` jako jedyny identyfikator w logach. DPA z OpenAI przed pierwszym wdrożeniem. |

> **Krytyczne rozróżnienie architektoniczne:** Materiał Sesji 4 (RAG, chunking per typ treści, embeddings, hybrid search, Contextual Retrieval) opisuje **ścieżkę upgradu (post-MVP, sekcja 5)** — **NIE architekturę MVP**. Architektura MVP to prompt injection (sekcja 1). Developer implementuje wyłącznie sekcje 1–4 i 6. Sekcja 5 to udokumentowany plan na przyszłość, poza scope MVP.

---

## 1. Architektura AI MVP — Prompt Injection

### 1.1 Wzorzec kompozycji kontekstu

Pełny payload do modelu na każde zapytanie gościa (HITL #12, Sesja 6 "Stack ostateczny"):

```
[SYSTEM PROMPT]              ← stały, platformowy (rola, zasady, fallback, disclosure AI)
+ [HOTEL KNOWLEDGE BASE]     ← Markdown złożony z Q&A + menu + polityk + okolicy (per property_id)
+ [CONVERSATION]             ← historia tury (max N ostatnich wiadomości) + bieżące pytanie gościa
```

- Budżet KB małego hotelu: **50–100 Q&A + menu + polityki ≈ 5–10K tokenów** — mieści się z zapasem w 128K ctx GPT-4o-mini.
- **Brak** retrieval, embeddingu zapytania, vector search. Model widzi całą KB i sam lokalizuje odpowiedź.
- Konwersacja: utrzymuj okno ostatnich wiadomości (np. ostatnie 6–10 tur); nie wysyłaj całej długiej historii — KB dominuje budżet, a okno chroni latencję i koszt.

### 1.2 Format danych wejściowych hotelu — Markdown + YAML frontmatter

Model dwudokumentowy (wzorzec HiJiffy Aplysia 3, Sesja 4):

- **Company Knowledge** — globalne polityki platformy (wspólne dla wszystkich hoteli: transparentność AI, zakres działania, ton). Zarządzane przez platformę.
- **Property Knowledge** — wiedza specyficzna hotelu (Q&A, menu, polityki, okolica). Edytowana przez hotel w panelu (moduł 3 z Sesji 2).

Każdy dokument źródłowy w formacie Markdown z metadanymi YAML frontmatter:

```markdown
---
category: restaurant        # restaurant | services | policies | local | faq
valid_from: 2026-04-01
valid_until: 2026-09-30
property_id: hotel-123
language: pl
---

# Menu Restauracji — Sezon Letni 2026
## Śniadania (7:00–11:00)
**Śniadanie kontynentalne** — 45 PLN/os.
```

- **Filtrowanie po metadanych przy kompozycji KB** (nie przy retrieval — retrieval nie istnieje na MVP): podczas składania KB pomijaj dokumenty, gdzie `valid_from <= today <= valid_until` jest fałszem, oraz dopasuj `property_id`. To eliminuje nieaktualne treści sezonowe z kontekstu modelu.
- `language: pl` — KB po polsku wystarcza; LLM tłumaczy odpowiedź na język gościa natywnie (sekcja 3.5).

### 1.3 Pipeline kompozycji KB

```
[Panel Q&A hotelu]                          ← hotel edytuje / platforma seeduje ze strony www
      ↓ (zapis rekordu w DB)
[Kompozytor KB]                             ← składa dokumenty Markdown w jeden blok per property_id
   - filtr: property_id + valid_from/until
   - kolejność: FAQ → usługi/ceny → menu → polityki → okolica
   - oblicz hash złożonej KB
      ↓
[Cache KB w pamięci / Redis]                ← klucz: property_id; invalidacja przy zmianie hasha
      ↓
[Wstrzyknięcie w SYSTEM PROMPT]             ← na każde zapytanie gościa danego hotelu
```

- **MUST**: kompozytor KB składa rekordy z panelu w pojedynczy blok Markdown per `property_id`.
- **MUST**: hash złożonej KB przeliczany przy każdej edycji → natychmiastowa propagacja bez re-indeksu (brak indeksu do przebudowy — to zaleta prompt injection; patrz sekcja 4).
- **SHOULD**: cache skomponowanej KB (Upstash Redis lub pamięć procesu) z invalidacją po zmianie hasha — eliminuje rekompozycję przy każdym zapytaniu.

### 1.4 Semantic cache (Upstash Redis)

- Wzorzec: **hash pytania → cached odpowiedź**; hit rate **30–70%** (pytania hotelowe są powtarzalne — Sesja 4).
- Lookup przed wywołaniem GPT-4o-mini; przy hicie odpowiedź zwracana bez wywołania modelu (latencja ~10–400 ms vs 1,2–2,5 s).
- Próg podobieństwa: 0,90–0,95 (niższy = więcej hitów, ale ryzyko błędnej odpowiedzi).
- TTL: ograniczony (np. 1 h) + **invalidacja cache przy zmianie KB hotelu** (zmiana hasha KB → flush wpisów danego `property_id`), inaczej cache serwuje nieaktualne treści po edycji.
- Infrastruktura: Upstash Redis serverless, EU region (Sesja 6) — ta sama instancja co rate limiting.

### 1.5 Streaming i latencja

- **MUST**: streaming odpowiedzi przez **SSE** (Next.js Route Handler, `runtime = "nodejs"`, `dynamic = "force-dynamic"` — Sesja 6). Edge Functions wykluczone (limit CPU 2 s zabija semantic cache + streaming).
- **Cel latencji: < 1,5 s end-to-end** (Sesja 4/6). Streaming poprawia perceived performance (pierwsze tokeny po ~300–500 ms).
- Alert jeśli latencja > 5 s end-to-end (sekcja 6).

---

## 2. Schemat integracji stosu AI (T3 / HITL #12)

| Komponent | Wybór | Parametr / uwaga implementacyjna |
|---|---|---|
| Model | **GPT-4o-mini** | $0,15/1M input, $0,60/1M output; ~$2,59/hotel/mies. przy 100 hotelach; jakość wystarczająca dla concierge FAQ. |
| Prompt caching | OpenAI prompt caching | Próg **1024 tokenów** — KB hotelu (5–10K tok.) jako stały prefix kwalifikuje się; ~50% rabatu na część cachowaną. Statyczny prefix = SYSTEM PROMPT + KB; dynamiczne = pytanie gościa. |
| Semantic cache | **Upstash Redis** | hash pytania → odpowiedź; 30–70% hit (sekcja 1.4). |
| Transport | **SSE** (Next.js Route Handler, nodejs) | streaming; brak Edge Functions; serwer persystentny (Railway → Fly.io). |
| Confidence / fallback | heurystyka — **DO ZWERYFIKOWANIA** | patrz niżej. |
| Logowanie | powiązane z `session_id` (opaque UUID) | brak PII w logach i promptach; provider = sub-procesor (DPA). |

### 2.1 Confidence / heurystyka fallback — punkt do weryfikacji implementacyjnej

> **OTWARTA KWESTIA TECHNICZNA (Sesja 7, otwarte pytania):** Zweryfikować, czy GPT-4o-mini zwraca użyteczne `logprobs` dla oceny pewności. Jeśli nie / niepewne — zastosować **własną heurystykę**:
> - sygnał: długość/treść odpowiedzi (bardzo krótka lub zawierająca frazy niepewności),
> - **fallback flag**: instrukcja w system promptcie, by model zwracał ustrukturyzowany znacznik (np. `[FALLBACK]` lub pole w odpowiedzi), gdy nie znajduje odpowiedzi w KB — wtedy aplikacja przełącza na komunikat fallback (sekcja 3).
>
> **MUST** dla MVP: mechanizm fallback działa niezależnie od dostępności `logprobs` — fallback flag z system promptu jest podstawowym sygnałem; logprobs/heurystyka długości = uzupełnienie. Rekomendacja: zacząć od fallback flag (deterministyczne, sterowane promptem), dodać heurystykę jako wzmocnienie.

### 2.2 Logowanie konwersacji (RODO)

- **MUST**: treść konwersacji powiązana wyłącznie z `session_id` (opaque UUID) — nie z imieniem/pokojem/emailem gościa.
- **MUST**: brak PII w promptach wysyłanych do OpenAI (decyzja architektoniczna z Sesji 5 — CJEU IX 2025: UUID może być nieosobowe dla sub-procesora LLM przy braku klucza mapowania i braku PII w prompcie; udokumentować).
- Manager hotelu widzi agregaty: najczęstsze pytania, fallback rate, unanswered queries — **nie** treść per gość.
- **MUST**: DPA z OpenAI jako sub-procesorem przed pierwszym wdrożeniem (Sesja 1/5).
- Tabela `knowledge_chunks` jest objęta RLS po `property_id` (Sesja 6) — nazwa historyczna z czasów planu RAG; na MVP przechowuje dokumenty KB / złożoną KB hotelu.

---

## 3. Zakres wiedzy concierge na MVP i fallback

### 3.1 Co AI obsługuje (MUST)

70–85% zapytań gości to FAQ — najwyższy ROI (Sesja 4):

- Oferta hotelu (usługi, ceny) i godziny wszystkich punktów.
- FAQ (check-in/out, WiFi, parking, polityki, zwierzęta).
- Informacje o okolicy (atrakcje, transport, odległości).

### 3.2 Czego AI NIE obsługuje — bezpośredni routing do recepcji (MUST)

- Booking / zmiany rezerwacji.
- Reklamacje i skargi → **natychmiastowy routing**, AI nie próbuje odpowiadać (zbyt ryzykowne — wzorzec Quicktext/Quinta).
- Pilne sytuacje → natychmiastowy routing.
- Wykonywanie akcji (zamówienia) — HITL #7: AI sugeruje usługę i odsyła do UI; gość składa zamówienie sam.

### 3.3 Mechanizm fallback (MUST)

```
Gość: [pytanie]
   ↓
AI: [próba odpowiedzi z KB]
   ↓
[Fallback check: fallback flag / confidence (sekcja 2.1)]
   ✓ wystarczająca pewność → odpowiedź AI (streaming)
   ✗ poniżej progu / [FALLBACK] → komunikat + KONKRETNY kontakt recepcji
```

Zasady fallback (Sesja 4):
- **MUST**: fallback zawiera **konkretny kontakt recepcji** — przycisk "Połącz z recepcją" + numer telefonu hotelu. Nigdy nie zostawiać gościa z "nie wiem".
- **MUST**: **3 nieudane próby AI → automatyczna eskalacja** do recepcji (wzorzec HiJiffy), z zachowaniem kontekstu konwersacji.
- **MUST**: skargi / pilne → natychmiastowy routing (bez próby odpowiedzi).
- Komunikat wzorcowy: *"To wykracza poza to, co mogę sprawdzić. Połączę Cię z recepcją — [przycisk] lub zadzwoń: +48 XXX XXX XXX"*.

### 3.4 Transparentność AI (MUST — HITL #8, EU AI Act)

- Pierwszy komunikat / nagłówek czatu jawnie informuje: gość rozmawia z **wirtualnym asystentem** (AI).
- Imię bota (opcjonalne, z panelu) **nie zastępuje** disclosure — np. "Cześć, jestem Sofia, wirtualny asystent hotelu X".
- Disclosure jest obowiązkowy niezależnie od konfiguracji hotelu.

### 3.5 Wielojęzyczność (SHOULD)

- Natywna w LLM (GPT-4o-mini): gość pisze po polsku → odpowiedź po polsku; po angielsku → po angielsku. Bez osobnych baz wiedzy per język.
- KB po polsku wystarcza na MVP — model tłumaczy do języka zapytania.
- **COULD**: ręczny override kluczowych fraz (nazwy usług, lokalne pojęcia podatne na błędne tłumaczenie).

### 3.6 Tone of voice

- **MUST**: domyślnie neutralny, ciepły, pomocny — bez wymyślonej osobowości.
- **SHOULD**: opcja nadania imienia bota w panelu (np. "Sofia", "Max") — ważne dla premium hoteli.
- **MUST (HITL #6, Sesja 3)**: AI sugeruje usługi przy okazji odpowiedzi, **nie inicjuje** sprzedaży.

---

## 4. Co hotel musi dostarczyć i w jakiej formie

Wejście do KB pochodzi z panelu hotelowego (moduł 3 "Baza wiedzy AI concierge", Sesja 2):

| Element | Forma | Priorytet | Uwaga |
|---|---|---|---|
| Lista Q&A (FAQ) | pary Q&A w panelu | **MUST** | Seedowane przez platformę ze strony www hotelu; hotel edytuje. 70–85% zapytań to FAQ. |
| Menu (restauracja/bar) | pozycje z ceną w panelu | **MUST** | Z metadanymi sezonowymi (`valid_from/until`). |
| Polityki | tekst w panelu | **MUST** | check-in/out, anulacje, zwierzęta, RODO. |
| Info o okolicy | tekst w panelu | **SHOULD** | atrakcje, transport, odległości. |
| Imię bota | pole konfiguracyjne | **COULD** | nie zastępuje disclosure AI (HITL #8). |

- **Incremental update (MUST):** edycja Q&A przez managera w panelu → przeliczenie hasha KB → **natychmiastowa propagacja** do kontekstu modelu + invalidacja semantic cache danego `property_id`. **Brak re-indeksu** — to wbudowana zaleta prompt injection (nie ma indeksu wektorowego do przebudowy).
- Dane dynamiczne (dostępność, ceny real-time z PMS) **NIE** wchodzą do KB na MVP — brak integracji PMS (HITL #7, Sesja 1). Pytania o dostępność/cenę real-time → fallback do recepcji.
- Odpowiedzialność (HITL #9): hotel odpowiada za poprawność treści; platforma za delivery. Nieaktualna cena w KB = wina hotelu, nie platformy.

---

## 5. Ścieżka upgradu do RAG (POST-MVP — POZA SCOPE MVP)

> **Ta sekcja NIE jest w scope MVP.** Implementowana tylko gdy KB hotelu przekroczy budżet kontekstu. Dokumentuje plan, by decyzje MVP nie zablokowały upgradu. Developer **nie implementuje** tej sekcji w ramach MVP.

**Trigger (kiedy):** gdy KB pojedynczego hotelu przestaje mieścić się rozsądnie w budżecie kontekstu / kosztu (duży hotel, bogata KB, wiele języków, rozrost menu i polityk ponad ~10K tokenów efektywnie wykorzystywanych).

**Jak (architektura docelowa, materiał Sesji 4):**
- **pgvector** jako extension w Supabase (zero dodatkowej infrastruktury — Sesja 6); aktywacja istniejącej tabeli `knowledge_chunks`.
- Chunking **per typ treści** wg tabeli Sesji 4:

  | Typ treści | Strategia | Rozmiar (tok.) | Overlap |
  |---|---|---|---|
  | FAQ | Q&A pairs | 50–150 | brak |
  | Menu | item-level z prefixem kategorii | 50–100 | brak |
  | Pokoje | attribute-structured | 100–200 | brak |
  | Polityki | recursive split | 400–512 | 10–15% |
  | Okolica | semantic chunking | 300–600 | 50–80 |

- Embeddings: **text-embedding-3-small** (OpenAI) — dobra jakość PL, ~$0,02/1M tok.
- **Hybrid search**: BM25 (sparse) + dense embeddings — lepszy recall dla krótkich pytań hotelowych.
- **Contextual Retrieval** (Anthropic): +1–2 zdania kontekstu per chunk → recall +20–35%.
- Incremental update: hash compare → DELETE starych → UPSERT nowych chunków (zamiast natychmiastowej rekompozycji KB jak na MVP).

**Migracja:** prompt injection → RAG jest addytywna. Format Markdown + YAML frontmatter z MVP jest bezpośrednim wejściem do chunkingu (metadane `category`, `valid_from/until`, `property_id`, `language` reużyte jako filtry retrieval). Semantic cache (Upstash Redis) pozostaje bez zmian.

---

## 6. Testy jakości AI (automatyczne — bez manualnego review każdej rozmowy)

Pomiar przez PostHog events (Sesja 7) — `concierge_query_submitted`, `concierge_response_delivered` (`confidence_score`, latency ms), `concierge_response_escalated` (fallback trigger):

| Metryka | Cel / próg | Alert | Cel pomiaru |
|---|---|---|---|
| **Containment rate** (% queries bez eskalacji) | 40–65% (Gartner 2025) | gdy escalation > 35% | Czy AI faktycznie odciąża recepcję. |
| **Confidence score histogram** | avg ≥ 0,6 per kategoria | gdy avg < 0,6 dla kategorii | Sygnał niekompletnej KB w danej kategorii. |
| **Response latency (end-to-end)** | < 1,5 s cel; < 5 s twardy próg | gdy > 5 s | Wydajność; sprawdzić status OpenAI + cache hit rate. |
| **Downstream action rate** | — (obserwacja) | — | Czy gość składa zamówienie w ciągu 2 min po odpowiedzi concierge (HITL #7 — AI sugeruje, gość działa). |
| **Semantic cache hit rate** | 30–70% | spadek poniżej 30% | Skuteczność cache; koszt LLM. |

- **Monthly spot-audit (MUST):** 10 próbek miesięcznie (5 eskalowanych + 5 high-confidence) — kalibracja progów fallback/confidence bez pełnego audytu. Ręczna ocena przez personel hotelu.
- **Jak weryfikować jakość bez czytania każdej rozmowy:** kombinacja containment rate + confidence histogram + escalation rate daje obraz zdrowia systemu; spot-audit kalibruje progi; alert latency i confidence wyłapują regresje. Pełny manualny review zbędny na MVP.

---

## Czego NIE ma na MVP (potwierdzone benchmarkami i HITL)

- RAG / vector DB / embeddings / hybrid search (HITL #12 → ścieżka upgradu, sekcja 5).
- Integracja PMS real-time, booking/zmiany rezerwacji w czacie (HITL #7).
- Function calling do silnika zamówień (HITL #7 — AI tylko informuje).
- Voice assistant, proactive messaging, sentiment analysis, fine-tuning modelu.
- Tiered routing (mały/duży model) — GPT-4o-mini jednolicie; routing dopiero gdy jakość okaże się niewystarczająca (post-MVP).
