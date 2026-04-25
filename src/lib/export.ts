import type { Conversation, Message } from '@/lib/store';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sanitizeFilename(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export function exportAsMarkdown(conversation: Conversation, messages: Message[]): string {
  const lines: string[] = [];

  lines.push(`# ${conversation.title}`);
  lines.push('');
  lines.push(`**Date:** ${formatDate(conversation.createdAt)}`);
  lines.push(`**Model:** ${conversation.model}`);
  if (conversation.systemPrompt) {
    lines.push(`**System Prompt:** ${conversation.systemPrompt}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of messages) {
    const role = message.role === 'user' ? '**You**' : '**NexusAI**';
    lines.push(`### ${role}`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push(`*Exported from NexusAI Chat on ${formatDate(new Date().toISOString())}*`);

  return lines.join('\n');
}

export function exportAsText(conversation: Conversation, messages: Message[]): string {
  const lines: string[] = [];

  lines.push(conversation.title);
  lines.push('='.repeat(conversation.title.length));
  lines.push('');
  lines.push(`Date: ${formatDate(conversation.createdAt)}`);
  lines.push(`Model: ${conversation.model}`);
  if (conversation.systemPrompt) {
    lines.push(`System Prompt: ${conversation.systemPrompt}`);
  }
  lines.push('');
  lines.push('-'.repeat(40));

  for (const message of messages) {
    const role = message.role === 'user' ? 'You' : 'NexusAI';
    lines.push('');
    lines.push(`[${role}]`);
    lines.push('');
    lines.push(message.content);
    lines.push('');
    lines.push('-'.repeat(40));
  }

  lines.push('');
  lines.push(`Exported from NexusAI Chat on ${formatDate(new Date().toISOString())}`);

  return lines.join('\n');
}

export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getExportFilename(conversation: Conversation, ext: string): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(conversation.title);
  return `nexusai-chat-${safeTitle}-${dateStr}.${ext}`;
}
