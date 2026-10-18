import { createFileRoute } from "@tanstack/react-router";
import { ExtensionScreen } from "../extensions/ExtensionScreen";

export const Route = createFileRoute("/_chat/extensions/$extensionId")({
  validateSearch: (search: Record<string, unknown>) => ({
    environment: typeof search.environment === "string" ? search.environment : undefined,
    project: typeof search.project === "string" ? search.project : undefined,
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: ExtensionRoute,
});

function ExtensionRoute() {
  const { extensionId } = Route.useParams();
  const context = Route.useSearch();
  return <ExtensionScreen id={extensionId} context={context} />;
}
