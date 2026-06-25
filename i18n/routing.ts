import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pl', 'en'] as const,
  defaultLocale: 'pl',
  localePrefix: 'never',
});
