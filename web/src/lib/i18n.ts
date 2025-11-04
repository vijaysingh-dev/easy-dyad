import { useMemo } from "react";
import i18n from "i18next";
import { useTranslation, initReactI18next } from "react-i18next";
import HttpBackend from "i18next-http-backend";

const language = localStorage.getItem("language") || "en";

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("language", lng);
});

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: language,
    fallbackLng: "en",
    supportedLngs: ["en", "ar"],
    interpolation: {
      escapeValue: false,
    },
    backend: {
      loadPath: "/locales/{{lng}}.json",
    },
  });

function applyDirection(language: string) {
  const isRTL = language === "ar";
  const html = document.documentElement;
  html.dir = isRTL ? "rtl" : "ltr";
  html.lang = language;
  html.classList.remove("rtl", "ltr");
  html.classList.add(isRTL ? "rtl" : "ltr");
}

// applyDirection(i18n.language);

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("language", lng);
  // applyDirection(lng);
});

export function useI18n() {
  const { t, i18n } = useTranslation();
  const dir = i18n.language === "ar" ? "rtl" : "ltr";
  return useMemo(() => ({ t, dir }), [t, dir]);
}

export default i18n;
