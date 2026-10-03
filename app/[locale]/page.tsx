import type { Metadata } from "next";
import { Suspense } from "react";
import { Playground } from "@/components/playground/playground";
import { PageIntro, Skeleton } from "@/components/ui";
import { getDict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return { title: { absolute: getDict(isLocale(locale) ? locale : "pt-BR").meta.title } };
}

export default async function PlaygroundPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  const dict = getDict(isLocale(locale) ? locale : "pt-BR");
  return (
    <>
      <PageIntro title={dict.playground.title} lead={dict.playground.lead} />
      <Suspense
        fallback={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[18.5rem_minmax(0,1fr)]" aria-busy="true">
            <Skeleton className="hidden h-[32rem] lg:block" />
            <div className="space-y-3">
              <Skeleton className="h-11" />
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          </div>
        }
      >
        <Playground />
      </Suspense>
    </>
  );
}
