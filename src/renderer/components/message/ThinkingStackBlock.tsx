import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { ThinkingBlock } from './ThinkingBlock';
import type { ContentBlock, Message } from '../../types';
import type { ThinkingGroupItem } from '../../utils/message-content-groups';

interface ThinkingStackBlockProps {
  groups: ThinkingGroupItem[];
  allBlocks?: ContentBlock[];
  message?: Message;
}

export const ThinkingStackBlock = memo(function ThinkingStackBlock({
  groups,
  allBlocks,
  message,
}: ThinkingStackBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (groups.length === 0) return null;

  return (
    <div className={expanded ? 'space-y-1' : undefined}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-1 px-0.5 text-left hover:opacity-80 transition-opacity"
        aria-expanded={expanded}
        aria-label={t('messageCard.thinkingCount', { count: groups.length })}
      >
        <span className="relative flex-shrink-0 mr-1.5 mb-1">
          <Brain className="w-4 h-4 text-text-muted" />
          <span className="absolute -bottom-2.5 -left-2.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-[9px] leading-none text-white font-semibold tabular-nums flex items-center justify-center ring-2 ring-background">
            {groups.length}
          </span>
        </span>
        <span className="text-xs font-medium text-text-muted">
          {t('messageCard.thinking')}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 pl-0.5 animate-fade-in">
          {groups.map((group) => (
            <ThinkingBlock
              key={group.key}
              block={group.thinking}
              toolBlocks={group.tools}
              allBlocks={allBlocks}
              message={message}
              inStack
            />
          ))}
        </div>
      )}
    </div>
  );
});
