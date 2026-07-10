---
change_id: s3-6
title: In-app skaner QR pokoju ("Skanuj kod pokoju")
status: done
created: 2026-07-10
archived_at: null
---

## Notes

**Kontekst:** zarejestrowane jako TODO w `context/changes/s3-1/change.md` ("TODO — out of
scope for S3.1", 2026-07-10) podczas manualnej weryfikacji Fazy 4 S3.1. Użytkownik
zaproponował przycisk "Skanuj kod pokoju" (dostęp do kamery przez `MediaDevices` +
dekodowanie QR) na ekranie, na którym dziś gość widzi gołe `'Witaj!'`.

**Zakres:** wyłącznie stan `auth_level=1` (gość zeskanował QR recepcji, nie ma jeszcze
pokoju) — to dokładnie gałąź fallback w `components/guest/welcome-banner.tsx`, która dziś
renderuje `'Witaj!'`. Stan całkowicie niezalogowany (brak sesji) pozostaje bez zmian:
`requireGuestSession()` nadal przekierowuje na `/error?type=insufficient_auth` przed
wyrenderowaniem czegokolwiek — to nie jest w zakresie tej zmiany.

**Nie w zakresie:** flow natywnego skanowania aparatem telefonu (`/api/scan/reception`,
`/api/scan/room`) pozostaje nietknięty i nadal jest ścieżką podstawową — ten scanner jest
alternatywą in-app, nie zamiennikiem. Ekrany błędów S3.4 (`/error?type=...`) nie są
rozszerzane o nowe typy — odrzucenie obcego kodu QR obsłużone inline, bez opuszczania
strony.

**Decyzja HITL (ta sesja):** pełny in-app scanner (kamera + dekodowanie), nie tylko CTA/link
— potwierdzone przez użytkownika podczas planowania.

Pełny plan: `context/changes/s3-6/plan.md`.
