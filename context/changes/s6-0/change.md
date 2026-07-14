---
change_id: s6-0
title: Nawigacja główna (gość + panel)
status: implementing
created: 2026-07-14
updated: 2026-07-14
archived_at: null
---

## Notes

Luka odkryta podczas planowania S6.1 — nawigacja z `style.md` §1.3/§2.3 nigdy nie została
zbudowana. Patrz `context/foundation/session-plan.md` sekcja S6.0.

**Odstępstwo od planu (Faza 2, 2026-07-14):** `session-plan.md` §S6.0 zakładał, że dolna nawigacja
renderuje się identycznie niezależnie od `auth_level` ("nav tylko czyta istniejące
uprawnienia/sesję, każda strona docelowa zachowuje własny guard"). Manualna weryfikacja Fazy 2
ujawniła, że `requireGuestSession()` sprawdza wyłącznie `auth_level >= 1` — gość po samym skanie
recepcji (`auth_level: 1`, bez zeskanowanego pokoju) miał pełny dostęp do wszystkich zakładek przez
nav, mimo braku danych rezerwacji/pokoju. Decyzja HITL (ta sesja): `BottomNav` czyta `authLevel` z
sesji i przekierowuje zakładki wymagające pokoju (Udogodnienia, Mój pobyt, Odkrywaj) do nowego
ekranu `/room-required` z instrukcją zeskanowania QR pokoju, gdy `authLevel < 2`. Dziś (`/`) i
Concierge zostają dostępne już na `auth_level 1` (recepcja, oczekiwanie na pokój). Brak zmian w
`requireGuestSession()`/RLS/guardach stron — gating jest wyłącznie na poziomie linków nav.
