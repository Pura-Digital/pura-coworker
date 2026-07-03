import { useTranslation } from 'react-i18next';
import { AidenLogoLoader } from './AidenLogoLoader';

type ChatLoadingViewProps = {
  label?: string;
};

export function ChatLoadingView({ label }: ChatLoadingViewProps) {
  const { t } = useTranslation();
  const text = label ?? t('chat.loadingConversation');

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <AidenLogoLoader decorative className="h-10 w-10 shrink-0 overflow-visible" />
      <span className="sr-only">{text}</span>
    </div>
  );
}
