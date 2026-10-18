import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { OrchestrationV2Command } from "@t3tools/contracts";
import { createThread, startTurn, interruptTurn, getWorkspace } from "./operations.ts";
import type { ExtensionWorkspace } from "./index.ts";
const decode = Schema.decodeUnknownSync(OrchestrationV2Command);

it("emits commands accepted by the existing orchestration schema", async () => {
  const commands: string[] = [];
  const api = {
    dispatch: async (input: unknown) => {
      commands.push(decode(input).type);
      return { sequence: commands.length };
    },
  };
  expect(
    await createThread(api, {
      commandId: "create-1",
      threadId: "thread-1",
      projectId: "project-1",
      title: "External service",
      modelSelection: { instanceId: "codex", model: "test" },
      runtimeMode: "approval-required",
      interactionMode: "default",
    }),
  ).toBe("thread-1");
  await startTurn(api, {
    commandId: "start-1",
    threadId: "thread-1",
    messageId: "message-1",
    text: "Hello",
  });
  await interruptTurn(api, { commandId: "stop-1", threadId: "thread-1", runId: "run-1" });
  expect(commands).toEqual(["thread.create", "message.dispatch", "run.interrupt"]);
});

it("unsubscribes even when the host synchronously delivers an existing shell snapshot", async () => {
  let disposed = false;
  const snapshot: ExtensionWorkspace = {
    snapshotSequence: 1,
    threads: [],
    archivedThreads: [],
    projects: [],
  };
  const api = {
    subscribeShell: (
      _input: unknown,
      observer: { next: (event: { kind: string; snapshot: ExtensionWorkspace }) => void },
    ) => {
      observer.next({ kind: "snapshot", snapshot });
      return () => {
        disposed = true;
      };
    },
  };
  expect(await getWorkspace(api)).toBe(snapshot);
  expect(disposed).toBe(true);
});
