/* eslint-disable @typescript-eslint/no-explicit-any */
// Minimal typings for the parts of BetterDiscord's global BdApi this plugin uses.
// See https://docs.betterdiscord.app/api

interface BdResponse {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

interface BdStore {
  addChangeListener(fn: () => void): void;
  removeChangeListener(fn: () => void): void;
  [method: string]: any;
}

declare const BdApi: {
  React: any;
  Data: {
    load(pluginName: string, key: string): any;
    save(pluginName: string, key: string, value: unknown): void;
  };
  Webpack: {
    getModule(filter: (m: any) => boolean, options?: { searchExports?: boolean }): any;
    getByKeys(...keys: string[]): any;
    getStore(name: string): BdStore | undefined;
  };
  Patcher: {
    after(caller: string, module: any, method: string, cb: (thisObj: any, args: any[], ret: any) => any): () => void;
    unpatchAll(caller: string): void;
  };
  Net: {
    fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; timeout?: number }): Promise<BdResponse>;
  };
  DOM: {
    addStyle(id: string, css: string): void;
    removeStyle(id: string): void;
  };
  UI: {
    showToast(message: string, options?: { type?: "info" | "success" | "warning" | "error" }): void;
  };
  Logger: {
    info(pluginName: string, ...args: unknown[]): void;
    warn(pluginName: string, ...args: unknown[]): void;
    error(pluginName: string, ...args: unknown[]): void;
  };
};
