'use client';

import { useState, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store';
import { Settings2, ChevronDown, ChevronUp, Save, Loader2 } from 'lucide-react';

interface PromptEditorProps {
  conversationId: string | null;
}

export function PromptEditor({ conversationId }: PromptEditorProps) {
  const { conversations, updateConversationSystemPrompt } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const activeConversation = conversations.find(
    (c) => c.id === conversationId
  );

  // Sync prompt only when switching conversations, not on every store change
  useEffect(() => {
    if (activeConversation) {
      setPrompt(activeConversation.systemPrompt || '');
    }
  }, [conversationId, activeConversation?.systemPrompt]);

  const handleSave = useCallback(async () => {
    if (!conversationId) return;

    // Guest conversations: save in-memory only
    if (conversationId.startsWith('guest-')) {
      updateConversationSystemPrompt(conversationId, prompt);
      toast.success('System prompt updated');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: prompt }),
      });

      if (!res.ok) {
        toast.error('Failed to save system prompt');
        return;
      }

      updateConversationSystemPrompt(conversationId, prompt);
      toast.success('System prompt saved');
    } catch {
      toast.error('Failed to save system prompt');
    } finally {
      setSaving(false);
    }
  }, [conversationId, prompt, updateConversationSystemPrompt]);

  // Hide system prompt editor on mobile — too cluttered
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!conversationId || !activeConversation) return null;
  if (isMobile) return null;

  return (
    <div className="border-b bg-card/50 shrink-0 overflow-hidden">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm hover:bg-muted/50 transition-colors min-h-[36px] sm:min-h-[40px]"
      >
        <span className="flex items-center gap-1.5 sm:gap-2 text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          <span>System Prompt</span>
          {activeConversation.systemPrompt && (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        )}
      </button>

      {/* Editor panel — scrollable on mobile */}
      {isOpen && (
        <div className="px-3 sm:px-4 pb-2.5 sm:pb-3 space-y-1.5 sm:space-y-2 max-h-[40vh] overflow-y-auto">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Customize how the AI responds... e.g., You are a coding expert. Always explain your reasoning step by step."
            className="min-h-[60px] sm:min-h-[80px] max-h-[200px] text-xs sm:text-sm resize-none"
            rows={2}
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] text-muted-foreground">
              {prompt.length} / 2000
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || prompt.length > 2000}
              className="h-7 px-2.5 sm:px-3 text-[11px] sm:text-xs bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Save className="h-3 w-3 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
