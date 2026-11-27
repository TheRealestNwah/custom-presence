// The small slice of the WebExtension API this extension uses.

interface BrowserPort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (message: unknown) => void): void };
  onDisconnect: { addListener(fn: (port: BrowserPort) => void): void };
  error?: { message: string } | null;
}

interface BrowserTab {
  id?: number;
  incognito: boolean;
  url?: string;
}

interface BrowserMessageSender {
  tab?: BrowserTab;
}

declare const browser: {
  runtime: {
    connectNative(application: string): BrowserPort;
    sendMessage(message: unknown): Promise<unknown>;
    onMessage: { addListener(fn: (message: unknown, sender: BrowserMessageSender) => void): void };
    lastError?: { message: string } | null;
  };
  tabs: {
    onRemoved: { addListener(fn: (tabId: number) => void): void };
  };
};
