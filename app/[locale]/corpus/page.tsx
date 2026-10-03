import type { Metadata } from "next";
import { Suspense } from "react";
import { CorpusView } from "@/components/corpus/corpus-view";
import { PageIntro, Skeleton } from "@/components/ui";
import { getDict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/corpus">): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDict(isLocale(locale) ? locale : "pt-BR").corpus.title };
}

export default async function CorpusPage({ params }: PageProps<"/[locale]/corpus">) {
  const { locale } = await params;
  const dict = getDict(isLocale(locale) ? locale : "pt-BR");
  return (
    <>
      <PageIntro title={dict.corpus.title} lead={dict.corpus.lead} />
      <Suspense
        fallback={
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]" aria-busy="true">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <CorpusView />
      </Suspense>
    </>
  );
}
