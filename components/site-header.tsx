"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCorpus } from "@/lib/corpus-store";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useDict, useLocale } from "@/lib/locale-context";
import { cx } from "./ui";

import { REPO_URL } from "@/lib/site";

function Logo() {
  // Three ranked bars: the shape of a result list.
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden>
      <rect x="2" y="3" width="16" height="3" rx="1" fill="var(--accent)" />
      <rect x="2" y="8.5" width="11" height="3" rx="1" fill="var(--accent)" opacity="0.7" />
      <rect x="2" y="14" width="6" height="3" rx="1" fill="var(--accent)" opacity="0.45" />
    </svg>
  );
}

function swapLocale(pathname: string, locale: Locale): string {
  const parts = pathname.split("/");
  parts[1] = locale;
  return parts.join("/") || `/${locale}`;
}

function LanguageLinks({ withQuery }: { withQuery: boolean }) {
  const pathname = usePathname();
  const current = useLocale();
  const dict = useDict();
  return (
    <nav
      aria-label={dict.nav.language}
      className="flex rounded-md border border-line-strong p-0.5 font-mono text-[0.72rem]"
    >
      {LOCALES.map((locale) => (
        <LanguageLink key={locale} locale={locale} current={current} pathname={pathname} withQuery={withQuery} />
      ))}
    </nav>
  );
}

function LanguageLink({
  locale,
  current,
  pathname,
  withQuery,
}: {
  locale: Locale;
  current: Locale;
  pathname: string;
  withQuery: boolean;
}) {
  const label = locale === "pt-BR" ? "PT" : "EN";
  const active = locale === current;
  const base = swapLocale(pathname, locale);
  return withQuery ? (
    <QueryAwareLink href={base} active={active} label={label} lang={locale} />
  ) : (
    <LocaleAnchor href={base} active={active} label={label} lang={locale} />
  );
}

function QueryAwareLink(props: { href: string; active: boolean; label: string; lang: string }) {
  const search = useSearchParams().toString();
  return <LocaleAnchor {...props} href={search ? `${props.href}?${search}` : props.href} />;
}

function LocaleAnchor({ href, active, label, lang }: { href: string; active: boolean; label: string; lang: string }) {
  return (
    <Link
      href={href}
      hrefLang={lang}
      lang={lang}
      aria-current={active ? "true" : undefined}
      className={cx("rounded px-2 py-1", active ? "bg-raised text-fg" : "text-muted hover:text-fg")}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const dict = useDict();
  const locale = useLocale();
  const pathname = usePathname();
  const { source } = useCorpus();
  const links = [
    { href: `/${locale}`, label: dict.nav.playground },
    { href: `/${locale}/experiments`, label: dict.nav.experiments },
    { href: `/${locale}/corpus`, label: dict.nav.corpus },
  ];
  return (
    <header className="border-b border-line bg-bg/95">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        {dict.nav.skip}
      </a>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={`/${locale}`} className="flex items-center gap-2 font-semibold tracking-tight text-fg">
          <Logo />
          <span>Retrieval Lab</span>
        </Link>
        <nav
          aria-label={dict.nav.main}
          className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto"
        >
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "rounded-md px-3 py-1.5 text-[0.88rem] font-medium whitespace-nowrap",
                  active ? "bg-raised text-fg shadow-[inset_0_-2px_0_var(--accent)]" : "text-muted hover:text-fg",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/${locale}/corpus`}
            className="hidden items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-[0.72rem] text-muted hover:text-fg md:flex"
          >
            <span
              className={cx("size-1.5 rounded-full", source.kind === "nimbus" ? "bg-accent" : "bg-vec")}
              aria-hidden
            />
            {source.kind === "nimbus" ? dict.corpusBadge.nimbus : dict.corpusBadge.custom} ·{" "}
            {dict.corpusBadge.docs(source.docs.length)}
          </Link>
          <Suspense fallback={<LanguageLinks withQuery={false} />}>
            <LanguageLinks withQuery />
          </Suspense>
          <a href={REPO_URL} className="text-muted hover:text-fg" aria-label={dict.nav.source}>
            <svg viewBox="0 0 16 16" className="size-5" fill="currentColor" aria-hidden>
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
