import { ActivityIcon, CircleDotIcon, SettingsIcon, WorkflowIcon } from "lucide-react";
import type { ExtensionIcon as Icon } from "@t3tools/t3-extension-sdk";

export function ExtensionIcon({ icon }: { icon: Icon }) {
  const Component = {
    activity: ActivityIcon,
    issues: CircleDotIcon,
    settings: SettingsIcon,
    workflow: WorkflowIcon,
  }[icon];
  return <Component />;
}
