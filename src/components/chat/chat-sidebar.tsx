'use client';

import { useState, useMemo } from 'react';
import { useChatStore, type Conversation } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  Trash,
  Search,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ChatSidebarProps {
  onNewChat: () => void;
  onClose?: () => void;
}

export function ChatSidebar({ onNewChat, onClose }: ChatSidebarProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversation,
    removeConversation,
    clearAllConversations,
  } = useChatStore();
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((conv: Conversation) => {
      // Search in title
      if (conv.title.toLowerCase().includes(q)) return true;
      // Search in message content
      if (conv.messages?.some(m => m.content.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [conversations, searchQuery]);

  const handleDelete = async (id: string) => {
    if (id.startsWith('guest-')) {
      removeConversation(id);
      return;
    }
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      removeConversation(id);
    } catch {
      // Error handled silently
    }
  };

  const handleDeleteAll = async () => {
    setDeleteAllLoading(true);
    try {
      const hasAuthConversations = conversations.some((c) => !c.id.startsWith('guest-'));
      if (hasAuthConversations) {
        const res = await fetch('/api/conversations', { method: 'DELETE' });
        if (!res.ok) {
          toast.error('Failed to delete conversations');
          setDeleteAllLoading(false);
          return;
        }
      }
      clearAllConversations();
      toast.success('All chats deleted');
    } catch {
      toast.error('Failed to delete conversations');
    } finally {
      setDeleteAllLoading(false);
    }
  };

  const handleSelect = (id: string) => {
    setActiveConversation(id);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 flex items-center justify-between">
        <h2 className="font-semibold text-sm text-foreground">Chats</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNewChat}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 md:hidden"
            onClick={onClose}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full h-8 pl-8 pr-8 text-sm bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40 placeholder:text-muted-foreground/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Separator />

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'No matching conversations' : 'No conversations yet'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery ? 'Try a different search term' : 'Start a new chat to begin'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv: Conversation) => (
              <div
                key={conv.id}
                onClick={() => handleSelect(conv.id)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                  activeConversationId === conv.id
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {conv.title}
                  </p>
                  <p className="text-xs opacity-60 mt-0.5">
                    {formatDistanceToNow(new Date(conv.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{conv.title}&quot; and all its messages. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(conv.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer: Delete All button */}
      {conversations.length > 0 && (
        <>
          <Separator />
          <div className="p-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash className="h-4 w-4" />
                  Delete all chats
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all <strong>{conversations.length}</strong> conversation{conversations.length === 1 ? '' : 's'} and all messages. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteAllLoading}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAll}
                    disabled={deleteAllLoading}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteAllLoading ? 'Deleting...' : 'Delete all'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  );
}
