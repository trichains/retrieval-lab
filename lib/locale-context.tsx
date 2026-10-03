"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getDict, type Dict, type Locale } from "./i18n";

const LocaleContext = createContext<Locale>("pt-BR");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useDict(): Dict {
  return getDict(useContext(LocaleContext));
}
