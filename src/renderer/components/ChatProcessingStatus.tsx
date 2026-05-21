import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PROCESSING_KEY_COUNT = 50;

export const CHAT_PROCESSING_I18N_KEYS = Array.from(
  { length: PROCESSING_KEY_COUNT },
  (_, i) => `chat.processing-${i + 1}` as const,
);

type ChatProcessingStatusProps = {
  className?: string;
};

function pickRandomKey(exclude?: string): string {
  const pool = CHAT_PROCESSING_I18N_KEYS;
  let next = pool[Math.floor(Math.random() * pool.length)]!;
  let guard = 0;
  while (exclude && next === exclude && guard++ < 12) {
    next = pool[Math.floor(Math.random() * pool.length)]!;
  }
  return next;
}

/**
 * Rotating status line for the chat “processing” pill: random i18n phrase every 5s.
 */
export function ChatProcessingStatus({ className }: ChatProcessingStatusProps) {
  const { t } = useTranslation();
  const [i18nKey, setI18nKey] = useState(() => pickRandomKey());

  useEffect(() => {
    const id = window.setInterval(() => {
      setI18nKey((prev) => pickRandomKey(prev));
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={['prose-chat max-w-none text-text-primary', className].filter(Boolean).join(' ')}
      aria-live="polite"
    >
      {t(i18nKey)}
    </span>
  );
}
