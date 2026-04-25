'use client';

import { memo, useState, useRef, useEffect, useMemo } from 'react';
import type { Message } from '@/lib/store';
import { useChatStore } from '@/lib/store';
import { Sparkles, User, Copy, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

// FIX: Completely removed react-syntax-highlighter — it loads ALL 200+ Prism language
// grammars (~3MB) into memory, causing "Aw, Snap!" Out of Memory crashes on BOTH
// mobile and desktop when code responses are rendered. Replaced with a lightweight
// native <pre> code block — zero dependencies, zero memory overhead.

const MemoizedCodeBlock = memo(function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Code copied to clipboard');
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Failed to copy code'); }
  };

  const lines = code.split('\n');
  const showLineNumbers = lines.length > 3;

  return (
    <div className="relative group rounded-lg overflow-hidden my-1.5 sm:my-2 border border-border">
      <div className="flex items-center justify-between px-2.5 sm:px-4 py-1.5 sm:py-2 bg-muted/80 border-b border-border">
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">{language}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 sm:h-6 px-1.5 sm:px-2 text-[11px] sm:text-xs text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-0.5 sm:mr-1" /> : <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-0.5 sm:mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div className="bg-[#282c34] overflow-x-auto">
        <pre className="p-3 sm:p-4 m-0 text-[0.7rem] sm:text-[0.8125rem] leading-[1.5] sm:leading-[1.6] font-mono text-[#abb2bf]">
          {showLineNumbers ? (
            <code>
              {lines.map((line, i) => (
                <div key={i} className="flex">
                  <span className="inline-block w-[2.5em] text-right pr-3 sm:pr-4 opacity-30 select-none shrink-0">{i + 1}</span>
                  <span className="flex-1 whitespace-pre">{line || ' '}</span>
                </div>
              ))}
            </code>
          ) : (
            <code className="whitespace-pre">{code}</code>
          )}
        </pre>
      </div>
    </div>
  );
});

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  isGenerating?: boolean;
  onRegenerate?: () => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  isLast,
  isGenerating,
  onRegenerate,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const msgRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); }, []);

  // O(1) reads — no full conversations scan
  const streamingContent = useChatStore((s) => s.streamingContent[message.id]);
  const streamingError = useChatStore((s) => s.streamingError[message.id]);
  const isThinking = useChatStore((s) => s.streamingThinking[message.id]);
  const isUpgrading = useChatStore((s) => s.streamingUpgrading[message.id]);

  const displayContent = message.content || streamingContent || '';
  const hasError = !!streamingError;
  const isActivelyStreaming = !!streamingContent && !isThinking;

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      toast.success('Response copied');
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Failed to copy'); }
  };

  // ── Thinking state ──
  const thinkingUI = useMemo(() => {
    if (isUser || !isThinking) return null;
    return (
      <div className="flex items-center gap-2.5 py-1">
        <div className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-sm text-muted-foreground">Thinking</span>
      </div>
    );
  }, [isUser, isThinking]);

  // ── Upgrading indicator ──
  const upgradingUI = useMemo(() => {
    if (isUser || !isUpgrading) return null;
    return (
      <div className="flex items-center gap-1.5 mt-2 py-1 px-2 -mx-2 rounded-md bg-emerald-500/5">
        <Sparkles className="h-3 w-3 text-emerald-500 animate-spin" />
        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Refining response...</span>
      </div>
    );
  }, [isUser, isUpgrading]);

  const renderedContent = useMemo(() => {
    if (isUser) {
      return (
        <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
          {displayContent}
        </p>
      );
    }
    if (!displayContent) return null;

    return (
      <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <ReactMarkdown
          components={{
            code({ className, children, node, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '');
              const codeString = String(children).replace(/\n$/, '');
              if (!match) {
                return (
                  <code className="bg-muted-foreground/10 px-1 py-0.5 rounded text-xs sm:text-sm font-mono" {...props}>
                    {children}
                  </code>
                );
              }
              return <MemoizedCodeBlock language={match[1]} code={codeString} />;
            },
            p({ children }) {
              return <p className="text-xs sm:text-sm leading-relaxed mb-1.5 sm:mb-2 last:mb-0">{children}</p>;
            },
            ul({ children }) {
              return <ul className="text-xs sm:text-sm list-disc pl-4 sm:pl-5 mb-1.5 sm:mb-2 space-y-0.5 sm:space-y-1">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="text-xs sm:text-sm list-decimal pl-4 sm:pl-5 mb-1.5 sm:mb-2 space-y-0.5 sm:space-y-1">{children}</ol>;
            },
            h1({ children }) { return <h1 className="text-base sm:text-lg font-bold mb-1.5 sm:mb-2">{children}</h1>; },
            h2({ children }) { return <h2 className="text-sm sm:text-base font-bold mb-1.5 sm:mb-2">{children}</h2>; },
            h3({ children }) { return <h3 className="text-xs sm:text-sm font-bold mb-1">{children}</h3>; },
            blockquote({ children }) {
              return (
                <blockquote className="border-l-2 border-emerald-500 pl-2.5 sm:pl-3 my-1.5 sm:my-2 text-xs sm:text-sm text-muted-foreground italic">
                  {children}
                </blockquote>
              );
            },
            a({ children, href }) {
              const safeHref = href && (href.startsWith('http') || href.startsWith('mailto:')) ? href : '#';
              return (
                <a href={safeHref} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-600 underline text-xs sm:text-sm">
                  {children}
                </a>
              );
            },
          }}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
    );
  }, [isUser, displayContent]);

  const timestamp = useMemo(
    () => new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    [message.createdAt]
  );

  const showRegenerate = !isUser && isLast && !isGenerating && !!displayContent && !hasError && !isUpgrading && !!onRegenerate;

  return (
    <div className={`flex gap-2 sm:gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className="shrink-0">
        {isUser ? (
          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-primary flex items-center justify-center">
            <User className="h-3 w-3 sm:h-4 sm:w-4 text-primary-foreground" />
          </div>
        ) : (
          <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
          </div>
        )}
      </div>

      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          ref={msgRef}
          className={`max-w-[90%] sm:max-w-[75%] rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-3 ${
            isUser ? 'bg-primary text-primary-foreground rounded-tr-md' : 'bg-muted rounded-tl-md'
          }`}
        >
          {/* Thinking state */}
          {thinkingUI}

          {/* Rendered content */}
          {renderedContent}

          {/* Typing cursor during active streaming */}
          {isActivelyStreaming && (
            <span className="inline-block w-[2px] h-[1em] bg-current animate-pulse ml-0.5 align-text-bottom" />
          )}

          {/* Upgrading indicator */}
          {upgradingUI}

          {/* Error state */}
          {hasError && (
            <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-destructive">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span className="flex-1">{streamingError}</span>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="inline-flex items-center gap-1 text-xs font-medium hover:text-destructive/80 transition-colors px-2 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions row */}
        {!isUser && (displayContent || hasError) && (
          <div className="flex items-center gap-0.5 sm:gap-1 mt-1 px-0.5 sm:px-1 text-muted-foreground/60">
            {!hasError && (
              <button
                onClick={handleCopyMessage}
                className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] hover:text-foreground transition-colors px-1 sm:px-1.5 py-0.5 rounded hover:bg-muted"
              >
                {copied ? <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> : <Copy className="h-2.5 w-2.5 sm:h-3 sm:w-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            {showRegenerate && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] hover:text-foreground transition-colors px-1 sm:px-1.5 py-0.5 rounded hover:bg-muted"
              >
                <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                Regenerate
              </button>
            )}
            <span className="text-[10px] sm:text-[11px] text-muted-foreground/40 ml-0.5 sm:ml-1">{timestamp}</span>
          </div>
        )}

        {isUser && (
          <p className="text-[10px] sm:text-[11px] text-muted-foreground/40 mt-1 px-0.5 sm:px-1 text-right">{timestamp}</p>
        )}
      </div>
    </div>
  );
});
