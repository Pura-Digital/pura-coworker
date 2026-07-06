import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { ToolUseBlock } from './ToolUseBlock';
import type { ContentBlock, Message, ToolUseContent } from '../../types';

interface ToolStackBlockProps {
  tools: ToolUseContent[];
  allBlocks?: ContentBlock[];
  message?: Message;
}

export const ToolStackBlock = memo(function ToolStackBlock({
  tools,
  allBlocks,
  message,
}: ToolStackBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  return (
    <div className={expanded ? 'space-y-1' : undefined}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 py-1 px-0.5 text-left hover:opacity-80 transition-opacity"
        aria-expanded={expanded}
        aria-label={t('messageCard.toolsCount', { count: tools.length })}
      >
        <span className="relative flex-shrink-0 mr-1.5 mb-1">
          <Terminal className="w-4 h-4 text-text-muted" />
          <span className="absolute -bottom-2.5 -left-2.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-accent text-[9px] leading-none text-white font-semibold tabular-nums flex items-center justify-center ring-2 ring-background">
            {tools.length}
          </span>
        </span>
        <span className="text-xs font-medium text-text-muted">
          {t('messageCard.tools')}
        </span>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="space-y-1.5 pl-0.5 animate-fade-in">
          {tools.map((toolBlock) => (
            <ToolUseBlock
              key={toolBlock.id}
              block={toolBlock}
              allBlocks={allBlocks}
              message={message}
              nested
            />
          ))}
        </div>
      )}
    </div>
  );
});
