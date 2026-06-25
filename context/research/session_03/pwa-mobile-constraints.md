# PWA Mobile Constraints 2025-2026

**Kontekst badania:** Hotel Guest PWA — dostęp przez QR kod, bez wymaganej instalacji.  
**Źródła:** MDN Web Docs, web.dev, developer.mozilla.org, Apple Developer docs (weryfikowane przez WebFetch, czerwiec 2026).

---

## Wydajność na słabych urządzeniach

### Twarde limity sprzętowe (realny target)

Segment "słabych urządzeń" w 2025 to przede wszystkim:
- **Android low-end**: 1–2 GB RAM, procesory Cortex-A53/A55 (taktowanie 1.4–1.8 GHz), eMMC storage
- **Stare iPhone'y** w hotelach: iPhone 8/SE (2020) — 3 GB RAM, A13 bionic — znacznie lepszy niż low-end Android
- **Problem nie jest RAM** sam w sobie, lecz **dostępna pamięć dla przeglądarki** po odjęciu OS + innych aplikacji

Przeglądarka na low-end Android ma typowo **200–400 MB efektywnie dostępnego RAM** zanim system zaczyna zabijać procesy. Tab z ciężką JS aplikacją może zostać uśpiony lub zabity przez OS.

### Core Web Vitals — progi (obowiązujące od marca 2024)

| Metryka | Dobra | Wymaga poprawy | Słaba |
|---------|-------|---------------|-------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5 s | ≤ 4.0 s | > 4.0 s |
| **INP** (Interaction to Next Paint) | ≤ 200 ms | ≤ 500 ms | > 500 ms |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | ≤ 0.25 | > 0.25 |

**Uwaga: INP zastąpił FID w marcu 2024.** INP mierzy czas od interakcji użytkownika do następnej klatki wizualnej — jest bardziej rygorystyczny niż FID, bo mierzy przez całą sesję, nie tylko pierwsze kliknięcie.

Dla slow 3G + low-end device realistyczne cele to:
- **First Contentful Paint**: < 3 s
- **Time to Interactive**: < 5 s
- **Total Blocking Time**: < 600 ms

### Jak obchodzić limity

**Bundle size — kluczowy czynnik:**
- Każde 100 KB JavaScript → ~150–300 ms parse + execute na slow device (Cortex-A53)
- Cel: **initial JS bundle < 150 KB gzipped**
- Używaj code splitting (`React.lazy()`, dynamic `import()`)
- Unikaj bundlowania wszystkiego naraz

**Strategie dla hotel PWA:**
```
1. App Shell Architecture:
   - Załaduj minimalny HTML + CSS natychmiast (< 10 KB)
   - Lazy-load widoki pokoju, menu, zamówień
   - Skeleton screens zamiast blank state

2. Obrazy:
   - Użyj WebP lub AVIF (30–50% mniejsze od JPEG)
   - lazy loading: <img loading="lazy">
   - srcset dla różnych DPI

3. Fonty:
   - Preferuj system-ui (zero kosztu ładowania)
   - Jeśli custom font — użyj font-display: swap

4. Renderowanie:
   - Unikaj layout thrashing (czytanie + pisanie DOM w pętli)
   - Animacje tylko przez CSS transform/opacity (GPU composited)
   - Nie blokuj main thread > 50 ms
```

**Obsługa błędów sieci (kluczowe dla hotel context):**
```javascript
// Wzorzec: graceful degradation z timeout
async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Połączenie zbyt wolne — spróbuj ponownie');
    }
    throw error;
  }
}
```

**RAM management:**
- Nie trzymaj w pamięci dużych list (wirtualizacja z react-window lub podobne)
- Zwolnij event listenery przy unmount komponentów
- Unikaj base64 dla obrazów > 1 KB (wbudowane w JS zwiększają rozmiar bundle)

---

## Offline mode — co cachować

### Kontekst hotelowy: priorytety

Gość hotelowy z QR kodem ma bardzo specyficzny use case:
- **Jednorazowa wizyta** (1–3 doby)
- Skanuje QR → oczekuje natychmiastowego dostępu
- Hotel WiFi bywa niestabilny (lobby, corridor, room edge)
- Nie instaluje aplikacji

### Strategie Service Worker dla hotel PWA

**Cache First — dla statycznych assetów (zawsze):**
```javascript
// HTML, CSS, JS bundle, fonty, ikony hotelowe
const STATIC_CACHE = 'hotel-static-v1';
const STATIC_ASSETS = [
  '/',
  '/styles/main.css',
  '/js/app.js',
  '/fonts/hotel-font.woff2',
  '/icons/app-icon-192.png',
  '/offline.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});
```

**Stale While Revalidate — dla menu, usług, informacji o hotelu:**
```javascript
// Menu restauracji, usługi, godziny otwarcia, cennik
// Pokaż stare dane natychmiast, odśwież w tle
const staleWhileRevalidate = async (request) => {
  const cached = caches.match(request);
  const networkFetch = fetch(request).then(response => {
    caches.open('hotel-dynamic-v1')
      .then(cache => cache.put(request, response.clone()));
    return response;
  });
  return (await cached) || (await networkFetch);
};
```

**Network First z Cache Fallback — dla statusu zamówień:**
```javascript
// Status room service, zamówień — musi być świeże
// Ale jeśli brak sieci, pokaż ostatni znany stan
const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    const cache = await caches.open('hotel-api-v1');
    cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request);
  }
};
```

**Network Only — nigdy nie cachować:**
- Płatności i checkout
- Logowanie/autoryzacja
- Składanie zamówień (POST/PUT/PATCH/DELETE)
- Dane osobowe gościa
- Aktualne ceny / dostępność pokoi

### Co MA SENS cachować w hotel PWA

| Zasób | Strategia | Uzasadnienie |
|-------|-----------|-------------|
| App Shell (HTML/CSS/JS) | Cache First | Niezmienne przez sesję |
| Menu restauracji | Stale While Revalidate | Zmienia się rzadko, stale OK |
| Zdjęcia pokoi / usług | Cache First | Duże, niezmienne |
| Godziny otwarcia, kontakty | Cache First | Statyczne info |
| Status zamówień (read) | Network First + cache | Musi być świeże |
| Tłumaczenia (i18n) | Cache First | Niezmienne |
| Offline fallback page | Cache First | Zawsze |

### Co NIE MA SENSU offline

- **Real-time availability** (czy pokój dostępny do późnego checkout)
- **Aktualne ceny** — zmienne, cachowanie może wprowadzić w błąd
- **Stany zamówień** bez możliwości wysłania — można pokazać "Jesteś offline, zamówienie zostanie wysłane po połączeniu" (ale wymaga Background Sync)
- **Chat z recepcją** — real-time, bezsensu offline
- **QR check-in/out** — wymaga weryfikacji server-side

### Limity storage (zweryfikowane)

| Platform | Limit | Eviction |
|---------|-------|---------|
| iOS 17+ (Safari + Home Screen) | ~60% dysku urządzenia | LRU + brak aktywności 7 dni |
| iOS < 17 | 1 GB per origin (potem prompt) | LRU |
| Android Chrome | ~60% dysku urządzenia | LRU |
| localStorage (wszystkie) | 5 MB per origin | Brak — trwałe |

**Krytyczne dla hotelowego use case:**
```
iOS: dane kasowane po 7 dniach bez aktywności użytkownika
(gdy włączona ochrona cross-site tracking)

Gość sprawdza hotel 3 dni → dane OK
Gość wraca po 2 tygodniach → cache wyczyszczony → pierwsze ładowanie z sieci
```

Dla jednorazowych gości to **nie jest problem** — każda wizyta jest de facto pierwszą.

**Persistent Storage API** (zapobiega automatycznej ewikacji):
```javascript
async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const granted = await navigator.storage.persist();
    // Chrome: auto-grant na podstawie engagement
    // Safari: auto-grant lub deny bez promptu
    // Firefox: pokazuje prompt użytkownikowi
  }
}
```

---

## Add to Home Screen — czy warto

### Rekomendacja dla hotel PWA: NIE promuj aktywnie

**Uzasadnienie:**
- Gość hotelowy to użytkownik **jednorazowy** (1–3 doby)
- Instalacja PWA na home screen wymaga kilku kroków na iOS (Share → Add to Home Screen)
- Większość gości nie instaluje aplikacji jednorazowego użytku
- **Kluczowa funkcjonalność (menu, zamówienia) działa bez instalacji**
- Jedyna istotna korzyść z instalacji to **push notyfikacje na iOS** — ale to rzadki requirement

**Kiedy warto:**
- Wielokrotni goście (program lojalnościowy)
- Długie pobyty (>1 tydzień)
- Goście którzy chcą śledzić status zamówień bez otwierania przeglądarki

### Różnice iOS vs Android przy instalacji

| Aspekt | Android | iOS |
|--------|---------|-----|
| Trigger instalacji | `beforeinstallprompt` event (JavaScript) | Brak — tylko ręczne Share menu |
| Wymagane przegl. | Chrome, Samsung, Edge, Firefox, Opera | Safari (+ iOS 16.4+: Chrome, Firefox, Edge przez Share) |
| Prompt | Automatyczny baner + custom UI możliwy | Brak — musisz pokazać instrukcję UI |
| Ikony | Z manifest.json | `apple-touch-icon` ma pierwszeństwo nad manifestem |
| Display mode | Pełne "standalone" | Standalone działa, ale pasek URL niewidoczny |
| Splash screen | Manifest `background_color` | Własny mechanizm Apple |
| Shortcuts | `shortcuts` w manifeście | Nie obsługiwane |

**Kluczowa różnica iOS — ikony:**
```html
<!-- iOS ignoruje manifest icons! Wymagane apple-touch-icon -->
<link rel="apple-touch-icon" href="/icons/apple-icon-180x180.png" />
<link rel="manifest" href="/manifest.json" />
```

**Custom install prompt na Android:**
```javascript
let deferredInstallPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Pokaż przycisk "Zainstaluj aplikację" tylko na Android
  showInstallBanner();
});

document.getElementById('install-btn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  // outcome: 'accepted' lub 'dismissed'
  deferredInstallPrompt = null;
});
```

**Na iOS** — musisz pokazać instrukcję manualną:
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;

if (isIOS && !isInStandaloneMode) {
  showIOSInstallInstructions(); 
  // "Dotknij Share, a następnie 'Dodaj do ekranu głównego'"
}
```

---

## iOS vs Android — różnice krytyczne

### Co Apple naprawił (historia 2023–2024)

| Wersja iOS | Zmiana |
|-----------|--------|
| **iOS 11.3** (2018) | Pierwsze service workers w Safari |
| **iOS 15.4** (2022) | Service workers stabilniejsze, Web Share API |
| **iOS 16.4** (marzec 2023) | **Web Push Notifications** dla installed PWAs (Add to Home Screen), Badging API, Manifest ID |
| **iOS 17** (wrzesień 2023) | Storage quota zwiększona do 60% dysku, lepsza stabilność PWA |
| **iOS 17.4** (luty 2024) | DMA compliance w EU — teoretycznie third-party browser engines, ale PWA w innych silnikach nadal ograniczone |
| **iOS 18** (wrzesień 2024) | Dalsze poprawki, Web Push dostępny globalnie bez DMA |

### Co jest NADAL broken/ograniczone na iOS (2025)

**Background APIs — krytyczne braki:**

| API | Android Chrome | iOS Safari |
|-----|---------------|-----------|
| Background Sync | Tak | NIE |
| Periodic Background Sync | Tak | NIE |
| Background Fetch | Tak | NIE |
| Push (w przeglądarce, bez install) | Tak | NIE |
| Push (po instalacji A2HS) | Tak | Tak (od iOS 16.4) |
| Web Share Target | Tak | Ograniczone |

**`beforeinstallprompt`** — nie istnieje na iOS. Nigdy nie będzie (Apple conscious decision).

**Chrome/Firefox na iOS** — nadal używają WebKit pod spodem (wymagane przez Apple). Oznacza to:
- Chrome na iOS = Safari engine
- Firefox na iOS = Safari engine
- Te przeglądarki mają te same ograniczenia co Safari iOS

**iOS Push Notifications — twarda zasada:**
```
PWA MUSI być zainstalowana (Add to Home Screen) żeby:
1. Żądać uprawnień do push
2. Otrzymywać push

Gość który tylko skanuje QR i otwiera w przeglądarce → ZERO push na iOS.
```

**Clipboard API** — na iOS wymaga gestu użytkownika w każdym wywołaniu.

**Web Bluetooth, USB, NFC** — niedostępne na iOS Safari.

### Porównanie kluczowych limitów

| Feature | Android Chrome | iOS Safari |
|---------|---------------|-----------|
| Service Workers | Tak | Tak (od iOS 11.3) |
| Cache API | Tak | Tak |
| IndexedDB | Tak | Tak |
| Push Notifications (installed) | Tak | Tak (iOS 16.4+) |
| Push Notifications (browser) | Tak | NIE |
| Background Sync | Tak | NIE |
| Web Bluetooth | Tak | NIE |
| Web NFC | Tak | NIE |
| Payment Request API | Tak | Tak |
| Camera API | Tak | Tak |
| Storage (60% dysku) | Tak | Tak (iOS 17+) |
| beforeinstallprompt | Tak | NIE |

### Ewikacja danych — różnica iOS

iOS Safari usuwa dane strony (IndexedDB, Cache Storage, Service Worker) jeśli **użytkownik nie miał interakcji z origin przez 7 dni**, gdy włączona jest ochrona Intelligent Tracking Prevention (ITP). 

Wyjątki:
- Persistent Storage (jeśli przyznane)
- Cookies ustawiane przez serwer (HTTP Set-Cookie)
- Installed PWAs (Home Screen) mają inne reguły

Dla hotel PWA: guest użyje aplikacji przez 1–3 dni → dane będą dostępne przez cały pobyt.

---

## Web Push Notifications

### Stan techniczny 2025

**Android Chrome:**
- Działa w przeglądarce (bez instalacji) od lat
- Wymaga zgody użytkownika (user gesture)
- Delivery rate: ~70–85% (na urządzeniach z dobrą baterią)
- Problem: aggressive battery optimization na tańszych Androidach (Xiaomi, OPPO, Realme) może blokować background delivery
- VAPID wymagany dla bezpieczeństwa

**iOS Safari (od iOS 16.4):**
- Wymaga **zainstalowanej PWA** (Add to Home Screen)
- Działa tylko w installed context, nie w przeglądarce
- Push Notification wymagane pokazanie user-visible notification (silent push = zabroniony)
- Użytkownik musi wyraźnie zaakceptować uprawnienie

### Wymagania techniczne

```javascript
// 1. Rejestracja Service Worker
const registration = await navigator.serviceWorker.register('/sw.js');

// 2. Sprawdź wsparcie
if (!('PushManager' in window)) {
  console.log('Push nie obsługiwany na tej platformie');
  return;
}

// 3. Żądaj uprawnienia (TYLKO w odpowiedzi na gest użytkownika)
document.getElementById('enable-notifications').addEventListener('click', async () => {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,  // WYMAGANE — silent push niedozwolony
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // Wyślij subscription na serwer
    await sendSubscriptionToServer(subscription);
  }
});

// 4. W Service Worker — obsługa push
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/app-icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url }
    })
  );
});
```

### Delivery rate — realia

| Platform | Delivery Rate | Uwagi |
|---------|--------------|-------|
| Android Chrome (standard) | 70–85% | Battery saver redukuje |
| Android (agresywna optymalizacja: Xiaomi, OPPO) | 30–60% | Wymaga whitelisting przez user |
| iOS (installed PWA) | 80–90% | Ale wymaga A2HS install |
| iOS (przeglądarka, bez install) | 0% | Nie możliwe |

### Opt-in rates — realia branżowe

- Typowy opt-in rate dla push na stronie: **5–15%**
- Dla zainstalowanej PWA (wyższe zaangażowanie): **20–40%**
- Dla hotel PWA przez QR bez instalacji: **bliżej 0% na iOS, ~5–10% na Android**

### Czy warto na MVP?

**Rekomendacja: NIE na MVP, rozważ w V2.**

Problemy:
1. iOS goście (prawdopodobnie 40–60% ruchu) = zero push bez instalacji
2. Android goście w przeglądarce = push możliwy, ale opt-in niski dla jednorazowego użytku
3. Implementacja push wymaga: VAPID setup, backend infrastructure, subscription management
4. Permission prompty psują UX jeśli pojawiają się za wcześnie

**Alternatywa na MVP:**
- **Polling co N sekund** dla statusu zamówień (simpler, works everywhere):
  ```javascript
  // Prosta alternatywa dla push — polling
  async function pollOrderStatus(orderId) {
    const response = await fetch(`/api/orders/${orderId}`);
    const order = await response.json();
    if (order.status !== lastKnownStatus) {
      showStatusUpdate(order.status);
      lastKnownStatus = order.status;
    }
  }
  setInterval(() => pollOrderStatus(currentOrderId), 10000); // co 10s
  ```
- **Server-Sent Events (SSE)** — jednokierunkowy streaming z serwera:
  ```javascript
  const eventSource = new EventSource(`/api/orders/${orderId}/events`);
  eventSource.onmessage = (event) => {
    const update = JSON.parse(event.data);
    showStatusUpdate(update.status);
  };
  ```
  SSE działa bez instalacji, na iOS i Android, nie wymaga uprawnień. Idealne dla hotel room service status.

---

## Rekomendacje dla naszego MVP

### Architektura dopasowana do kontekstu QR hotel

**Główna zasada: projektuj dla first-visit, no-install, flaky WiFi.**

```
Gość skanuje QR → Safari/Chrome otwiera URL → natychmiastowe ładowanie
Cel: działanie w 3G / słabym WiFi na 4-letnim telefonie
```

### Priorytety implementacyjne

**P0 — Must Have:**

1. **App Shell z precachingiem** — pierwsze załadowanie < 3 s na 3G
   - Cache: HTML, CSS, JS bundle, fonty, ikony hotelowe
   - Service Worker aktywny od pierwszej wizyty
   - Offline fallback page z komunikatem

2. **Network resilience** — obsługa błędów sieci na każdym endpointzie
   - Timeout na wszystkich fetch calls (5–8 s)
   - Retry logic dla GET requestów
   - Użytkownik widzi "Brak połączenia — spróbuj ponownie" zamiast pustego ekranu

3. **Performance budget:**
   - Initial JS bundle: < 150 KB gzipped
   - Images: WebP, lazy-loaded
   - LCP < 2.5 s (target), < 4 s (hard limit)
   - Nie używaj heavy framework jeśli nie konieczne

4. **Cachowanie statycznych danych hotelowych:**
   - Menu, usługi, godziny: Stale While Revalidate
   - Statyczne obrazy: Cache First
   - Dane pokoju gościa: Network First z fallback

5. **Cross-platform manifest (iOS + Android):**
   ```html
   <link rel="manifest" href="/manifest.json" />
   <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180x180.png" />
   <meta name="theme-color" content="#1a1a2e" />
   ```

**P1 — Should Have:**

6. **SSE dla statusu zamówień** — zamiast push notifications
   - Zero uprawnień, działa w przeglądarce, iOS + Android
   - Fallback do pollingu co 10 s jeśli SSE nie wspierane

7. **Custom offline page** z listą dostępnych funkcji offline
   - "Możesz przeglądać menu i usługi"
   - "Zamówienia wymagają połączenia"

8. **Progressive install prompt na Android** — dyskretny banner po 2+ wizytach
   - Nie agresywny, łatwy do odrzucenia
   - Treść: "Dodaj do ekranu głównego dla szybszego dostępu"

**P2 — Nice to Have (V2):**

9. **Push Notifications** — tylko po instalacji A2HS
   - Opt-in po złożeniu zamówienia: "Chcesz dostać powiadomienie gdy zamówienie będzie gotowe?"
   - Świadome zgody, nie spam
   - Backend: Firebase Cloud Messaging + VAPID

### Czego NIE robić na MVP

| Anty-pattern | Problem |
|-------------|---------|
| Wymuszanie instalacji A2HS przed użyciem | Gość rezygnuje |
| Push permission prompt przy wejściu | 90%+ odrzuceń, blokuje na zawsze |
| Cachowanie danych zamówień (POST) | Service Worker nie powinien cachować mutacji |
| Jeden JS bundle bez code splitting | 500 KB+ → 3–5 s na słabym urządzeniu |
| Brak offline fallback | Biała strona gdy WiFi spada → gość nie wraca |
| Zakładanie instalacji dla push | 99% gości NIE instaluje hotelowych PWA |

### Stack techniczny — rekomendacje

```
Service Worker: Workbox (Google) — gotowe strategie, mniej boilerplate
Build: Vite z rollup code splitting
Ikony: Maskable icons dla Android + apple-touch-icon dla iOS  
Push (V2): Web Push Protocol + VAPID, backend FCM lub własny VAPID server
Monitoring: Web Vitals library (https://github.com/GoogleChrome/web-vitals)
```

### Realistyczna matryca wsparcia features

| Feature | % gości hotelowych którzy skorzystają |
|---------|--------------------------------------|
| App Shell (cache) | 100% — przezroczysty |
| Offline menu browse | ~20% (niestabilny WiFi) |
| SSE status zamówień | 100% — przezroczysty |
| Add to Home Screen | < 5% gości (dobrowolnie) |
| Push notifications | < 3% gości (A2HS + zgoda) |

**Konkluzja:** Dla hotel PWA z QR kodem, kluczem jest szybkie pierwsze ładowanie i odporność na sieć — nie instalacja ani push notyfikacje. Zacznij od App Shell + Network Resilience + SSE, push dodaj w V2 z jasnym value proposition dla gości.

---

*Źródła:*
- [MDN — Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN — Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [MDN — Caching strategies](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [MDN — Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [MDN — PWA Best Practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices)
- [Apple Developer — Safari Release Notes](https://developer.apple.com/documentation/safari-release-notes)
