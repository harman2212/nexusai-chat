'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { ChevronDown, Cpu, Zap, Brain, Shield, Sparkles } from 'lucide-react';

const MODELS = [
  {
    id: 'auto',
    name: 'Auto',
    desc: 'Smart routing',
    icon: Sparkles,
    color: 'text-emerald-500',
  },
  {
    id: 'llama-3.1-8b-instant',
    name: 'Llama 8B',
    desc: 'Fast',
    icon: Zap,
    color: 'text-emerald-500',
  },
  {
    id: 'gemma2-9b-it',
    name: 'Gemma 9B',
    desc: 'Balanced',
    icon: Shield,
    color: 'text-blue-500',
  },
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 70B',
    desc: 'Smart',
    icon: Brain,
    color: 'text-purple-500',
  },
  {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    desc: 'Advanced',
    icon: Cpu,
    color: 'text-amber-500',
  },
];

export function ModelSelector() {
  const { selectedModel, setSelectedModel } = useChatStore();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentModel = MODELS.find((m) => m.id === selectedModel) || MODELS[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-7 sm:h-8 px-2 sm:px-3 rounded-md sm:rounded-lg bg-muted/50 border border-border hover:bg-muted transition-colors text-xs sm:text-sm"
      >
        <currentModel.icon className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${currentModel.color}`} />
        <span className="hidden sm:inline font-medium text-xs sm:text-sm">{currentModel.name}</span>
        <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2">
            {MODELS.map((model) => {
              const Icon = model.icon;
              return (
                <button
                  key={model.id}
                  onClick={() => { setSelectedModel(model.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    selectedModel === model.id ? 'bg-primary/10 text-foreground' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${model.color}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{model.name}</p>
                    <p className="text-[11px] opacity-60">{model.desc}</p>
                  </div>
                  {selectedModel === model.id && (
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
