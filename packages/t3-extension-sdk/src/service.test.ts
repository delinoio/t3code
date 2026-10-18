import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  ServerSettings,
  ORCHESTRATION_PROTOCOL_VERSION,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { connectService } from "./service.ts";

const config = {
  environment: {
    environmentId: "test",
    label: "Test",
    platform: { os: "linux", arch: "x64" },
    serverVersion: "0.1.0",
    capabilities: {},
    orchestrationProtocolVersion: ORCHESTRATION_PROTOCOL_VERSION,
  },
  auth: {
    policy: "loopback-browser",
    bootstrapMethods: ["one-time-token"],
    sessionMethods: ["bearer-access-token"],
    sessionCookieName: "test",
  },
  cwd: "/tmp",
  keybindingsConfigPath: "/tmp/keys.json",
  keybindings: [],
  issues: [],
  providers: [],
  availableEditors: [],
  observability: {
    logsDirectoryPath: "/tmp/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
    otlpLogsEnabled: false,
  },
  settings: Schema.encodeSync(ServerSettings)(DEFAULT_SERVER_SETTINGS),
};

class FixtureSocket extends EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FixtureSocket[] = [];
  readyState = 0;
  sent: Array<{ _tag: string; tag?: string; id?: string }> = [];
  readonly url: string;
  constructor(url: string) {
    super();
    this.url = url;
    FixtureSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(data: string) {
    const message = JSON.parse(data);
    this.sent.push(message);
    if (message._tag === "Interrupt") {
      queueMicrotask(() =>
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify({
              _tag: "Exit",
              requestId: message.requestId,
              exit: { _tag: "Success" },
            }),
          }),
        ),
      );
      return;
    }
    if (message._tag !== "Request") return;
    const reply =
      message.tag === "orchestration.subscribeShell"
        ? {
            _tag: "Chunk",
            requestId: message.id,
            values: [
              {
                kind: "snapshot",
                snapshot: {
                  schemaVersion: 2,
                  snapshotSequence: 0,
                  projects: [],
                  threads: [],
                  archivedThreads: [],
                },
              },
            ],
          }
        : { _tag: "Exit", requestId: message.id, exit: { _tag: "Success", value: config } };
    queueMicrotask(() =>
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(reply) })),
    );
  }
  close(code = 1000) {
    this.readyState = 3;
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason: "closed" }));
  }
}

const options = { url: "https://host.example.test", environmentId: "test", token: "fixture-token" };
function setup() {
  FixtureSocket.instances = [];
  vi.stubGlobal("WebSocket", FixtureSocket);
  const fetch = vi.fn(async () => Response.json({ ticket: "fixture-ticket" }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("external service connection", () => {
  it("authenticates only to the environment and disposes the socket", async () => {
    const fetch = setup();
    const api = await connectService(options);
    expect(fetch.mock.calls[0]).toMatchObject([
      new URL("https://host.example.test/api/auth/websocket-ticket"),
      { headers: { Authorization: "Bearer fixture-token" } },
    ]);
    expect(FixtureSocket.instances[0]?.url).toContain("wsTicket=fixture-ticket");
    expect((await api.getConfig({})).environment.environmentId).toBe("test");
    await api.close();
    expect(FixtureSocket.instances[0]?.readyState).toBe(3);
  });
  it("rejects a mismatched environment and closes its connection", async () => {
    setup();
    await expect(connectService({ ...options, environmentId: "different" })).rejects.toThrow(
      "does not match",
    );
    expect(FixtureSocket.instances[0]?.readyState).toBe(3);
  });
  it("rejects authentication before opening a socket", async () => {
    setup().mockResolvedValue(Response.json({}, { status: 401 }));
    await expect(connectService(options)).rejects.toThrow("401");
    expect(FixtureSocket.instances).toHaveLength(0);
  });
  it("receives a shell snapshot and allows subscription disposal", async () => {
    setup();
    const api = await connectService(options);
    const next = Promise.withResolvers<unknown>();
    const stop = api.subscribeShell({}, { next: next.resolve, error: next.reject });
    expect(await next.promise).toMatchObject({ kind: "snapshot" });
    stop();
    await api.close();
    expect(FixtureSocket.instances[0]?.readyState).toBe(3);
  });
  it("reports disconnection and supports an explicit new connection", async () => {
    setup();
    const api = await connectService(options);
    const received = Promise.withResolvers<unknown>();
    const failed = Promise.withResolvers<unknown>();
    api.subscribeShell({}, { next: received.resolve, error: failed.resolve });
    await received.promise;
    FixtureSocket.instances[0]!.close(1006);
    expect(await failed.promise).toBeDefined();
    await api.close();
    const reconnected = await connectService(options);
    expect((await reconnected.getConfig({})).environment.environmentId).toBe("test");
    await reconnected.close();
    expect(FixtureSocket.instances).toHaveLength(2);
  });
});
