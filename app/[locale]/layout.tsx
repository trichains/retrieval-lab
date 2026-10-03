import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { REPO_URL } from "@/lib/site";
import { CorpusProvider } from "@/lib/corpus-store";
import { getDict, isLocale, LOCALES } from "@/lib/i18n";
import { LocaleProvider } from "@/lib/locale-context";
import "../globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDict(isLocale(locale) ? locale : "pt-BR");
  return {
    title: { default: dict.meta.title, template: "%s · Retrieval Lab" },
    description: dict.meta.description,
    alternates: { languages: { "pt-BR": "/pt-BR", en: "/en" } },
  };
}

export const viewport: Viewport = { themeColor: "#0a0d10", colorScheme: "dark" };

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDict(locale);
  return (
    <html lang={locale} className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <LocaleProvider locale={locale}>
          <CorpusProvider>
            <SiteHeader />
            <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
              {children}
            </main>
            <footer className="border-t border-line">
              <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-5 text-[0.8rem] text-faint sm:px-6 md:flex-row md:justify-between">
                <p>{dict.footer.privacy}</p>
                <p>
                  {dict.footer.dataset}{" "}
                  <a className="underline decoration-line-strong underline-offset-2 hover:text-fg" href={REPO_URL}>
                    {dict.footer.license}
                  </a>
                </p>
              </div>
            </footer>
          </CorpusProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
