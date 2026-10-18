import { useNavigate, useSearch } from "@tanstack/react-router";
import { useThreadRouteRef } from "../hooks/useThreadRouteTarget";
import { useThreadShell } from "../state/entities";
import { usePrimaryEnvironmentId } from "../state/environments";

export function useOpenExtension() {
  const navigate = useNavigate();
  const context = useSearch({ strict: false });
  const ref = useThreadRouteRef();
  const thread = useThreadShell(ref);
  const primary = usePrimaryEnvironmentId();
  return (extensionId: string) =>
    navigate({
      to: "/extensions/$extensionId",
      params: { extensionId },
      search: {
        environment: ref?.environmentId ?? context.environment ?? primary ?? undefined,
        project: thread?.projectId ?? context.project,
        thread: ref?.threadId ?? context.thread,
      },
    });
}
