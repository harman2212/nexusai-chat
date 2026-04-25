'use client';

import { useRef, useState, useCallback, KeyboardEvent, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { SendHorizonal, CornerDownLeft, Mic, MicOff } from 'lucide-react';
import { useChatStore } from '@/lib/store';
import { toast } from 'sonner';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const MAX_CHARS = 2000;
const WARN_THRESHOLD = 1500;

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isGenerating } = useChatStore();
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check browser support
  const [speechSupported, setSpeechSupported] = useState(false);
  useEffect(() => {
    setSpeechSupported(
      typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    );
  }, []);

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isNearLimit = charCount > WARN_THRESHOLD;
  const canSend = value.trim().length > 0 && !isOverLimit && !disabled && !isGenerating;

  const handleSend = useCallback(() => {
    if (isOverLimit) {
      toast.error(`Message too long (${charCount}/${MAX_CHARS} chars). Shorten it.`);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || disabled || isGenerating) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, disabled, isGenerating, onSend, isOverLimit, charCount]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Speech recognition not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setValue(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast.error('Voice input failed. Try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    toast.success('Listening... Speak now');
  }, [isListening]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:relative sm:z-auto pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-3xl mx-auto p-2 sm:p-3 md:p-4">
        <div className="relative flex items-end gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-border bg-muted/50 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Type your message..."
            disabled={disabled || isGenerating}
            className="flex-1 resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-2.5 sm:p-3 md:p-4 min-h-[40px] sm:min-h-[44px] max-h-[200px] text-[13px] sm:text-sm placeholder:text-muted-foreground/60"
            rows={1}
          />
          <div className="flex items-center gap-1 p-1.5 sm:p-2">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={disabled || isGenerating}
                className={`inline-flex items-center justify-center h-8 w-8 sm:h-8 sm:w-8 rounded-md sm:rounded-lg shrink-0 transition-all ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                } disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none`}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                {isListening ? (
                  <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                ) : (
                  <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </button>
            )}
            {!isGenerating && value.trim() && (
              <span className="hidden sm:inline-flex items-center text-[11px] text-muted-foreground/50 gap-1 mr-1">
                <CornerDownLeft className="h-3 w-3" />
                Enter
              </span>
            )}
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="inline-flex items-center justify-center h-8 w-8 sm:h-8 sm:w-8 rounded-md sm:rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              <SendHorizonal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          </div>
        </div>
        <div className="hidden sm:flex items-center justify-between mt-1.5 sm:mt-2">
          <p className="text-[10px] sm:text-[11px] text-muted-foreground/50">
            AI may produce inaccurate information. Verify important facts.
          </p>
          {isNearLimit && (
            <p
              className={`text-[11px] font-medium ${
                isOverLimit
                  ? 'text-destructive'
                  : 'text-amber-500'
              }`}
            >
              {charCount}/{MAX_CHARS}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
