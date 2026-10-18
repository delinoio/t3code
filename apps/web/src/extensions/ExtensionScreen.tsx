import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { services } from "./services";
import { Component, createElement, Suspense, lazy, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExtensionHostProvider } from "@t3tools/t3-extension-sdk/web";
import { createExtensionApi } from "@t3tools/t3-extension-sdk/host";
import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { usePrimaryEnvironmentId, useEnvironment, useEnvironments } from "../state/environments";
import { Button } from "../components/ui/button";
import { extensions, extensionScreens } from "./registry";

class ExtensionBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div role="alert">
        <p>This extension could not load.</p>
        <Button onClick={this.props.retry}>Retry</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}

export function ExtensionScreen({
  id,
  context,
}: {
  id: string;
  context: {
    environment?: string | undefined;
    project?: string | undefined;
    thread?: string | undefined;
  };
}) {
  const extension = extensions.find((item) => item.id === id);
  const Screen = extension ? extensionScreens.get(extension.id) : undefined;
  const { environments } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const environmentId = context.environment ? EnvironmentId.make(context.environment) : primary;
  const environment = useEnvironment(environmentId);
  const navigate = useNavigate();
  const [attempt, retry] = useState(0);
  const host = {
    environments: environments.map((environment) => ({
      environmentId: environment.environmentId,
      label: environment.label,
      connectionState: environment.connection.phase,
    })),
    environmentId,
    projectId: context.project ?? null,
    threadId: context.thread ?? null,
    services,
    api: (id: string) => createExtensionApi(connectionAtomRuntime, appAtomRegistry, id),
    openThread: (environmentId: string, threadId: string) => {
      void navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: EnvironmentId.make(environmentId),
          threadId: ThreadId.make(threadId),
        },
      });
    },
  };
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <Button variant="ghost" onClick={() => void navigate({ to: "/" })}>
          Back
        </Button>
      </div>
      {!extension ? (
        <p role="status">This extension is no longer available.</p>
      ) : (
        <>
          <h1>{extension.title}</h1>
          {environment?.connection.phase !== "connected" ? (
            <p role="status">Connect an environment to use T3 operations.</p>
          ) : null}
          <ExtensionHostProvider host={host}>
            <ExtensionBoundary
              key={`${id}:${attempt}`}
              retry={() => {
                extensionScreens.set(extension.id, lazy(extension.load));
                retry((value) => value + 1);
              }}
            >
              <Suspense fallback={<p role="status">Loading extension…</p>}>
                {Screen ? createElement(Screen) : null}
              </Suspense>
            </ExtensionBoundary>
          </ExtensionHostProvider>
        </>
      )}
    </div>
  );
}
