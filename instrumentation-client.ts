// Sentry jest ładowany poza ścieżką krytyczną, żeby jego browser SDK (~40 kB gzip)
// nie siedział w initial client runtime — statyczny import wciągał go do współdzielonego
// vendor chunka ładowanego na każdej trasie. tracesSampleRate i replay są zerowe, więc
// Sentry pełni tu wyłącznie rolę raportowania błędów; jedyny koszt odroczenia to błędy
// rzucone w pierwszych chwilach — te i tak przechwytują poniższe listenery, dociągając
// Sentry na żądanie.
let sentryPromise: Promise<typeof import('@sentry/nextjs')> | null = null;

function loadSentry() {
  if (!sentryPromise) {
    sentryPromise = import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        tracesSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        replaysSessionSampleRate: 0,
      });
      return Sentry;
    });
  }
  return sentryPromise;
}

if (typeof window !== 'undefined') {
  // Pomost na okno przed-init: pierwsze błędy przekazujemy ręcznie, po czym oddajemy
  // kontrolę globalnym handlerom Sentry (usunięcie naszych unika podwójnego przechwycenia,
  // gdy Sentry już żyje).
  const onError = (e: ErrorEvent) => forward(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => forward(e.reason);
  const detach = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
  function forward(value: unknown) {
    void loadSentry().then((Sentry) => {
      detach();
      Sentry.captureException(value);
    });
  }

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const idle = () => void loadSentry().then(detach);
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(idle);
  } else {
    window.setTimeout(idle, 2000);
  }
}

// Tracing jest wyłączony (tracesSampleRate: 0), więc hook przejść routera nie ma czego
// raportować — no-op utrzymuje kontrakt Next bez wciągania Sentry do initial.
export const onRouterTransitionStart = () => {};
