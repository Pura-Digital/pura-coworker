import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import itTranslations from './locales/it.json';
import zhTranslations from './locales/zh.json';

i18n
  .use(LanguageDetector) // Auto-detect browser language
  .use(initReactI18next) // Initialize react-i18next
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      it: {
        translation: itTranslations,
      },
      zh: {
        translation: zhTranslations,
      },
    },
    fallbackLng: 'it', // Default language
    supportedLngs: ['it', 'en', 'zh'], // Supported languages
    interpolation: {
      escapeValue: false, // React already handles XSS escaping
    },
    pluralSeparator: '_', // Plural separator
    contextSeparator: '_', // Context separator
    detection: {
      order: ['localStorage', 'navigator'], // Check localStorage first, then browser language
      caches: ['localStorage'], // Persist language choice in localStorage
      lookupLocalStorage: 'i18nextLng', // localStorage key
    },
  });

export default i18n;
