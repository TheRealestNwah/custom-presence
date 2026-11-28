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
  /** BetterDiscord's own settings components; they follow Discord's theme. onChange gets the value, not the event. */
  Components: {
    SettingItem: any;
    SettingGroup: any;
    SwitchInput: any;
    TextInput: any;
    DropdownInput: any;
    Button: any & {
      Colors: Record<"BRAND" | "BLURPLE" | "RED" | "GREEN" | "YELLOW" | "PRIMARY" | "LINK" | "WHITE" | "TRANSPARENT", string>;
      Looks: Record<"FILLED" | "OUTLINED" | "LINK" | "BLANK", string>;
      Sizes: Record<"NONE" | "TINY" | "SMALL" | "MEDIUM" | "LARGE" | "ICON", string>;
    };
  };
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
