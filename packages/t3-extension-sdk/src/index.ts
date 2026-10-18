import type { ComponentType } from "react";
export const EXTENSION_API_VERSION = 1;

export interface TurnMeasurement {
  readonly startedAt: { readonly epochMilliseconds: number } | null;
  readonly completedAt: { readonly epochMilliseconds: number } | null;
  readonly turnTokenUsage?:
    | {
        readonly usageStatus: "complete" | "partial" | "unavailable";
        readonly outputTokens?: number | undefined;
        readonly inputTokens?: number | undefined;
      }
    | undefined;
}

export interface ExtensionThread {
  readonly thread: { readonly id: string; readonly projectId: string; readonly title: string };
  readonly providerTurns: ReadonlyArray<
    TurnMeasurement & { readonly id: string; readonly providerThreadId: string }
  >;
  readonly providerThreads: ReadonlyArray<{
    readonly id: string;
    readonly contextUsage?:
      | {
          readonly usedTokens: number;
          readonly outputTokens?: number | undefined;
          readonly totalProcessedTokens?: number | undefined;
        }
      | null
      | undefined;
  }>;
  readonly runs: ReadonlyArray<{ readonly id: string; readonly status: string }>;
}

export interface ExtensionWorkspace {
  readonly projects: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly workspaceRoot: string;
  }>;
  readonly threads: ReadonlyArray<{
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
  }>;
  readonly archivedThreads: ReadonlyArray<{
    readonly id: string;
    readonly projectId: string;
    readonly title: string;
  }>;
  readonly snapshotSequence: number;
}

export interface ProviderInstance {
  readonly driver: string;
  readonly displayName?: string | undefined;
  readonly enabled?: boolean | undefined;
  readonly environment?:
    | ReadonlyArray<{
        readonly name: string;
        readonly value: string;
        readonly sensitive: boolean;
        readonly valueRedacted?: boolean | undefined;
      }>
    | undefined;
  readonly config?: unknown;
}

export interface ExtensionServerConfig {
  readonly settings: { readonly providerInstances: Readonly<Record<string, ProviderInstance>> };
  readonly environment: { readonly environmentId: string; readonly label: string };
  readonly providers: ReadonlyArray<{ readonly instanceId: string; readonly driver: string }>;
}

export interface ExtensionObserver<T = unknown> {
  readonly next: (event: T) => void;
  readonly error: (error: unknown) => void;
}

export interface ExtensionApi {
  readonly getConfig: (input: Record<string, never>) => Promise<ExtensionServerConfig>;
  readonly updateSettings: (input: {
    readonly patch: Readonly<Record<string, unknown>>;
    readonly providerInstanceMutation?: Readonly<Record<string, unknown>>;
  }) => Promise<unknown>;
  readonly dispatch: (
    command: Readonly<Record<string, unknown>> & {
      readonly type: string;
      readonly commandId: string;
    },
  ) => Promise<{ readonly sequence: number }>;
  readonly getThread: (input: { readonly threadId: string }) => Promise<ExtensionThread>;
  readonly subscribeShell: (
    input: { readonly afterSequence?: number },
    observer: ExtensionObserver<{ readonly kind: string; readonly snapshot?: ExtensionWorkspace }>,
  ) => () => void;
  readonly subscribeThread: (
    input: { readonly threadId: string; readonly afterSequence?: number },
    observer: ExtensionObserver<{
      readonly kind: string;
      readonly projection?: ExtensionThread;
      readonly sequence?: number;
    }>,
  ) => () => void;
}

export interface ExtensionClientApi extends ExtensionApi {
  readonly subscribePermission: (
    operation: "dispatch" | "updateSettings",
    input: unknown,
    onChange: (allowed: boolean) => void,
  ) => () => void;
}

export interface ExtensionHost {
  readonly environments: ReadonlyArray<{
    readonly environmentId: string;
    readonly label: string;
    readonly connectionState: string;
  }>;
  readonly environmentId: string | null;
  readonly projectId: string | null;
  readonly threadId: string | null;
  readonly services: Readonly<Record<string, string>>;
  readonly api: (environmentId: string) => ExtensionClientApi;
  readonly openThread: (environmentId: string, threadId: string) => void;
}

export type ExtensionIcon = "workflow" | "issues" | "activity" | "settings";

export interface ExtensionDefinition {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly icon: ExtensionIcon;
  readonly load: () => Promise<{ default: ComponentType }>;
}

export function defineExtension<const T extends ExtensionDefinition>(extension: T): T {
  if (extension.id === "more" || !/^[a-z][a-z0-9.-]*$/.test(extension.id))
    throw new Error(`Invalid extension ID: ${extension.id}`);
  if (!["workflow", "issues", "activity", "settings"].includes(extension.icon))
    throw new Error(`Invalid extension icon: ${extension.icon}`);
  if (!extension.title.trim()) throw new Error(`Missing title for extension ${extension.id}`);
  if (typeof extension.load !== "function")
    throw new Error(`Missing loader for extension ${extension.id}`);
  return extension;
}

export function extensionRegistry(extensions: ReadonlyArray<ExtensionDefinition>) {
  const ids = new Set<string>();
  for (const extension of extensions) {
    defineExtension(extension);
    if (ids.has(extension.id)) throw new Error(`Duplicate extension ID: ${extension.id}`);
    ids.add(extension.id);
  }
  return [...extensions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function averageTurnOutputTokensPerSecond(turn: TurnMeasurement): number | null {
  const usage = turn.turnTokenUsage;
  if (
    usage?.usageStatus !== "complete" ||
    usage.outputTokens === undefined ||
    !turn.startedAt ||
    !turn.completedAt
  )
    return null;
  const elapsed = turn.completedAt.epochMilliseconds - turn.startedAt.epochMilliseconds;
  if (
    !Number.isFinite(usage.outputTokens) ||
    usage.outputTokens < 0 ||
    !Number.isFinite(elapsed) ||
    elapsed <= 0
  )
    return null;
  return usage.outputTokens / (elapsed / 1000);
}

export {
  createThread,
  getWorkspace,
  startTurn,
  interruptTurn,
  type CreateThreadInput,
} from "./operations.ts";
