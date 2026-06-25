# RBAC w Hotel Guest App — Wzorce ról i uprawnień

**Data badania:** 2026-06-25  
**Źródła:** Wiedza o systemach PMS (Opera, Cloudbeds, Mews, Apaleo), wzorce B2B SaaS (Slack, Notion, Linear, Stripe, GitHub Orgs), literatura o multi-tenant RBAC.

---

## Role hotelowe i ich uprawnienia

Poniższa tabela mapuje typowe role operacyjne w hotelu na akcje w systemie typu Guest App / AI Concierge Platform. Oznaczenia: ✅ pełny dostęp | 👁 tylko odczyt | ✏️ edycja (bez usuwania) | ❌ brak dostępu.

### Tabela: rola × akcja

| Akcja / moduł | GM (General Manager) | Revenue Manager | Front Desk / Recepcja | F&B Manager | Housekeeping | Maintenance |
|---|---|---|---|---|---|---|
| **KONFIGURACJA HOTELU** | | | | | | |
| Ustawienia obiektu (nazwa, logo, dane) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Zarządzanie użytkownikami (dodaj/usuń) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Konfiguracja ról i uprawnień | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Integracje zewnętrzne (PMS, POS) | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |
| Klucze API / webhooks | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AI CONCIERGE — TREŚĆ** | | | | | | |
| Baza wiedzy hotelu (Q&A, FAQ) | ✅ | 👁 | ✏️ | ✏️ | ❌ | ❌ |
| Menu restauracji / F&B content | ✅ | ❌ | 👁 | ✅ | ❌ | ❌ |
| Informacje o pokojach i usługach | ✅ | ❌ | ✏️ | ❌ | ❌ | ❌ |
| Lokalne rekomendacje (atrakcje) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Tone of voice / persona AI | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **KODY QR I DOSTĘP GOŚCI** | | | | | | |
| Generowanie kodów QR | ✅ | ❌ | ✅ | ✏️ | ❌ | ❌ |
| Dezaktywacja kodów QR | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Podgląd aktywnych sesji gości | ✅ | ❌ | ✅ | 👁 | ❌ | ❌ |
| Historia konwersacji z AI | ✅ | ❌ | ✅ | 👁 | ❌ | ❌ |
| **USŁUGI I ZAMÓWIENIA** | | | | | | |
| Zarządzanie katalogiem usług | ✅ | ❌ | ✏️ | ✏️ (F&B) | ❌ | ❌ |
| Podgląd zamówień (wszystkie) | ✅ | 👁 | ✅ | ✅ (F&B) | ❌ | ❌ |
| Realizacja zamówień (zmiana statusu) | ✅ | ❌ | ✅ | ✅ (F&B) | ✅ (housekeeping req.) | ✅ (maint. req.) |
| Anulowanie zamówień | ✅ | ❌ | ✅ | ✅ (F&B) | ❌ | ❌ |
| **RAPORTY I ANALITYKA** | | | | | | |
| Raporty operacyjne (aktywność gości) | ✅ | 👁 | 👁 | 👁 (F&B) | ❌ | ❌ |
| Raporty przychodów / RevPAR | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Eksport danych | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dashboard ogólny | ✅ | ✅ | ✅ | ✅ | 👁 | 👁 |
| **BILLING / SUBSKRYPCJA** | | | | | | |
| Zarządzanie planem / fakturami | ✅ (Owner) | ❌ | ❌ | ❌ | ❌ | ❌ |

### Kluczowe zasady separacji obowiązków (SoD)

1. **Revenue Manager NIE dotyka operacji** — widzi liczby, nie zmienia konfiguracji systemu ani treści.
2. **Housekeeping NIE widzi rozmów z gośćmi** — dostają tylko zgłoszenia (request queue), nie historię konwersacji AI.
3. **Front Desk NIE zarządza billing** — to wyłączna domena właściciela konta.
4. **F&B Manager ma dostęp tylko do własnego działu** — nie może modyfikować informacji o pokojach ani raportów przychodów.
5. **Nikt poza GM/Owner nie może zapraszać nowych użytkowników** — krytyczne dla bezpieczeństwa multi-tenant.

---

## Rekomendowane role MVP

### Zasada: zacznij od 3 ról, rozbuduj do 5 gdy jest potrzeba

#### MVP — 3 role wystarczające na start

| Rola | Kto pełni | Zakres uprawnień |
|---|---|---|
| **Owner / Admin** | GM, właściciel hotelu | Pełny dostęp do wszystkiego włącznie z billing, user management, ustawieniami |
| **Staff** | Recepcja, F&B, Revenue | Dostęp do modułów operacyjnych bez konfiguracji systemu i user management |
| **Operations** | Housekeeping, Maintenance | Tylko widok i zmiana statusu własnych zgłoszeń (request queue) |

**Dlaczego 3 role wystarczają na MVP:**
- W małych hotelach (20–80 pokoi) często GM = recepcja = revenue manager to jedna lub dwie osoby.
- Granulacja departamentalna jest potrzebna gdy hotel zatrudnia >10 osób w systemie.
- Zbyt szczegółowe role MVP zwiększają koszt wdrożenia (szkolenie, konfiguracja per user).

#### v1.5 — 5 ról gdy hotel ma wyraźną strukturę departamentową

| Rola | Opis |
|---|---|
| **Owner** | Billing + pełna administracja, nieusuwalna |
| **Admin** | Konfiguracja + user management, bez billing |
| **Front Desk** | Operacje z gościem, kody QR, zamówienia, treść AI |
| **Department Manager** | Własny dział (F&B lub Revenue), tylko raporty swojego obszaru |
| **Operations Staff** | Realizacja zgłoszeń (housekeeping, maintenance), brak dostępu do historii gości |

#### v2 — Granulacja permission-level (gdy pojawia się zapotrzebowanie)

Wzorzec z Apaleo / Mews: zamiast sztywnych ról, definiujesz **zestawy uprawnień** (permission sets) i przypisujesz je do użytkownika à la carte. To daje elastyczność (np. recepcjonista wieczorny widzi mniej niż dzienny), ale wymaga UI do zarządzania uprawnieniami — zbyt skomplikowane na MVP.

**Sygnał do przejścia na v2:** hotel-klient zgłasza, że chce dać pracownikowi dostęp tylko do jednego modułu, a żadna ze standardowych ról nie pasuje.

---

## Zarządzanie cyklem życia użytkownika

### Onboarding pracownika

```
1. Admin/Owner wysyła zaproszenie (email z tokenem, ważny 72h)
2. Pracownik klika link → zakłada hasło (lub SSO jeśli hotel używa Google Workspace / Azure AD)
3. Admin przypisuje rolę PRZED lub W MOMENCIE zaproszenia
4. Opcjonalnie: przypisanie do konkretnego property (dla multi-property)
5. System loguje event: "user_invited_by: [admin_id], role: [role], timestamp"
```

**Praktyczne decyzje:**
- Zaproszenie wygasa — nie pozwalaj na "otwarte" linki bez ekspiracji.
- Nie wysyłaj tymczasowego hasła emailem — tylko link do ustawienia hasła.
- Domyślna rola przy zaproszeniu: `Staff` (nie `Admin`) — zasada least privilege.

### Offboarding pracownika (kluczowe dla hoteli z rotacją)

Rotacja w hotelarstwie jest wysoka (30–50% rocznie w Polsce). To jeden z najważniejszych wzorców do rozwiązania.

```
Scenariusz: recepcjonista odchodzi z pracy
1. Admin DEZAKTYWUJE konto (nie usuwa)
2. Konto nieaktywne: użytkownik nie może się zalogować
3. Historia akcji zachowana w audit logu (ważne dla compliance)
4. Sesje aktywne: wymuszone wylogowanie (revoke all sessions)
5. Wszystkie treści edytowane przez tego użytkownika pozostają (nie kasuj treści razem z userem)
```

**Dlaczego DEZAKTYWACJA, nie USUNIĘCIE:**
- Audit trail — musisz wiedzieć kto i kiedy zmienił menu AI concierge.
- Compliance — w przypadku skargi gościa musisz móc odtworzyć historię.
- Odwracalność — pracownik może wrócić (staż, sezon letni).

**Wzorzec "ostatecznego właściciela":**
- Jeśli odchodzi Owner konta, system MUSI zablokować możliwość dezaktywacji dopóki nie przeniesie ownership na innego użytkownika.
- Slack i Stripe stosują ten wzorzec: nie możesz usunąć ostatniego właściciela.

### Zarządzanie dostępem sezonowym

```
Pracownik sezonowy / staż:
- Rola: Staff z ograniczonym dostępem
- Opcjonalnie: data wygaśnięcia konta (auto-deactivation)
- Rekomendacja MVP: admin ręcznie dezaktywuje (auto-expiry to v2 feature)
```

### Audit log — minimalne wymagania

Każde zdarzenie związane z użytkownikami powinno być logowane:
- `user_invited`, `user_activated`, `user_deactivated`, `user_role_changed`
- `login_success`, `login_failed` (dla security)
- `permission_denied` (próba dostępu do zasobu bez uprawnień)

---

## Multi-property: wzorzec dla sieci hotelowych

### Scenariusz: Sieć hotelowa z kilkoma obiektami

```
Struktura:
├── Sieć "Hotel Kraków Group" (Organization)
│   ├── Hotel Kraków Centrum (Property A)
│   ├── Hotel Kraków Airport (Property B)
│   └── Hotel Zakopane (Property C)
```

### Model uprawnień: Organization vs Property scope

| Rola | Scope | Opis |
|---|---|---|
| **Network Owner** | Organization | Billing, dodawanie/usuwanie properties, user management całej sieci |
| **Network Admin** | Organization | Dostęp do wszystkich properties, nie zarządza billing |
| **Property Admin** | Single Property | Pełna administracja jednego hotelu, nie widzi innych |
| **Property Staff** | Single Property | Operacje w jednym hotelu |
| **Cross-property Staff** | Wybrane Properties | Np. Revenue Manager zarządza cennikiem dla A i B, nie C |

### Kluczowe zasady multi-property

1. **Izolacja danych między properties jest domyślna** — Property Admin hotelu A NIE widzi danych hotelu B nawet jeśli są w tej samej sieci.
2. **Cross-property access jest wyjątkiem, nie regułą** — przyznajesz go explicite, nie dziedziczy się automatycznie.
3. **Billing jest na poziomie Organization** — sieć płaci jeden rachunek za wszystkie properties.
4. **Konfiguracja AI concierge jest per-property** — każdy hotel ma własną bazę wiedzy, nawet w tej samej sieci.

### Implementacja: tenant hierarchy

```
Model danych (uproszczony):
Organization (1)
  └── Property (N)
        └── User-Property-Role (M) 
              [user_id, property_id, role_id]

Dla cross-property:
User (1) → User-Property-Role (N) → Properties (M)
Jeden użytkownik może mieć różne role w różnych properties
```

### Praktyczny wzorzec z Mews / Cloudbeds

W systemach PMS dla sieci hotelowych stosuje się model **"Chain + Property"**:
- Chain level: ustawienia globalne, szablony ról, cenniki sieciowe
- Property level: lokalna konfiguracja, lokalni użytkownicy
- Użytkownik może być przypisany do chain (widzi wszystko) lub do konkretnych properties

**Rekomendacja dla MVP:** zaimplementuj single-property, ale zaprojektuj schemat danych tak, żeby `hotel_id` (property_id) był na każdym rekordzie — to umożliwi rozbudowę do multi-property bez migracji danych.

---

## Właściciel konta — kto to jest i jakie ma prawa

### Definicja "Account Owner"

Account Owner to specjalna rola NIEZWIĄZANA z rolą operacyjną (GM może nie być Ownerem). Jest to **prawny i finansowy odpowiedzialny** za konto w systemie SaaS.

### Uprawnienia wyłączne Ownera

| Uprawnienie | Owner | Admin | Inni |
|---|---|---|---|
| Zarządzanie planem subskrypcji | ✅ | ❌ | ❌ |
| Dostęp do faktur i historii płatności | ✅ | ❌ | ❌ |
| Zmiana metody płatności | ✅ | ❌ | ❌ |
| Usunięcie konta / anulowanie subskrypcji | ✅ | ❌ | ❌ |
| Transfer ownership (przekazanie praw) | ✅ | ❌ | ❌ |
| Dodawanie Property do sieci | ✅ | ❌ | ❌ |

### Kto zazwyczaj jest Ownerem w hotelu

1. **Właściciel hotelu** (najczęściej w niezależnych hotelach)
2. **Dyrektor generalny / GM** (gdy własność jest korporacyjna)
3. **Dyrektor IT / Revenue** (gdy hotel ma dużą strukturę)

W praktyce: **osoba, która zakłada konto i podaje kartę płatniczą, zostaje automatycznie Ownerem**.

### Transfery ownership — scenariusze

| Scenariusz | Działanie |
|---|---|
| GM odchodzi i był Ownerem | Musi przenieść ownership zanim konto zostanie dezaktywowane |
| Hotel zmienia właściciela | Owner inicjuje transfer → nowy właściciel akceptuje emailem |
| Owner stracił dostęp do email | Procedura weryfikacji przez support (poza systemem) |

### Wzorzec "wymuszonego transferu"

Stripe stosuje zasadę: jeśli jedyny Owner chce opuścić organizację, system wymaga wskazania nowego Ownera przed zakończeniem operacji. To powinno być zaimplementowane w każdym B2B SaaS.

---

## Wzorce z B2B SaaS do zaadaptowania

### 1. Slack — workspace roles

**Model:** Owner > Admin > Member > Guest (Single/Multi-channel)

**Co zaadaptować:**
- **Guest z ograniczonym scope** — odpowiednik dla hotelu: konto dla zewnętrznego dostawcy (np. firma sprzątająca), który widzi tylko swoje zgłoszenia, nie całą platformę.
- **Separacja Admin od Owner** — Admin może zarządzać użytkownikami, ale nie ma dostępu do billing.
- **Wymuszenie 2FA przez Admina** — Admin może narzucić wymóg 2FA dla całego workspace.

### 2. Notion — teams i permission inheritance

**Model:** Workspace Owner > Admin > Member > Guest

**Co zaadaptować:**
- **Page-level permissions** → w hotelu: treść AI concierge może być lockowana per dział (F&B edytuje tylko swoje menu).
- **Guest link sharing** → w hotelu: nie potrzebujemy tego, ale QR code dla gościa to analogia (link bez konta).
- **Granular content permissions bez granular user roles** — zamiast 10 ról, masz 3 role + lockowanie konkretnych treści.

### 3. Linear — project-scoped access

**Model:** Admin > Member > Viewer, z Teams jako scope

**Co zaadaptować:**
- **Teams jako działy** → F&B team widzi tylko F&B issues, Housekeeping team widzi tylko housekeeping requests.
- **Viewer role** — odpowiednik dla hotelu: Revenue Manager lub zewnętrzny audytor, który widzi raporty ale nic nie zmienia.
- **Automatyczne przypisanie do team przy zaproszeniu** — zapraszasz kogoś od razu do roli + działu.

### 4. Stripe — organization roles

**Model:** Owner > Administrator > Developer > Analyst > Support

**Co zaadaptować:**
- **Analyst role** (tylko dane, zero operacji) → Revenue Manager w hotelu.
- **Support role** (widzi transakcje, nie może ich tworzyć) → odpowiednik Front Desk z ograniczonym dostępem.
- **Explicit permission per feature** zamiast hierarchii ról dla zaawansowanych przypadków.
- **Separation of duties**: nikt poza Ownerem nie widzi pełnych danych karty — analogicznie nikt poza GM nie widzi pełnych danych finansowych hotelu.

### 5. GitHub Organizations — teams + repos

**Model:** Owner > Member, z Teams mającymi dostęp do wybranych repos

**Co zaadaptować:**
- **Team-based access** → moduły w hotelu jako "repozytoria": F&B team ma dostęp do F&B module, Housekeeping team do housekeeping module.
- **Branch protection rules** → w hotelu: krytyczne ustawienia (tone of voice AI, integracje) mogą wymagać zatwierdzenia przez Ownera nawet jeśli Admin je edytuje.

### 6. HubSpot / Salesforce — role templates + custom roles

**Model:** Predefiniowane role + możliwość tworzenia custom roles z listy permissions

**Co zaadaptować:**
- **Role templates** — zamiast budować custom RBAC od razu, zaoferuj 5 gotowych szablonów ról i pozwól na ich kopiowanie i modyfikację w v2.
- **Permission categories** — grupuj uprawnienia w kategorie (Content, Operations, Analytics, Admin) zamiast liczyć pojedyncze permissions.

### Zestawienie: które wzorce są priorytetowe dla MVP

| Wzorzec | Skąd | Priorytet MVP | Uzasadnienie |
|---|---|---|---|
| Owner ≠ Admin (billing separation) | Stripe, Slack | Wysoki | Krytyczne dla bezpieczeństwa SaaS |
| Wymuszone przeniesienie ownership | Stripe | Wysoki | Zapobiega "osieroconym" kontom |
| Dezaktywacja zamiast usunięcia | Notion, Slack | Wysoki | Audit trail, rotacja pracowników |
| Invitation-based onboarding | Wszyscy | Wysoki | Standard bezpieczeństwa |
| Viewer-only role | Linear, Stripe | Średni | Przydatne dla Revenue Manager |
| Team/department scoping | Linear, GitHub | Średni | Potrzebne przy >5 usersów |
| Custom role templates | HubSpot | Niski (v2) | Zbędna złożoność na MVP |
| Guest/external accounts | Slack | Niski (v2) | Zewnętrzni dostawcy to edge case |

---

## Wnioski i decyzje do podjęcia

### Decyzja 1: Model ról na MVP — 3 czy 5?

**Rekomendacja: zacznij od 4 ról**

```
Owner → Admin → Staff → Viewer
```

- **Owner**: billing + pełna administracja (1 osoba w hotelu)
- **Admin**: user management + pełna konfiguracja (może być GM lub manager IT)
- **Staff**: operacje z gościem, kody QR, treść AI, zamówienia (recepcja, F&B)
- **Viewer**: tylko raporty i dashboard (Revenue Manager, właściciel nieoperacyjny)

Uzasadnienie: 4 role pokrywają 90% przypadków na MVP bez nadmiernej złożoności. "Operations Staff" (housekeeping) można obsłużyć przez dedykowany widok (task queue) bez pełnego konta w systemie — do rozważenia.

### Decyzja 2: Czy housekeeping potrzebuje pełnego konta?

**Do rozważenia:** Housekeeping i Maintenance często nie mają laptopów/telefonów służbowych. Możliwe alternatywy:
- **Dedykowany PIN/kiosk view** bez normalnego konta — uproszczone UI na tablecie w szatni.
- **Pełne konto z rolą Operations** — elastyczniejsze, ale wymaga smartfona dla każdego pracownika.

Decyzja zależy od segmentu klienta (hotel boutique vs duży hotel z 50 housekeepers).

### Decyzja 3: Kiedy rozbudować do multi-property?

**Rekomendacja:** Zaprojektuj schemat danych z `property_id` od początku, ale NIE buduj UI multi-property na MVP. Pierwszy klient sieciowy (2–3 hotele) będzie sygnałem do budowy.

Koszt migracji danych bez `property_id`: wysoki. Koszt dodania UI dla multi-property gdy dane są gotowe: niski.

### Decyzja 4: Granulacja uprawnień — role vs permissions

**Rekomendacja:** Role-based na MVP, permissions-based jako wariant premium (v2).

Role są prostsze do zaimplementowania, sprzedania i wytłumaczenia klientowi. Większość hoteli nie potrzebuje permissions à la carte — potrzebuje sensownych domyślnych ról.

### Decyzja 5: Audit log — zakres minimalny

Na MVP wystarczy logowanie:
- Zdarzeń user management (invite, activate, deactivate, role change)
- Logowania (success/failure)
- Zmian w konfiguracji krytycznych (AI persona, integracje)

**Nie loguj na MVP:** każdej edycji treści (to v2 / content versioning feature).

### Decyzja 6: Offboarding — automatyzacja vs manual

**Rekomendacja MVP: manual z UI ułatwiającym akcję.**

Nie buduj automatycznego wylogowania po X dniach braku aktywności. Zamiast tego: widoczna lista aktywnych użytkowników z datą ostatniego logowania, żeby Admin widział "nieaktywnych" i mógł ich dezaktywować ręcznie.

### Czerwone flagi do unikania

1. **"Super Admin" bez ograniczeń** — konto techniczne, które ma dostęp do danych wszystkich tenantów to wektor ataku. Oddziel platform admin od hotel admin.
2. **Usuwanie użytkowników bez audit trail** — zobowiązanie GDPR wymaga wiedzieć co kto robił.
3. **Automatyczne dziedziczenie uprawnień** — jeśli Workspace Admin może sobie sam przyznawać uprawnienia, nie masz RBAC, masz security hole.
4. **Jeden Owner = jeden point of failure** — rozważ wymóg co najmniej jednego Admin jako backup (lub pozwól na wielu Ownerów).

---

*Raport przygotowany na potrzeby projektu Hotel Guest App MVP. Bez dostępu do live dokumentacji Duve, Canary, ALICE — wnioski oparte na wiedzy o PMS (Opera, Cloudbeds, Mews, Apaleo) i wzorcach B2B SaaS.*
