// Thin typed wrapper over chrome.runtime messaging.

import type { RuntimeMessage } from './types';

export function sendMessage<T = unknown>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Best-effort send that swallows "receiving end does not exist" errors. */
export async function sendMessageSafe<T = unknown>(
  message: RuntimeMessage,
): Promise<T | undefined> {
  try {
    return await sendMessage<T>(message);
  } catch {
    return undefined;
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
