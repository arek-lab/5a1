import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type Locale = (typeof routing.locales)[number];

function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (routing.locales as readonly string[]).includes(value);
}

function localeFromAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) return undefined;
  const tags = header.split(',').map((part) => part.split(';')[0].trim().toLowerCase());
  for (const tag of tags) {
    const primary = tag.split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return undefined;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!isLocale(locale)) {
    const cookieLocale = (await cookies()).get('NEXT_LOCALE')?.value;
    locale = isLocale(cookieLocale) ? cookieLocale : undefined;
  }

  if (!isLocale(locale)) {
    const acceptLanguage = (await headers()).get('accept-language');
    locale = localeFromAcceptLanguage(acceptLanguage);
  }

  if (!isLocale(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
