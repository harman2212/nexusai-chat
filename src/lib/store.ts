import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

interface ChatStore {
  // ── State ──
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  isGenerating: boolean;
  selectedModel: string;
  streamingContent: Record<string, string>;
  streamingError: Record<string, string>;
  streamingThinking: Record<string, boolean>;
  streamingUpgrading: Record<string, boolean>;

  // ── Actions ──
  setConversations: (conversations: Conversation[]) => void;
  clearAllConversations: () => void;
  setActiveConversation: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  addConversation: (conversation: Conversation) => void;
  removeConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  updateConversationSystemPrompt: (id: string, systemPrompt: string) => void;
  setConversationMessages: (conversationId: string, messages: Message[]) => void;
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  appendMessageContent: (conversationId: string, messageId: string, chunk: string) => void;
  setSelectedModel: (model: string) => void;
  removeLastAssistantMessage: (conversationId: string) => void;

  // Streaming helpers
  setStreamingContent: (messageId: string, content: string) => void;
  clearStreamingContent: (messageId: string) => void;
  setStreamingError: (messageId: string, error: string) => void;
  clearStreamingError: (messageId: string) => void;
  setStreamingThinking: (messageId: string, value: boolean) => void;
  clearStreamingThinking: (messageId: string) => void;
  setUpgrading: (messageId: string, value: boolean) => void;
  clearUpgrading: (messageId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeConversationId: null,
  isLoading: false,
  isGenerating: false,
  selectedModel: 'auto',
  streamingContent: {},
  streamingError: {},
  streamingThinking: {},
  streamingUpgrading: {},

  setConversations: (conversations) => set({ conversations }),
  clearAllConversations: () => set({ conversations: [], activeConversationId: null }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setGenerating: (generating) => set({ isGenerating: generating }),
  addConversation: (conversation) => set((s) => ({ conversations: [conversation, ...s.conversations] })),
  removeConversation: (id) => set((s) => ({
    conversations: s.conversations.filter((c) => c.id !== id),
    activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
  })),
  updateConversationTitle: (id, title) => set((s) => ({ conversations: s.conversations.map((c) => c.id === id ? { ...c, title } : c) })),
  updateConversationSystemPrompt: (id, sp) => set((s) => ({ conversations: s.conversations.map((c) => c.id === id ? { ...c, systemPrompt: sp } : c) })),
  setConversationMessages: (cid, messages) => set((s) => ({ conversations: s.conversations.map((c) => c.id === cid ? { ...c, messages } : c) })),
  addMessage: (cid, message) => set((s) => ({ conversations: s.conversations.map((c) => c.id === cid ? { ...c, messages: [...(c.messages || []), message] } : c) })),
  updateMessage: (cid, mid, updates) => set((s) => ({ conversations: s.conversations.map((c) => {
    if (c.id !== cid) return c;
    return { ...c, messages: c.messages?.map((m) => m.id === mid ? { ...m, ...updates } : m) };
  }) })),
  appendMessageContent: (cid, mid, chunk) => set((s) => ({ conversations: s.conversations.map((c) => {
    if (c.id !== cid) return c;
    return { ...c, messages: c.messages?.map((m) => m.id === mid ? { ...m, content: m.content + chunk } : m) };
  }) })),
  setSelectedModel: (model) => set({ selectedModel: model }),
  removeLastAssistantMessage: (cid) => set((s) => ({ conversations: s.conversations.map((c) => {
    if (c.id !== cid) return c;
    const msgs = c.messages || [];
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === 'assistant') return { ...c, messages: msgs.slice(0, -1) };
    return c;
  }) })),

  // Streaming content (O(1))
  setStreamingContent: (mid, content) => set((s) => ({ streamingContent: { ...s.streamingContent, [mid]: content } })),
  clearStreamingContent: (mid) => set((s) => { const { [mid]: _, ...r } = s.streamingContent; return { streamingContent: r }; }),
  setStreamingError: (mid, error) => set((s) => ({ streamingError: { ...s.streamingError, [mid]: error } })),
  clearStreamingError: (mid) => set((s) => { const { [mid]: _, ...r } = s.streamingError; return { streamingError: r }; }),

  // Thinking state (per-message)
  setStreamingThinking: (mid, value) => set((s) => ({ streamingThinking: { ...s.streamingThinking, [mid]: value } })),
  clearStreamingThinking: (mid) => set((s) => { const { [mid]: _, ...r } = s.streamingThinking; return { streamingThinking: r }; }),

  // Upgrade state (per-message)
  setUpgrading: (mid, value) => set((s) => ({ streamingUpgrading: { ...s.streamingUpgrading, [mid]: value } })),
  clearUpgrading: (mid) => set((s) => { const { [mid]: _, ...r } = s.streamingUpgrading; return { streamingUpgrading: r }; }),
}));
