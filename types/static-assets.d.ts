// Deklaracje modułów dla importów statycznych obrazów (import hero from '@/public/images/hero.jpg').
// Normalnie dostarcza je next-env.d.ts przez tę samą referencję, ale next-env.d.ts jest
// git-ignorowany i generowany dopiero przy `next build` — job `tsc --noEmit` w CI nie buduje,
// więc bez tego pliku import .jpg pada na TS2307. Referencja celuje w pakiet `next` (dostępny po
// `npm ci`), nie w artefakt buildu; lokalnie łączy się z next-env.d.ts bez konfliktu (ten sam typ).
/// <reference types="next/image-types/global" />
