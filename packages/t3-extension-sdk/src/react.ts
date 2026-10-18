import { createContext, createElement, use, type ReactNode } from "react";
import type { ExtensionHost } from "./index.ts";

const HostContext = createContext<ExtensionHost | null>(null);

export function ExtensionHostProvider(props: { host: ExtensionHost; children: ReactNode }) {
  return createElement(HostContext.Provider, { value: props.host }, props.children);
}

export function useExtensionHost(): ExtensionHost {
  const host = use(HostContext);
  if (!host) throw new Error("Extension screens must run inside a T3 extension host.");
  return host;
}

export * from "./index.ts";
