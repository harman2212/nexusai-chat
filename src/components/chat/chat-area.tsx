'use client';

import { useRef, useEffect, useMemo } from 'react';
import { useChatStore, type Message, type Conversation } from '@/lib/store';
import { MessageBubble } from './message-bubble';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sparkles,
  Code,
  Lightbulb,
  BookOpen,
  FileDown,
  FileText,
  Zap,
  Brain,
  Shield,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  exportAsMarkdown,
  exportAsText,
  downloadFile,
  getExportFilename,
} from '@/lib/export';

interface ChatAreaProps {
  onSuggestionClick: (text: string) => void;
  onRegenerate?: () => void;
}

const suggestions = [
  {
    text: 'Write a Python function',
    icon: Code,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
  },
  {
    text: 'Explain quantum computing',
    icon: BookOpen,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    text: 'Help me brainstorm ideas',
    icon: Lightbulb,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    text: 'What is machine learning?',
    icon: Sparkles,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
  },
];

const features = [
  {
    icon: Brain,
    label: 'Smart Routing',
    desc: 'Automatically selects the best AI model for your query',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    icon: Zap,
    label: 'Instant Responses',
    desc: 'Streaming-first architecture for real-time results',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Shield,
    label: 'Reliable Fallbacks',
    desc: 'Seamless failover across multiple models',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
];

export function ChatArea({ onSuggestionClick, onRegenerate }: ChatAreaProps) {
  const {
    conversations,
    activeConversationId,
    isLoading,
    isGenerating,
  } = useChatStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Memoize active conversation to prevent unnecessary re-renders
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );
  const messages = activeConversation?.messages || [];
  const messagesLength = messages.length;

  // ── Auto-scroll on new messages or when generation starts/stops ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesLength, isGenerating]);

  // ── Continuous scroll during streaming via rAF ──
  // Does NOT depend on `messages` array — only length + isGenerating.
  // The rAF loop runs continuously while generating, no re-trigger needed.
  useEffect(() => {
    if (!isGenerating || messagesLength === 0) return;

    const lastMsg = messages[messagesLength - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    const container = bottomRef.current;
    if (!container) return;

    let rafId: number;
    const scroll = () => {
      // Only scroll if user is near bottom (don't force-scroll if they scrolled up)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      rafId = requestAnimationFrame(scroll);
    };
    rafId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(rafId);
  }, [messagesLength, isGenerating]); // ← No `messages` dep — prevents re-run on every chunk

  const handleExportMarkdown = () => {
    if (!activeConversation || messages.length === 0) return;
    try {
      const content = exportAsMarkdown(activeConversation, messages);
      const filename = getExportFilename(activeConversation, 'md');
      downloadFile(content, filename, 'text/markdown');
      toast.success('Chat exported as Markdown');
    } catch {
      toast.error('Failed to export chat');
    }
  };

  const handleExportText = () => {
    if (!activeConversation || messages.length === 0) return;
    try {
      const content = exportAsText(activeConversation, messages);
      const filename = getExportFilename(activeConversation, 'txt');
      downloadFile(content, filename, 'text/plain');
      toast.success('Chat exported as Text');
    } catch {
      toast.error('Failed to export chat');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-20 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Welcome screen
  if (!activeConversationId || messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col p-3 sm:p-4 md:p-6 pb-20 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg text-center my-auto mx-auto"
        >
          <div className="mb-3 sm:mb-5 md:mb-8">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-1.5 sm:mb-3 md:mb-4">
              <Sparkles className="h-5 w-5 sm:h-7 sm:w-7 md:h-8 md:w-8 text-white" />
            </div>
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
              NexusAI Chat
            </h1>
            <p className="text-muted-foreground mt-0.5 sm:mt-1.5 md:mt-2 text-[11px] sm:text-xs md:text-sm max-w-sm mx-auto">
              Powered by intelligent multi-model orchestration
            </p>
          </div>

          {/* Feature cards — 3 columns on all screen sizes */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2 md:gap-3 mb-3 sm:mb-5 md:mb-8">
            {features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center gap-0.5 sm:gap-1.5 md:gap-2 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-border bg-card/50"
                >
                  <div className={`p-1.5 sm:p-2 md:p-2.5 rounded-md sm:rounded-lg ${feature.bg}`}>
                    <FeatureIcon className={`h-4 w-4 sm:h-4 sm:w-4 md:h-5 md:w-5 ${feature.color}`} />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] sm:text-[11px] md:text-xs font-semibold text-foreground">
                      {feature.label}
                    </p>
                    <p className="text-[9px] sm:text-[10px] md:text-[11px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">
                      {feature.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Suggestion prompts */}
          <div className="space-y-1.5 sm:space-y-2">
            <p className="hidden sm:block text-[10px] sm:text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Try asking
            </p>
            <div className="grid grid-cols-2 gap-2 sm:gap-2 md:gap-3">
              {suggestions.map((suggestion) => (
                <motion.button
                  key={suggestion.text}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onSuggestionClick(suggestion.text)}
                  className="flex items-center gap-2 sm:gap-2.5 md:gap-3 p-2 sm:p-3 md:p-4 rounded-lg sm:rounded-xl border border-border bg-card hover:bg-accent transition-colors text-left"
                >
                  <div
                    className={`p-1.5 sm:p-2 md:p-2 rounded-md sm:rounded-lg ${suggestion.bg}`}
                  >
                    <suggestion.icon
                      className={`h-3.5 w-3.5 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 ${suggestion.color}`}
                    />
                  </div>
                  <span className="text-[11px] sm:text-xs md:text-sm font-medium text-foreground">
                    {suggestion.text}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Messages view
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Chat header with conversation title + export */}
      {activeConversation && messages.length > 0 && (
        <div className="flex items-center justify-between px-3 sm:px-6 py-1.5 sm:py-2 border-b bg-background/50">
          <h2 className="text-xs sm:text-sm font-medium text-foreground truncate">
            {activeConversation.title}
          </h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5 text-xs">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportMarkdown}>
                <FileText className="h-4 w-4 mr-2" />
                Export as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportText}>
                <FileText className="h-4 w-4 mr-2" />
                Export as Text
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Messages */}
      <div ref={bottomRef} className="flex-1 overflow-y-auto overscroll-y-contain pb-14 sm:pb-4">
        <div className="max-w-3xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6">
          {messages.map((message: Message, index: number) => {
            const isLastAssistant =
              message.role === 'assistant' && index === messages.length - 1;

            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: index === messagesLength - 1 && !isGenerating ? 0.05 : 0 }}
              >
                <MessageBubble
                  message={message}
                  isLast={isLastAssistant}
                  isGenerating={isGenerating}
                  onRegenerate={isLastAssistant ? onRegenerate : undefined}
                />
              </motion.div>
            );
          })}

          {/* Typing indicator — only when last message is user (AI hasn't started streaming yet) */}
          {isGenerating &&
            messages[messages.length - 1]?.role === 'user' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="shrink-0">
                  <div className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                  </div>
                </div>
                <div className="bg-muted rounded-xl sm:rounded-2xl rounded-tl-md px-3 sm:px-4 py-2 sm:py-3">
                  <div className="flex gap-1 sm:gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </motion.div>
            )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  );
}
