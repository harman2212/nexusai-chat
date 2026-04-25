'use client';

import { Button } from '@/components/ui/button';
import { LogIn, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SignUpPromptProps {
  visible: boolean;
  onSignIn: () => void;
  onDismiss: () => void;
}

export function SignUpPrompt({ visible, onSignIn, onDismiss }: SignUpPromptProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="mx-auto max-w-2xl px-0.5 sm:px-0"
        >
          <div className="rounded-lg sm:rounded-xl border border-border bg-gradient-to-r from-emerald-500/5 to-teal-500/5 p-3 sm:p-4 flex items-start sm:items-center justify-between gap-2 sm:gap-3 flex-col sm:flex-row">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md sm:rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 mt-0.5">
                <LogIn className="h-4 w-4 text-white" />
              </div>
              <p className="text-xs sm:text-sm text-foreground leading-relaxed">
                <span className="font-medium">Enjoying the chat?</span>{' '}
                <span className="text-muted-foreground">
                  Sign in to save your conversation history and pick up where you left off.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-muted-foreground hover:text-foreground h-7 sm:h-8 px-2.5 sm:px-3 text-xs sm:text-sm"
              >
                Maybe later
              </Button>
              <Button
                size="sm"
                onClick={onSignIn}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium h-7 sm:h-8 px-3 sm:px-4 text-xs sm:text-sm"
              >
                Sign in
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
