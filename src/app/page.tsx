'use client';

import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { useChatStore, type Conversation, type Message } from '@/lib/store';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { ChatArea } from '@/components/chat/chat-area';
import { ChatInput } from '@/components/chat/chat-input';
import { UserMenu } from '@/components/chat/user-menu';
import { ModelSelector } from '@/components/chat/model-selector';
import { PromptEditor } from '@/components/chat/prompt-editor';
import { SignUpPrompt } from '@/components/chat/signup-prompt';
import { AuthModal } from '@/components/auth/auth-modal';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Menu,
  Moon,
  Sun,
  Sparkles,
  LogIn,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const SIGNUP_PROMPT_MESSAGE_THRESHOLD = 6;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NDJSON Stream Reader
//  Parses structured events: { type: "chunk"|"done"|"error"|... }
//  Falls back to raw-text mode for backward compatibility.
//  Writes to store.streamingContent (O(1)) for minimal re-renders.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface StreamResult {
  content: string;
  error: string | null;
  model: string | null;
}

async function readStreamNDJSON(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  messageId: string,
  signal?: AbortSignal
): Promise<StreamResult> {
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let contentBuffer = '';
  let lastFlush = 0;
  const THROTTLE_MS = 50; // ~20fps UI updates
  let error: string | null = null;
  let model: string | null = null;

  const flush = () => {
    if (!contentBuffer) return;
    const store = useChatStore.getState();
    const existing = store.streamingContent[messageId] || '';
    store.setStreamingContent(messageId, existing + contentBuffer);
    contentBuffer = '';
  };

  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;

        // Try parsing as JSON (NDJSON event)
        let parsed: any;
        try {
          parsed = JSON.parse(line);
        } catch {
          // Not JSON — treat as raw text (backward compat)
          contentBuffer += line;
          const now = Date.now();
          if (now - lastFlush >= THROTTLE_MS) {
            flush();
            lastFlush = now;
          }
          continue;
        }

        // Handle structured events
        switch (parsed.type) {
          case 'thinking':
            // Backend acknowledged — keep thinking state (already set by caller)
            break;

          case 'chunk':
            // First chunk clears the thinking state
            useChatStore.getState().setStreamingThinking(messageId, false);
            contentBuffer += parsed.content || '';
            {
              const now = Date.now();
              if (now - lastFlush >= THROTTLE_MS) {
                flush();
                lastFlush = now;
              }
            }
            break;

          case 'upgrade':
            // Smart model finished — replace content with better response
            useChatStore.getState().setStreamingThinking(messageId, false);
            useChatStore.getState().setUpgrading(messageId, true);
            useChatStore.getState().setStreamingContent(messageId, parsed.content || '');
            contentBuffer = ''; // Clear buffer since content was replaced
            // Clear upgrading indicator after a brief flash
            setTimeout(() => {
              useChatStore.getState().clearUpgrading(messageId);
            }, 1500);
            break;

          case 'done':
            flush();
            model = parsed.model || null;
            break;

          case 'error':
            flush();
            useChatStore.getState().setStreamingThinking(messageId, false);
            error = parsed.message || 'Unknown error';
            break;

          case 'model_switch':
            // Could show notification in UI (future)
            break;

          default:
            if (parsed.content) {
              contentBuffer += parsed.content;
              const now = Date.now();
              if (now - lastFlush >= THROTTLE_MS) {
                flush();
                lastFlush = now;
              }
            }
        }
      }
    }

    // Final flush
    flush();
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      flush();
    }
    // AbortError: user cancelled or timeout — don't flush
  }

  return {
    content: useChatStore.getState().streamingContent[messageId] || '',
    error,
    model,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Home Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Home() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const {
    conversations,
    activeConversationId,
    isLoading,
    isGenerating,
    setConversations,
    setActiveConversation,
    setLoading,
    setGenerating,
    addConversation,
    removeConversation,
    setConversationMessages,
    addMessage,
    updateMessage,
    updateConversationTitle,
    removeLastAssistantMessage,
    selectedModel,
  } = useChatStore();

  const { theme, setTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [signupPromptDismissed, setSignupPromptDismissed] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const lastSendTimeRef = useRef(0);
  const DEBOUNCE_MS = 600;

  useEffect(() => {
    setMounted(true);
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const totalGuestMessages = useMemo(() => {
    if (isAuthenticated) return 0;
    return conversations.reduce(
      (sum, c) => sum + (c.messages?.length || 0),
      0
    );
  }, [conversations, isAuthenticated]);

  const showSignupPrompt = useMemo(() => {
    return (
      !isAuthenticated &&
      totalGuestMessages >= SIGNUP_PROMPT_MESSAGE_THRESHOLD &&
      !signupPromptDismissed
    );
  }, [isAuthenticated, totalGuestMessages, signupPromptDismissed]);

  // ── Load conversations from DB when user authenticates ──
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function loadConversations() {
      setLoading(true);
      try {
        const res = await fetch('/api/conversations');
        if (res.ok) {
          const data = await res.json();
          setConversations(data);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    loadConversations();
  }, [status, setConversations, setLoading]);

  // ── Load messages when active conversation changes ──
  useEffect(() => {
    if (!activeConversationId || !isAuthenticated) return;
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (activeConv?.messages && activeConv.messages.length > 0) return;
    if (activeConversationId.startsWith('guest-')) return;

    async function loadMessages() {
      setLoading(true);
      try {
        const res = await fetch(`/api/conversations/${activeConversationId}`);
        if (res.ok) {
          const data: Conversation & { messages: Message[] } = await res.json();
          setConversationMessages(data.id, data.messages || []);
          if (data.title && data.title !== 'New Chat') {
            updateConversationTitle(data.id, data.title);
          }
        }
      } catch {
        toast.error('Failed to load messages');
      } finally {
        setLoading(false);
      }
    }
    loadMessages();
  }, [activeConversationId, conversations, setConversationMessages, updateConversationTitle, setLoading, isAuthenticated]);

  // ── New chat ──
  const handleNewChat = useCallback(() => {
    if (isAuthenticated) {
      fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Failed');
        })
        .then((conversation) => {
          addConversation(conversation);
          setActiveConversation(conversation.id);
          setSidebarOpen(false);
        })
        .catch(() => {
          toast.error('Failed to create conversation');
        });
    } else {
      const guestId = `guest-${Date.now()}`;
      addConversation({
        id: guestId,
        title: 'New Chat',
        model: 'default',
        systemPrompt: '',
        userId: 'guest',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      });
      setActiveConversation(guestId);
      setSidebarOpen(false);
    }
  }, [isAuthenticated, addConversation, setActiveConversation]);

  // ── Abort any in-flight request ──
  const abortCurrentRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    sendingRef.current = false;
  }, []);

  // ── Cleanup AI placeholder on error ──
  const removePlaceholder = useCallback((convId: string, aiMsgId: string, prefixFilter?: string) => {
    const store = useChatStore.getState();
    const conv = store.conversations.find((cc) => cc.id === convId);
    if (conv?.messages) {
      const filtered = prefixFilter
        ? conv.messages.filter((m) => !m.id.startsWith(prefixFilter))
        : conv.messages.filter((m) => m.id !== aiMsgId);
      setConversationMessages(convId, filtered);
    }
    store.clearStreamingContent(aiMsgId);
    store.clearStreamingError(aiMsgId);
    store.clearStreamingThinking(aiMsgId);
    store.clearUpgrading(aiMsgId);
  }, [setConversationMessages]);

  // ── Process streaming response (NDJSON-aware) ──
  // Returns true if response completed successfully, false if aborted/empty/error
  const processStreamResponse = useCallback(async (
    res: Response,
    convId: string,
    aiMsgId: string,
    title?: string
  ): Promise<boolean> => {
    let finalContent = '';
    let streamError: string | null = null;

    if (res.body) {
      const reader = res.body.getReader();
      const result = await readStreamNDJSON(reader, aiMsgId, abortRef.current?.signal);
      finalContent = result.content;
      streamError = result.error;
    } else {
      try {
        const data = await res.json();
        finalContent = data.content || 'No response generated.';
      } catch {
        finalContent = 'No response generated.';
      }
    }

    const wasAborted = abortRef.current?.signal.aborted;

    // Handle error from stream
    if (streamError && !finalContent) {
      const store = useChatStore.getState();
      store.clearStreamingContent(aiMsgId);
      store.setStreamingError(aiMsgId, streamError);
      return false;
    }

    if (wasAborted) {
      useChatStore.getState().clearStreamingContent(aiMsgId);
      return false;
    }

    // FIX: Show error in message bubble when content is empty (instead of silently removing)
    if (!finalContent || !finalContent.trim()) {
      const store = useChatStore.getState();
      store.clearStreamingContent(aiMsgId);
      store.clearStreamingThinking(aiMsgId);
      store.clearUpgrading(aiMsgId);
      store.setStreamingError(aiMsgId, 'No response was generated. Please try again.');
      return false;
    }

    // Commit final content + cleanup ALL streaming states
    updateMessage(convId, aiMsgId, { content: finalContent });
    const store = useChatStore.getState();
    store.clearStreamingContent(aiMsgId);
    store.clearStreamingError(aiMsgId);
    store.clearStreamingThinking(aiMsgId);
    store.clearUpgrading(aiMsgId);

    // Auto-title from header
    const headerTitle = res.headers.get('x-title') || title || '';
    if (headerTitle) {
      const store = useChatStore.getState();
      const conv = store.conversations.find((c) => c.id === convId);
      if (conv && headerTitle !== conv.title) {
        updateConversationTitle(convId, headerTitle);
      }
    }

    return true;
  }, [updateMessage, updateConversationTitle]);

  // ── Show toast for send errors with retry ──
  const showSendError = useCallback((err: any, retryFn?: () => void) => {
    const msg = err?.name === 'AbortError'
      ? 'Request timed out.'
      : 'Network error.';

    const opts: any = { duration: 8000 };
    if (retryFn) {
      opts.action = {
        label: 'Retry',
        onClick: retryFn,
      };
    }

    toast.error(msg, opts);
  }, []);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Guest send
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleGuestSend = useCallback(
    async (content: string) => {
      if (sendingRef.current) return;

      let convId = activeConversationId;
      if (!convId) {
        convId = `guest-${Date.now()}`;
        addConversation({
          id: convId,
          title: 'New Chat',
          model: 'default',
          systemPrompt: '',
          userId: 'guest',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        });
        setActiveConversation(convId);
      }

      const userMsg: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(convId, userMsg);

      const aiMsgId = `msg-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      addMessage(convId, {
        id: aiMsgId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      });
      // Set thinking state immediately — instant UI feedback
      useChatStore.getState().setStreamingThinking(aiMsgId, true);

      sendingRef.current = true;
      setGenerating(true);
      abortCurrentRequest();
      const abort = new AbortController();
      abortRef.current = abort;
      const timeoutId = setTimeout(() => abort.abort(), 90000);

      const trySend = async () => {
        try {
          const store = useChatStore.getState();
          const conv = store.conversations.find((c) => c.id === convId);
          const historyMessages = (conv?.messages || [])
            .filter((m) => m.id !== aiMsgId)
            .map((m) => ({ role: m.role, content: m.content }));

          const currentModel = useChatStore.getState().selectedModel;
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: historyMessages, model: currentModel, systemPrompt: conv?.systemPrompt || '' }),
            signal: abort.signal,
          });

          if (!res.ok) {
            clearTimeout(timeoutId);
            const errData = await res.json().catch(() => ({}));
            if (res.status === 429) {
              const waitSec = errData.retryAfter || 60;
              toast.error(`Rate limited. Wait ${waitSec}s.`, { duration: waitSec * 1000 });
            } else {
              toast.error(errData.error || 'Failed to get a response', {
                action: {
                  label: 'Retry',
                  onClick: trySend,
                },
                duration: 8000,
              });
            }
            removePlaceholder(convId, aiMsgId);
            return;
          }

          const success = await processStreamResponse(res, convId, aiMsgId);
          if (!success) {
            // Check if it was a stream error (shown in bubble) — don't double-notify
            const err = useChatStore.getState().streamingError[aiMsgId];
            if (!err) {
              removePlaceholder(convId, aiMsgId);
            }
            return;
          }

          // Auto-title if still "New Chat"
          const store2 = useChatStore.getState();
          const convForTitle = store2.conversations.find((c) => c.id === convId);
          if (convForTitle && convForTitle.title === 'New Chat') {
            const t = content.length > 30 ? content.substring(0, 30) + '...' : content;
            updateConversationTitle(convId, t);
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          showSendError(err, trySend);
          removePlaceholder(convId, aiMsgId);
        } finally {
          clearTimeout(timeoutId);
          setGenerating(false);
          sendingRef.current = false;
        }
      };

      trySend();
    },
    [activeConversationId, addConversation, addMessage, setActiveConversation, setGenerating, abortCurrentRequest, processStreamResponse, updateConversationTitle, removePlaceholder, showSendError]
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Authenticated send
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleAuthSend = useCallback(
    async (content: string) => {
      if (sendingRef.current) return;

      let conversationId = activeConversationId;
      if (!conversationId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Chat' }),
          });
          if (!res.ok) {
            toast.error('Failed to create conversation');
            return;
          }
          const conversation = await res.json();
          conversationId = conversation.id;
          addConversation(conversation);
          setActiveConversation(conversationId);
        } catch {
          toast.error('Failed to create conversation');
          return;
        }
      }

      const tempAiId = `temp-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempUserMessage: Message = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(conversationId, tempUserMessage);
      addMessage(conversationId, {
        id: tempAiId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      });
      // Set thinking state immediately
      useChatStore.getState().setStreamingThinking(tempAiId, true);

      sendingRef.current = true;
      setGenerating(true);
      abortCurrentRequest();
      const abort = new AbortController();
      abortRef.current = abort;
      const timeoutId = setTimeout(() => abort.abort(), 90000);

      const trySend = async () => {
        try {
          const currentModel = useChatStore.getState().selectedModel;
          const res = await fetch(
            `/api/conversations/${conversationId}/messages`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content, model: currentModel }),
              signal: abort.signal,
            }
          );

          if (!res.ok) {
            clearTimeout(timeoutId);
            const errorData = await res.json().catch(() => null);
            if (res.status === 429) {
              const waitSec = errorData?.retryAfter || 60;
              toast.error(`Rate limited. Wait ${waitSec}s.`, { duration: waitSec * 1000 });
            } else {
              toast.error(errorData?.error || 'Failed to send message', {
                action: {
                  label: 'Retry',
                  onClick: trySend,
                },
                duration: 8000,
              });
            }
            removePlaceholder(conversationId, tempAiId, 'temp-assistant-');
            return;
          }

          const success = await processStreamResponse(res, conversationId, tempAiId);
          if (!success) {
            const err = useChatStore.getState().streamingError[tempAiId];
            if (!err) {
              removePlaceholder(conversationId, tempAiId, 'temp-assistant-');
            }
            return;
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          showSendError(err, trySend);
          removePlaceholder(conversationId, tempAiId, 'temp-assistant-');
        } finally {
          clearTimeout(timeoutId);
          setGenerating(false);
          sendingRef.current = false;
        }
      };

      trySend();
    },
    [
      activeConversationId,
      addConversation,
      addMessage,
      setActiveConversation,
      setGenerating,
      abortCurrentRequest,
      processStreamResponse,
      removePlaceholder,
      showSendError,
    ]
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (isGenerating) return;
      // Debounce: prevent rapid successive sends
      const now = Date.now();
      if (now - lastSendTimeRef.current < DEBOUNCE_MS) return;
      lastSendTimeRef.current = now;
      if (isAuthenticated) {
        await handleAuthSend(content);
      } else {
        await handleGuestSend(content);
      }
    },
    [isGenerating, isAuthenticated, handleAuthSend, handleGuestSend]
  );

  const handleSuggestionClick = useCallback(
    async (text: string) => {
      await handleSend(text);
    },
    [handleSend]
  );

  // ── Regenerate ──
  const handleRegenerate = useCallback(async () => {
    if (sendingRef.current) return;

    const convId = useChatStore.getState().activeConversationId;
    if (!convId) return;

    const conv = useChatStore.getState().conversations.find(c => c.id === convId);
    if (!conv?.messages?.length) return;
    const lastMsg = conv.messages[conv.messages.length - 1];
    if (lastMsg.role !== 'assistant') return;

    removeLastAssistantMessage(convId);

    const updatedConv = useChatStore.getState().conversations.find(c => c.id === convId);
    const lastUserMsg = [...(updatedConv?.messages || [])].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    const aiMsgId = `regen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addMessage(convId, {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    });
    useChatStore.getState().setStreamingThinking(aiMsgId, true);

    sendingRef.current = true;
    setGenerating(true);
    abortCurrentRequest();
    const abort = new AbortController();
    abortRef.current = abort;
    const timeoutId = setTimeout(() => abort.abort(), 90000);

    const tryRegen = async () => {
      try {
        let success = false;

        if (convId.startsWith('guest-')) {
          const historyMessages = (updatedConv?.messages || []).map(m => ({ role: m.role, content: m.content }));
          const currentModel = useChatStore.getState().selectedModel;
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: historyMessages, model: currentModel, systemPrompt: updatedConv?.systemPrompt || '' }),
            signal: abort.signal,
          });

          if (!res.ok) {
            clearTimeout(timeoutId);
            const errData = await res.json().catch(() => ({}));
            if (res.status === 429) {
              const waitSec = errData.retryAfter || 60;
              toast.error(`Rate limited. Wait ${waitSec}s.`, { duration: waitSec * 1000 });
            } else {
              toast.error(errData.error || 'Failed to regenerate', {
                action: { label: 'Retry', onClick: tryRegen },
                duration: 8000,
              });
            }
            removePlaceholder(convId, aiMsgId);
            return;
          }

          success = await processStreamResponse(res, convId, aiMsgId);
        } else {
          const currentModel = useChatStore.getState().selectedModel;
          const res = await fetch(`/api/conversations/${convId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: lastUserMsg.content, model: currentModel }),
            signal: abort.signal,
          });

          if (!res.ok) {
            clearTimeout(timeoutId);
            const errorData = await res.json().catch(() => null);
            if (res.status === 429) {
              const waitSec = errorData?.retryAfter || 60;
              toast.error(`Rate limited. Wait ${waitSec}s.`, { duration: waitSec * 1000 });
            } else {
              toast.error(errorData?.error || 'Failed to regenerate', {
                action: { label: 'Retry', onClick: tryRegen },
                duration: 8000,
              });
            }
            removePlaceholder(convId, aiMsgId);
            return;
          }

          success = await processStreamResponse(res, convId, aiMsgId);
        }

        if (!success) {
          const err = useChatStore.getState().streamingError[aiMsgId];
          if (!err) {
            removePlaceholder(convId, aiMsgId);
          }
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        showSendError(err, tryRegen);
        removePlaceholder(convId, aiMsgId);
      } finally {
        clearTimeout(timeoutId);
        setGenerating(false);
        sendingRef.current = false;
      }
    };

    tryRegen();
  }, [removeLastAssistantMessage, addMessage, setGenerating, abortCurrentRequest, processStreamResponse, removePlaceholder, showSendError]);

  // ── Delete conversation ──
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      if (id.startsWith('guest-')) {
        removeConversation(id);
        return;
      }
      try {
        const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toast.error('Failed to delete conversation');
          return;
        }
        removeConversation(id);
      } catch {
        toast.error('Network error. Failed to delete.');
      }
    },
    [removeConversation]
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  Render
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-6 w-32 mx-auto" />
            <Skeleton className="h-4 w-48 mx-auto" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="[height:100dvh] h-screen flex flex-col bg-background text-foreground">
      {/* Top Bar */}
      <header className="h-11 sm:h-13 flex items-center justify-between px-2.5 sm:px-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50 shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-4.5 w-4.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden md:flex h-9 w-9"
            onClick={() => setDesktopSidebarOpen((v) => !v)}
            title={desktopSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            {desktopSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeft className="h-5 w-5" />
            )}
          </Button>

          <div className="flex items-center gap-1.5">
            <div className="h-6 w-6 sm:h-7 sm:w-7 rounded-md sm:rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" />
            </div>
            <h1 className="font-semibold text-sm sm:text-base tracking-tight">
              NexusAI
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ModelSelector />

          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex items-center gap-2 h-8 px-3 text-sm"
            onClick={handleNewChat}
          >
            <Sparkles className="h-3.5 w-3.5" />
            New Chat
          </Button>

          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9"
              onClick={() =>
                setTheme(theme === 'dark' ? 'light' : 'dark')
              }
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              ) : (
                <Moon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </Button>
          )}

          {isAuthenticated ? (
            <UserMenu />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-1.5 h-8 sm:h-9 sm:px-3 text-xs sm:text-sm"
              onClick={() => setAuthModalOpen(true)}
            >
              <LogIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Sign in</span>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {desktopSidebarOpen && (
          <aside className="hidden md:flex w-64 lg:w-72 border-r bg-card/50 shrink-0 overflow-hidden">
            <div className="w-full h-full">
              <ChatSidebar onNewChat={handleNewChat} />
            </div>
          </aside>
        )}

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <ChatSidebar
              onNewChat={handleNewChat}
              onClose={() => setSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden pb-16 sm:pb-0">
          <PromptEditor conversationId={activeConversationId} />
          <ChatArea onSuggestionClick={handleSuggestionClick} onRegenerate={handleRegenerate} />

          <div className="px-4 sm:px-6 py-2 shrink-0">
            <SignUpPrompt
              visible={showSignupPrompt}
              onSignIn={() => setAuthModalOpen(true)}
              onDismiss={() => setSignupPromptDismissed(true)}
            />
          </div>

          {/* ChatInput is fixed on mobile, relative on desktop */}
          <ChatInput onSend={handleSend} />
        </main>
      </div>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} />
    </div>
  );
}
