import { ArrowUp, Loader2 } from 'lucide-react';

type ChatSendButtonProps = {
  disabled?: boolean;
  isSubmitting?: boolean;
  title: string;
};

export function ChatSendButton({ disabled = false, isSubmitting = false, title }: ChatSendButtonProps) {
  const isEmpty = disabled && !isSubmitting;

  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      title={title}
      aria-label={title}
      className={`chat-send-fab shrink-0 ${isEmpty ? 'chat-send-fab--inactive' : ''}`}
    >
      {isSubmitting ? (
        <Loader2 className="relative z-10 h-4 w-4 animate-spin" strokeWidth={2.25} />
      ) : (
        <ArrowUp className="relative z-10 h-4 w-4" strokeWidth={2.5} />
      )}
    </button>
  );
}
