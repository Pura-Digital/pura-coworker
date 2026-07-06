// Collapsible "thinking" block — Claude extended thinking display
import { Suspense, lazy, useState, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import { PanelErrorBoundary } from '../PanelErrorBoundary';
import { ToolUseBlock } from './ToolUseBlock';
import { getMcpServerName, getToolChipLabel } from './toolHelpers';
import type { ContentBlock, Message, ThinkingContent, ToolUseContent } from '../../types';

const MessageMarkdown = lazy(() =>
  import('../MessageMarkdown').then((module) => ({ default: module.MessageMarkdown }))
);

// Render **bold** markers in thinking preview text.
// Only handles double-asterisk bold to avoid false positives with single * in math/code.
function renderThinkingPreview(raw: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push(raw.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={key++} className="font-semibold not-italic">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) {
    parts.push(raw.slice(lastIndex));
  }
  return parts;
}

function ThinkingToolChips({ tools }: { tools: ToolUseContent[] }) {
  const { toolLabels, connectors } = useMemo(() => {
    const labels = new Set<string>();
    const servers = new Set<string>();

    for (const tool of tools) {
      labels.add(getToolChipLabel(tool.name));
      const server = getMcpServerName(tool.name);
      if (server) servers.add(server);
    }

    return {
      toolLabels: [...labels],
      connectors: [...servers],
    };
  }, [tools]);

  if (toolLabels.length === 0 && connectors.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
      {toolLabels.map((label) => (
        <span
          key={`tool-${label}`}
          className="px-1.5 py-0.5 text-[10px] rounded-full bg-surface-muted text-text-secondary font-mono truncate max-w-[140px]"
          title={label}
        >
          {label}
        </span>
      ))}
      {connectors.map((connector) => (
        <span
          key={`connector-${connector}`}
          className="px-1.5 py-0.5 text-[10px] rounded-full bg-mcp/15 text-mcp font-medium truncate max-w-[140px]"
          title={connector}
        >
          {connector}
        </span>
      ))}
    </div>
  );
}

interface ThinkingBlockProps {
  block: ThinkingContent;
  toolBlocks?: ToolUseContent[];
  allBlocks?: ContentBlock[];
  message?: Message;
  inStack?: boolean;
}

export const ThinkingBlock = memo(function ThinkingBlock({
  block,
  toolBlocks = [],
  allBlocks,
  message,
  inStack = false,
}: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const text = block.thinking || '';
  const hasTools = toolBlocks.length > 0;

  if (!text && !hasTools) return null;

  // Preview: first ~80 chars, clean up broken ** markers from truncation
  let preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
  // Strip a trailing unclosed ** that truncation may have created
  preview = preview.replace(/\*{1,2}(?:\.{3})?$/, (m) => {
    // Keep the ... suffix if present, just remove the dangling asterisks
    return m.endsWith('...') ? '...' : '';
  });
  const previewNodes = renderThinkingPreview(preview);
  const showPreview = !expanded && text && !hasTools;

  return (
    <div
      className={`${inStack ? 'rounded-xl' : 'rounded-2xl'} border border-border-subtle bg-background/40 overflow-hidden`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover/50 transition-colors"
      >
        {!inStack && (
          <>
            <Brain className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            <span className="text-xs font-medium text-text-muted flex-shrink-0">
              {t('messageCard.thinking')}
            </span>
          </>
        )}
        {hasTools && <ThinkingToolChips tools={toolBlocks} />}
        {showPreview && (
          <span className="text-[11px] text-text-muted/60 truncate flex-1 min-w-0 italic">
            {previewNodes}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-3 space-y-2 animate-fade-in">
          {text && (
            <div className="text-sm text-text-secondary leading-relaxed prose-chat max-w-none">
              <PanelErrorBoundary
                name="ThinkingMarkdown"
                fallback={<div className="whitespace-pre-wrap">{text}</div>}
              >
                <Suspense fallback={<div className="whitespace-pre-wrap">{text}</div>}>
                  <MessageMarkdown normalizedText={text} />
                </Suspense>
              </PanelErrorBoundary>
            </div>
          )}

          {hasTools && (
            <div className="space-y-1.5">
              {toolBlocks.map((toolBlock) => (
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
      )}
    </div>
  );
});
