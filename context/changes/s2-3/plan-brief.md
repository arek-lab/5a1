# Usługi: CRUD + biblioteka szablonów — Plan Brief

> Pełny plan: `context/changes/s2-3/plan.md`

## Co i po co

Panel hotelowy dostaje moduł zarządzania usługami: CRUD (nazwa, opis, cena/„Included", kategoria, aktywność), biblioteka 15–20 gotowych szablonów do szybkiego startu oraz pinowanie max 3 usług do sekcji „Polecamy" na home screenie gościa (HITL #6). To pierwszy w pełni operacyjny moduł panelu — dotychczas (S2.2) hotel mógł tylko skonfigurować profil.

## Punkt wyjścia

Tabela `services` i polityki RLS (`staff_all_services`, `guest_read_services`) już istnieją od S0.2 — zero nowej migracji. RBAC dla zasobu `services` już zdefiniowany (staff=write, viewer=read). Krok „usługi" w wizardzie onboardingowym istnieje jako nieklikalny placeholder. `readiness.ts` już liczy `activeServicesCount >= 3` jako jeden z 4 filarów gotowości hotelu — S2.3 dostarcza dane, które ten kod już konsumuje.

## Stan docelowy

Staff/Admin/Owner zarządza katalogiem usług na stronie `/services`: dodaje z szablonu lub od zera, edytuje, przełącza aktywność, pinuje do „Polecamy" (twardy limit 3). Viewer widzi listę tylko do odczytu. Krok „Usługi" w wizardzie onboardingowym jest interaktywny.

## Kluczowe decyzje

| Decyzja | Wybór | Dlaczego |
|---|---|---|
| Źródło szablonów | Statyczna stała w kodzie (`lib/panel/service-templates.ts`) | Zero migracji, zgodne z solo dev + SDD; katalog MVP jest stabilny |
| Zdjęcie usługi (`image_url`) | Pole tekstowe URL (jak `logo_url` w S2.2) | Brak Storage w projekcie; priorytet COULD nie uzasadnia budowy uploadu |
| Walidacja limitu pin (max 3) | Server action liczy aktywne piny przed zapisem | Prosta logika, spójna z ręczną walidacją z S2.2; race condition akceptowalna (jeden operator na raz) |
| Struktura UI CRUD | Dedykowana dla S2.3 (surowy HTML + useState/useTransition) | Zero nowych zależności; wspólne komponenty wydzielimy, gdy pojawi się realna duplikacja (S2.4+) |
| Kategorie usług | Zamknięta lista 5 kategorii (§5.1 roadmapy) | Gwarantuje zgodność z gridem guest UI (S3.1) — dowolny tekst mógłby złamać wyświetlanie |
| Wpięcie w wizard | Odblokuj krok + osobna pełna strona `/services` | Spełnia DoD onboardingu (§7.1 krok 6: ≥3 usługi z szablonów) i daje stałe miejsce zarządzania |
| Zakres testów | Unit (walidacja/pin) + nowy test RLS izolacji zapisu staff | IT-3 pokrywa tylko odczyt gościa — zapis przez staff (`staff_all_services`, `auth.uid()`) nie był jeszcze testowany |
| Delete vs deactivate | Tylko `is_active` toggle, brak hard DELETE | Spójne z filozofią projektu (offboarding = dezaktywacja); chroni FK z `orders.service_id` |

## Zakres

**W zakresie:**
- CRUD usług (create z szablonu / custom, update, toggle active, toggle pin)
- Biblioteka 15–20 szablonów jako stała w kodzie
- Walidacja server-side: pola wymagane, kategoria z zamkniętej listy, limit 3 pinów
- Nowy test SQL izolacji zapisu staff (rozszerza pokrycie IT-3)
- Odblokowanie kroku „usługi" w wizardzie onboardingowym

**Poza zakresem:**
- Upload zdjęć do Supabase Storage
- Tabela `service_templates` w bazie
- Hard DELETE usług
- DB-owy constraint/trigger na limit pinów
- Dostępność godzinowa (`available_from/to`) UI
- Auto-tłumaczenie PL→EN treści usług (odroczone, R4 roadmapy)

## Architektura / Podejście

Trzy fazy sekwencyjne: (1) dane statyczne + i18n jako fundament, (2) server actions + walidacja + testy jako warstwa logiki biznesowej, (3) UI panelu + wpięcie w wizard. Kolejność pozwala przetestować logikę pin/walidacji niezależnie od UI. Cała logika RLS/RBAC już istnieje — S2.3 to czysto warstwa aplikacyjna nad gotowym schematem.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Szablony + kategorie + i18n | Statyczne dane: 15-20 szablonów, 5 kategorii, klucze tłumaczeń PL/EN | Niekompletne pokrycie kategorii szablonami |
| 2. Server actions + walidacja + testy | CRUD actions, walidacja pin max-3, nowy test RLS izolacji zapisu staff | Test RLS staff wymaga symulacji `auth.uid()` w SQL — nietrywialny setup |
| 3. UI panelu + wizard | Strona `/services`, formularze, wpięcie w krok wizardu | Reużycie server actions między pełną stroną a krokiem wizardu bez duplikacji |

**Warunki wstępne:** brak — cały fundament (schemat, RLS, RBAC) gotowy od S0.2/S2.1.
**Szacowany nakład:** ~3 sesje implementacyjne (1 faza = 1 sesja robocza), zgodnie z resztą planu S2.x.

## Otwarte ryzyka i założenia

- Dobór 15-20 szablonów jest arbitralny (brak zewnętrznego źródła) — trzeba pokryć wszystkie 5 kategorii z rozsądną liczbą pozycji każda.
- Test RLS izolacji zapisu staff to nowy wzorzec (symulacja `auth.uid()` przez `request.jwt.claims` GUC) — pierwszy raz w projekcie, wymaga weryfikacji przy implementacji.

## Kryteria sukcesu (podsumowanie)

- Hotel (staff+) samodzielnie dodaje i zarządza usługami bez pomocy platformy
- Limit 3 pinów „Polecamy" jest twardo egzekwowany po stronie serwera
- Test izolacji tenantów potwierdza, że staff jednego hotelu nie widzi/nie modyfikuje usług innego
