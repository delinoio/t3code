import {
  OrchestrationV2Command,
  ServerSettingsPatch,
  ProviderInstanceMutation,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { ORCHESTRATION_V2_WS_METHODS as V2, WS_METHODS, EnvironmentId } from "@t3tools/contracts";
import type * as EnvironmentRegistry from "@t3tools/client-runtime/connection";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentSubscriptionAtomFamily,
  executeAtomQuery,
} from "@t3tools/client-runtime/state/runtime";
import { subscribe } from "@t3tools/client-runtime/rpc";
import { AsyncResult, type Atom, type AtomRegistry } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { ExtensionApi, ExtensionClientApi } from "./index.ts";

const decodeSettings = Schema.decodeUnknownSync(
  Schema.Struct({
    patch: ServerSettingsPatch,
    providerInstanceMutation: Schema.optionalKey(ProviderInstanceMutation),
  }),
);
const decodeCommand = Schema.decodeUnknownSync(OrchestrationV2Command);

const hostApis = new WeakMap<object, WeakMap<object, Map<string, ExtensionClientApi>>>();

export function createExtensionApi<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry.EnvironmentRegistry | R, E>,
  registry: AtomRegistry.AtomRegistry,
  environment: string,
): ExtensionClientApi {
  let registries = hostApis.get(runtime);
  if (!registries) hostApis.set(runtime, (registries = new WeakMap()));
  let apis = registries.get(registry);
  if (!apis) registries.set(registry, (apis = new Map()));
  const cached = apis.get(environment);
  if (cached) return cached;
  const environmentId = EnvironmentId.make(environment);
  const config = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "extensions:config",
    tag: WS_METHODS.serverGetConfig,
  });
  const thread = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "extensions:thread",
    tag: V2.getThreadProjection,
  });
  const dispatch = createEnvironmentRpcCommand(runtime, {
    label: "extensions:dispatch",
    tag: V2.dispatchCommand,
  });
  const settings = createEnvironmentRpcCommand(runtime, {
    label: "extensions:settings",
    tag: WS_METHODS.serverUpdateSettings,
  });
  const shellStream = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "extensions:shell",
    subscribe: (input: Parameters<ExtensionApi["subscribeShell"]>[0]) =>
      subscribe(V2.subscribeShell, input),
    idleTtlMs: 0,
  });
  const threadStream = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "extensions:thread-stream",
    subscribe: (input: Parameters<ExtensionApi["subscribeThread"]>[0]) =>
      subscribe(V2.subscribeThread, { ...input, threadId: ThreadId.make(input.threadId) }),
    idleTtlMs: 0,
  });
  const value = <A, E>(result: AsyncResult.Success<A, E> | AsyncResult.Failure<A, E>): A => {
    if (AsyncResult.isSuccess(result)) return result.value;
    throw new Error(Cause.pretty(result.cause));
  };
  const observe = <A, E>(
    atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
    observer: { next: (value: A) => void; error: (error: unknown) => void },
  ) =>
    registry.subscribe(
      atom,
      (result) => {
        if (AsyncResult.isSuccess(result)) observer.next(result.value);
        else if (AsyncResult.isFailure(result))
          observer.error(new Error(Cause.pretty(result.cause)));
      },
      { immediate: true },
    );
  const api: ExtensionClientApi = {
    subscribePermission: (operation, input, onChange) =>
      registry.subscribe(
        (operation === "dispatch" ? dispatch : settings).permissionAtom(environmentId, input),
        onChange,
        { immediate: true },
      ),
    getConfig: async (input) =>
      value(await executeAtomQuery(registry, config({ environmentId, input }))),
    getThread: async (input) =>
      value(
        await executeAtomQuery(
          registry,
          thread({ environmentId, input: { threadId: ThreadId.make(input.threadId) } }),
        ),
      ),
    dispatch: async (input) =>
      value(await dispatch.run(registry, { environmentId, input: decodeCommand(input) })),
    updateSettings: async (input) =>
      value(await settings.run(registry, { environmentId, input: decodeSettings(input) })),
    subscribeShell: (input, observer) => observe(shellStream({ environmentId, input }), observer),
    subscribeThread: (input, observer) => observe(threadStream({ environmentId, input }), observer),
  };
  apis.set(environment, api);
  return api;
}
