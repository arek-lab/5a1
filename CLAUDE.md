<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5

Scale the single-change cycle into parallel work with **worktrees, goal-directed delegation, and multi-session orchestration**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

The lesson focus is safe throughput: isolated contexts, choosing the right execution mode, and capping parallelism at review capacity.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code isolation** | |
| `git worktree add` | You need a separate working directory for a parallel change. One change per worktree, one fresh agent context per worktree. |
| **Complex changes** | |
| `/10x-implement <change-id> phase <n>` | The change has multiple phases, needs manual gates, or benefits from interactive decision-making during execution. |
| **Simple changes** | |
| `/goal` | You have a clear, bounded task and want goal-directed delegation. The agent works autonomously toward the stated goal with a stop condition. |
| `claude -p` | You want headless execution for a well-defined task. The Ralph Wiggum loop (run, check, retry) is the universal autonomous pattern. |
| **Multi-session orchestration** | |
| Superset / Conductor / Antigravity / VS Code Agent View | You are running multiple agent sessions in parallel and need visibility, coordination, or session management across them. |

### Parallel work rules

- One change per worktree or isolated workspace. One fresh agent context per change.
- Choose interactive `/10x-implement` for complex changes, `/goal` or `claude -p` for simple ones.
- Parallelism is capped by review capacity. More agents without review means more unreviewed code, not higher throughput.
- The quality pain from faster shipping is intentional — it bridges into Module 3 testing gates.

### Lesson boundaries

- Do not reteach interactive `/10x-implement` or `/10x-impl-review`; those are Lessons 2 and 3.
- Do not introduce testing strategy here. The quality pain is the motivation for Module 3.
- Worktrees are a mechanism for isolation, not the topic of a full git tutorial.

### Paths used by this lesson

- `context/changes/<change-id>/` - active change folder
- `context/changes/<change-id>/plan.md` - implementation input for any execution mode

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

---

## Hotel Guest App MVP — reguły projektu

**Źródła prawdy:**
- Specyfikacja + decyzje HITL: [`implementation_roadmap.md`](implementation_roadmap.md)
- Plan ~23 sesji (scope / DoD / blokery): [`context/foundation/session-plan.md`](context/foundation/session-plan.md)
- Decyzje HITL (pełne uzasadnienia): [`context/foundation/decisions_log.md`](context/foundation/decisions_log.md)

**Reguły sesji:**
1. Na początku sesji przeczytaj jej sekcję w `session-plan.md` + odpowiedni paragraf `implementation_roadmap.md`.
2. Nie wykraczaj poza scope sesji — potrzebna zmiana w innym module → TODO z sekcją docelową.
3. Sesja kończy się gdy DoD jest spełnione. Brak half-finished state.
4. Testy z aktywnym RLS (nie service_role) dla danych tenantowych.
5. Decyzje HITL są twarde — §1.3 roadmapy. Nie reinterpretuj.

**Konwencje kodu:**
- TypeScript strict mode, bez `any`. Server Components domyślnie; `'use client'` tylko przy event handlerach.
- Pliki: kebab-case. Komponenty: PascalCase. SQL: snake_case. TS: camelCase.
- Brak komentarzy wyjaśniających CO — tylko DLACZEGO (nieoczywiste invarianty).
- Commit per DoD: `feat(S0.2): database schema + RLS policies`.

**Sub-agent routing:**
- Parallel: 3+ niezależne zadania badawcze, każde ma jasny output (.md), nie modyfikują tych samych plików.
- Sequential: zadanie B potrzebuje outputu A, lub zakres niejasny — najpierw zrozum.
- Background: research i analiza (nie modyfikacje plików), wyniki nie blokują dalszej pracy.

**Znane ograniczenie środowiska — Turbopack dev:**
`next dev` z Turbopackiem ma w tym środowisku niedziałający HMR websocket
(`wss://.../_next/webpack-hmr` → `ERR_INVALID_HTTP_RESPONSE`), co po cichu
desynchronizuje JS/CSS chunki i objawia się jako fałszywe błędy w konsoli
przeglądarki: "Encountered a script tag...", hydration mismatch na komponentach
klienckich, podwójna inicjalizacja bibliotek (np. PostHog) — mimo że kod jest
poprawny (build + testy zielone). Dlatego `package.json` ma `dev`/`build` spięte
na `--webpack` (nie Turbopack). Jeśli taki błąd wróci: najpierw sprawdź
`npm run build` + `npm test` — jeśli oba zielone, to prawie na pewno to samo
środowiskowe ograniczenie Turbopacka, nie regres w kodzie. Szczegóły:
`context/changes/s6-1/change.md` (Faza 5).

