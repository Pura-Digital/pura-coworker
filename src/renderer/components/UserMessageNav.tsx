import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { List } from 'lucide-react';
import type { Message, ContentBlock } from '../types';

export type UserMessageNavItem = {
  id: string;
  preview: string;
};

type UserMessageNavProps = {
  items: UserMessageNavItem[];
  /** User message "anchor": last one whose top is at/above scroll viewport center (first hit going up from center). */
  activeMessageId?: string | null;
  /** Floating: over message list, popover opens left of rail. Inline: popover above rail (e.g. composer). */
  layout?: 'floating' | 'inline';
};

const MESSAGE_ANCHOR_PREFIX = 'chat-message-';

function getContentBlocks(message: Message): ContentBlock[] {
  const rawContent = message.content as unknown;
  return Array.isArray(rawContent)
    ? (rawContent as ContentBlock[])
    : [{ type: 'text', text: String(rawContent ?? '') } as ContentBlock];
}

export function buildUserMessageNavItems(messages: Message[], t: TFunction): UserMessageNavItem[] {
  const maxLen = 200;
  const out: UserMessageNavItem[] = [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const parts: string[] = [];
    for (const block of getContentBlocks(m)) {
      if (block.type === 'text' && block.text.trim()) {
        parts.push(block.text.trim().replace(/\s+/g, ' '));
      } else if (block.type === 'image') {
        parts.push(t('chat.userMessageNav.imageTag'));
      } else if (block.type === 'file_attachment') {
        parts.push(block.filename);
      }
    }
    const joined = parts.join(' · ');
    let preview = joined.slice(0, maxLen);
    if (joined.length > maxLen) preview += '…';
    if (!preview) preview = t('chat.userMessageNav.emptyPreview');
    out.push({ id: m.id, preview });
  }
  return out;
}

export function scrollToUserMessage(messageId: string) {
  const el = document.getElementById(`${MESSAGE_ANCHOR_PREFIX}${messageId}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function UserMessageNav({ items, layout = 'floating', activeMessageId = null }: UserMessageNavProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [finePointerHover, setFinePointerHover] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const onChange = () => setFinePointerHover(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (finePointerHover || !menuOpen) return;
    const close = (e: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [finePointerHover, menuOpen]);

  const clearHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const jump = useCallback(
    (id: string) => {
      scrollToUserMessage(id);
      if (!finePointerHover) setMenuOpen(false);
    },
    [finePointerHover]
  );

  useEffect(() => () => clearHoverClose(), [clearHoverClose]);

  if (items.length === 0) return null;

  const maxStackPx = 160;
  const gapPx = items.length > 24 ? 2 : items.length > 14 ? 3 : 4;

  const handlePointerEnter = () => {
    clearHoverClose();
    if (finePointerHover) setMenuOpen(true);
  };

  const handlePointerLeave = () => {
    if (!finePointerHover) return;
    clearHoverClose();
    hoverCloseTimer.current = setTimeout(() => setMenuOpen(false), layout === 'floating' ? 200 : 140);
  };

  const popoverClassName =
    layout === 'floating'
      ? 'absolute z-50 w-[min(18rem,calc(100vw-3rem))] max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-border-muted bg-surface py-2 shadow-lg right-full mr-2 top-1/2 -translate-y-1/2'
      : 'absolute bottom-full right-0 z-50 w-[min(18rem,calc(100vw-2rem))] max-h-56 overflow-y-auto rounded-2xl border border-border-muted bg-surface py-2 shadow-lg pb-3 -mb-1';

  return (
    <div
      ref={rootRef}
      className="relative shrink-0 flex flex-row items-end gap-1"
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
    >
      {menuOpen && (
        <div
          className={popoverClassName}
          role="menu"
          aria-label={t('chat.userMessageNav.menuLabel')}
        >
          <ul className="px-1.5 space-y-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="menuitem"
                  className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors line-clamp-2 ${
                    item.id === activeMessageId
                      ? 'text-accent bg-surface-hover/80'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                  title={item.preview}
                  onClick={() => jump(item.id)}
                >
                  {item.preview}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!finePointerHover && (
        <button
          type="button"
          className="mb-0.5 w-8 h-8 rounded-full flex items-center justify-center text-accent hover:text-accent-hover hover:bg-surface-hover/50 transition-colors shrink-0"
          aria-expanded={menuOpen}
          aria-label={t('chat.userMessageNav.toggleMenu')}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <List className="w-4 h-4" />
        </button>
      )}

      <div
        role="navigation"
        aria-label={t('chat.userMessageNav.railLabel', { count: items.length })}
        className="flex flex-col items-center px-0.5 py-1.5"
        style={{
          gap: gapPx,
          maxHeight: maxStackPx,
          overflowY: items.length > 40 ? 'auto' : 'visible',
        }}
      >
        {items.map((item) => {
          const active = item.id === activeMessageId;
          return (
          <button
            key={item.id}
            type="button"
            className={`w-2.5 h-[2px] shrink-0 rounded-full bg-current transition-colors ${
              active
                ? 'text-accent hover:text-accent-hover'
                : 'text-text-primary hover:text-text-secondary'
            }`}
            title={item.preview}
            aria-label={t('chat.userMessageNav.jumpTo', {
              preview: item.preview.length > 120 ? `${item.preview.slice(0, 120)}…` : item.preview,
            })}
            aria-current={active ? 'true' : undefined}
            onClick={(e) => {
              e.stopPropagation();
              jump(item.id);
            }}
          />
          );
        })}
      </div>
    </div>
  );
}

export const userMessageAnchorId = (messageId: string) => `${MESSAGE_ANCHOR_PREFIX}${messageId}`;
