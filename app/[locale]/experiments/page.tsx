import type { Metadata } from "next";
import { Suspense } from "react";
import { Experiments } from "@/components/experiments/experiments";
import { PageIntro, Skeleton } from "@/components/ui";
import { getDict, isLocale } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/experiments">): Promise<Metadata> {
  const { locale } = await params;
  return { title: getDict(isLocale(locale) ? locale : "pt-BR").experiments.title };
}

export default async function ExperimentsPage({ params }: PageProps<"/[locale]/experiments">) {
  const { locale } = await params;
  const dict = getDict(isLocale(locale) ? locale : "pt-BR");
  return (
    <>
      <PageIntro title={dict.experiments.title} lead={dict.experiments.lead} />
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-32" />
            <Skeleton className="h-80" />
          </div>
        }
      >
        <Experiments />
      </Suspense>
    </>
  );
}
