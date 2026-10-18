import type { ExtensionApi } from "./index.ts";

export interface CreateThreadInput {
  readonly threadId: string;
  readonly commandId: string;
  readonly projectId: string;
  readonly title: string;
  readonly modelSelection: { readonly instanceId: string; readonly model: string };
  readonly runtimeMode: "full-access" | "approval-required" | "auto" | "auto-accept-edits";
  readonly interactionMode: "default" | "plan";
}

export async function createThread(
  api: Pick<ExtensionApi, "dispatch">,
  input: CreateThreadInput,
): Promise<string> {
  const { threadId } = input;
  await api.dispatch({
    type: "thread.create",
    ...input,
    createdBy: "user",
    creationSource: "server",
    branch: null,
    worktreePath: null,
  });
  return threadId;
}

export function startTurn(
  api: Pick<ExtensionApi, "dispatch">,
  input: { threadId: string; text: string; commandId: string; messageId: string },
) {
  return api.dispatch({
    type: "message.dispatch",
    ...input,
    attachments: [],
    createdBy: "user",
    creationSource: "server",
    dispatchMode: { type: "start_immediately" },
  });
}

export function interruptTurn(
  api: Pick<ExtensionApi, "dispatch">,
  input: { threadId: string; runId: string; commandId: string },
) {
  return api.dispatch({ type: "run.interrupt", ...input });
}

export function getWorkspace(
  api: Pick<ExtensionApi, "subscribeShell">,
  signal?: AbortSignal,
): Promise<import("./index.ts").ExtensionWorkspace> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    let settled = false;
    const cleanup = () => {
      settled = true;
      stop();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason ?? new Error("Workspace query aborted."));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    try {
      stop = api.subscribeShell(
        {},
        {
          next: (event) => {
            if (event.kind === "snapshot" && event.snapshot) {
              cleanup();
              resolve(event.snapshot);
            }
          },
          error: (error) => {
            cleanup();
            reject(error);
          },
        },
      );
      if (settled) stop();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
