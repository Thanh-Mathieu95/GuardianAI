"use client";
import { createContext, useContext, useEffect, useState } from "react";
export type Locale = "vi" | "en";
const Context = createContext({ locale: "vi" as Locale, setLocale: (_: Locale) => {} });
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>("vi");
  useEffect(() => {
    const query = new URLSearchParams(location.search).get("lang");
    try { setLocale(query === "en" || query === "vi" ? query : localStorage.getItem("guardian-language") === "en" ? "en" : "vi"); } catch {}
  }, []);
  const choose = (value: Locale) => { setLocale(value); try { localStorage.setItem("guardian-language", value); } catch {} };
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  return <Context.Provider value={{ locale, setLocale: choose }}>{children}</Context.Provider>;
}
export function useLanguage() {
  const { locale, setLocale } = useContext(Context);
  return { locale, setLocale, t: (vi: string, en: string) => locale === "vi" ? vi : en };
}
export function LanguageSwitch() {
  const { locale, setLocale } = useLanguage();
  return <div className="language-switch" aria-label="Language / Ngôn ngữ"><button lang="vi" aria-pressed={locale === "vi"} onClick={() => setLocale("vi")}>VI</button><button lang="en" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button></div>;
}
