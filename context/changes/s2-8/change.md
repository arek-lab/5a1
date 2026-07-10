---
change_id: s2-8
title: Self-service signup ownera + konta hotelu
status: implemented
created: 2026-07-10
updated: 2026-07-10
archived_at: null
---

## Notes

Z `context/foundation/session-plan.md` (S2.8 — Self-service signup ownera + konta hotelu, Moduł onboarding krok 1):

**Kontekst:** wykryte podczas audytu invite flow (2026-07-10) — `implementation_roadmap.md`
nazywa "Signup + konto hotelu (Owner = ADM)" jako MUST (krok 1 onboardingu), ale
`session-plan.md` nie miał dla tego dedykowanej sesji. Dziś jedyny sposób powstania
`properties`+`hotel_users` (owner) to ręczny insert service-role (seed/testy) —
`app/[locale]/(hotel)/users/actions.ts` obsługuje tylko zapraszanie *kolejnych* userów
przez istniejącego ownera, nie tworzenie pierwszego ownera.

**Scope (draft):**
- Formularz signup (email, hasło, nazwa hotelu) → `auth.signUp` + insert `properties`
  (`setup_completed=false`) + insert `hotel_users` (`role='owner'`, `status='active'`)
  atomowo (RPC/transakcja — uniknąć property bez ownera przy błędzie w połowie).
- Owner = billing = administrator danych (ADM), zgodnie z HITL #3 — brak wyboru roli
  przy signupie.
- Do potwierdzenia z użytkownikiem/HITL przy `/10x-plan`:
  - Czy DPA gate (dziś: `dpa_signed_at IS NULL` guard przed generowaniem QR w S2.5)
    wchodzi w zakres tej sesji, czy zostaje jak jest.
  - Czy signup jest w pełni self-service na MVP, czy nadal zakłada kickoff call CSM
    (roadmapa opisuje model "auto-setup + 1× kickoff call 30 min").
  - Dokładne umiejscowienie w numeracji sesji i finalna lista blokerów (draft:
    S0.2, S0.3; S2.1 zaktualizowane, by blokować na S2.8).

**DoD (draft):** nowy hotel+owner powstają przez UI (nie przez service-role seed);
RLS: nowo utworzony property widoczny wyłącznie nowemu ownerowi; test integracyjny
z aktywnym RLS analogiczny do IT-5.

**Blokery:** S0.2, S0.3.

**Status:** zarejestrowana luka + draft scope, gotowe do szczegółowego planowania
przez `/10x-plan`. Nie implementowane w ramach tego wpisu.
