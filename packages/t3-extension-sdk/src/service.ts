import {
  OrchestrationV2Command,
  ServerSettingsPatch,
  ProviderInstanceMutation,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  WsRpcGroup,
  WS_METHODS,
  ORCHESTRATION_V2_WS_METHODS as V2,
  ORCHESTRATION_PROTOCOL_VERSION,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Context from "effect/Context";
import * as Stream from "effect/Stream";
import * as Cause from "effect/Cause";
import * as Fiber from "effect/Fiber";
import * as Schedule from "effect/Schedule";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Socket from "effect/socket/Socket";
import type { ExtensionApi } from "./index.ts";

const decodeSettings = Schema.decodeUnknownSync(
  Schema.Struct({
    patch: ServerSettingsPatch,
    providerInstanceMutation: Schema.optionalKey(ProviderInstanceMutation),
  }),
);
const decodeCommand = Schema.decodeUnknownSync(OrchestrationV2Command);

export interface ServiceConnectionOptions {
  readonly url: string;
  readonly environmentId: string;
  readonly token: string;
  readonly signal?: AbortSignal;
}

export async function connectService(
  options: ServiceConnectionOptions,
): Promise<ExtensionApi & { close: () => Promise<void> }> {
  const base = new URL(options.url);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
    throw new Error("Expected an HTTP(S) environment URL.");
  // @effect-diagnostics-next-line globalFetch:off - The public Promise API obtains a ticket before constructing the scoped RPC runtime.
  const ticketResponse = await fetch(
    new URL("api/auth/websocket-ticket", base.href.endsWith("/") ? base : `${base}/`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${options.token}` },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    },
  );
  if (!ticketResponse.ok) throw new Error(`T3 authentication failed (${ticketResponse.status}).`);
  const ticket: unknown = await ticketResponse.json();
  if (
    !ticket ||
    typeof ticket !== "object" ||
    !("ticket" in ticket) ||
    typeof ticket.ticket !== "string"
  )
    throw new Error("Invalid WebSocket ticket response.");
  const url = new URL("ws", base.href.endsWith("/") ? base : `${base}/`);
  url.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("wsTicket", ticket.ticket);
  url.searchParams.set("orchestrationProtocol", String(ORCHESTRATION_PROTOCOL_VERSION));
  const protocol = RpcClient.layerProtocolSocket({
    retryTransientErrors: false,
    retryPolicy: Schedule.recurs(0),
  }).pipe(
    Layer.provide(Socket.layerWebSocket(url.href)),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerJson),
  );
  const clientEffect = RpcClient.make(WsRpcGroup);
  class Client extends Context.Service<Client, Effect.Success<typeof clientEffect>>()(
    "@t3tools/t3-extension-sdk/service/Client",
  ) {}
  const runtime = ManagedRuntime.make(
    Layer.effect(Client, clientEffect).pipe(Layer.provide(protocol)),
  );
  const close = async () => {
    options.signal?.removeEventListener("abort", onAbort);
    await runtime.dispose();
  };
  const onAbort = () => {
    void close();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const client = await runtime.runPromise(Client);
    const config = await runtime.runPromise(client[WS_METHODS.serverGetConfig]({}), {
      signal: options.signal,
    });
    if (config.environment.environmentId !== EnvironmentId.make(options.environmentId))
      throw new Error("The server environment does not match the requested environment.");
    if (config.environment.orchestrationProtocolVersion !== ORCHESTRATION_PROTOCOL_VERSION)
      throw new Error("The server protocol is incompatible with this SDK.");
    const watch = <A, E>(
      stream: Stream.Stream<A, E>,
      observer: { next: (value: A) => void; error: (error: unknown) => void },
    ) => {
      const fiber = runtime.runFork(
        stream.pipe(
          Stream.runForEach((event) => Effect.sync(() => observer.next(event))),
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.sync(() => observer.error(Cause.squash(cause))),
          ),
        ),
      );
      return () => {
        void Effect.runPromise(Fiber.interrupt(fiber));
      };
    };
    return {
      close,
      getConfig: (input) => runtime.runPromise(client[WS_METHODS.serverGetConfig](input)),
      updateSettings: (input) =>
        runtime.runPromise(client[WS_METHODS.serverUpdateSettings](decodeSettings(input))),
      dispatch: (input) => runtime.runPromise(client[V2.dispatchCommand](decodeCommand(input))),
      getThread: (input) =>
        runtime.runPromise(
          client[V2.getThreadProjection]({ threadId: ThreadId.make(input.threadId) }),
        ),
      subscribeShell: (input, observer) => watch(client[V2.subscribeShell](input), observer),
      subscribeThread: (input, observer) =>
        watch(
          client[V2.subscribeThread]({ ...input, threadId: ThreadId.make(input.threadId) }),
          observer,
        ),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
