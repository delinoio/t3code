import { lazy } from "react";
import { extensionRegistry } from "@t3tools/t3-extension-sdk";
import product from "./product";

export const extensions = extensionRegistry(product);
export type ExtensionTab = `extension:${string}`;
export const extensionTab = (id: string): ExtensionTab => `extension:${id}`;
const symbols = {
  workflow: "point.3.connected.trianglepath.dotted",
  issues: "circle.inset.filled",
  activity: "chart.bar.xaxis",
  settings: "gearshape",
} as const;
export const extensionTabs = extensions.map((extension) => ({
  id: extensionTab(extension.id),
  label: extension.title,
  icon: symbols[extension.icon],
}));
export const workspaceDestinations = [
  { id: "threads" as const, label: "Threads", icon: "text.bubble" as const },
  { id: "pullRequests" as const, label: "Pull requests", icon: "arrow.triangle.pull" as const },
  ...extensionTabs,
];
export function phoneWorkspaceDestinations(destinations: typeof workspaceDestinations) {
  return destinations.length > 4
    ? [
        ...destinations.slice(0, 3),
        { id: "extension:more" as const, label: "More", icon: "ellipsis" as const },
      ]
    : destinations;
}
export const phoneDestinations = phoneWorkspaceDestinations(workspaceDestinations);
export function workspaceTitle(tab: string) {
  return workspaceDestinations.find((item) => item.id === tab)?.label ?? "More";
}

export const extensionScreens = new Map(
  extensions.map((extension) => [extension.id, lazy(extension.load)]),
);
