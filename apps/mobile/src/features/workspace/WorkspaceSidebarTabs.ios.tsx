import { workspaceDestinations } from "../../extensions/registry";
import { View, ScrollView } from "react-native";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";
import { useSelectWorkspaceTab } from "./useSelectWorkspaceTab";

export function WorkspaceSidebarTabs() {
  const workspace = useWorkspaceTabs()!;
  const selectTab = useSelectWorkspaceTab();
  const control = (
    <SegmentedControl
      role="tab"
      options={workspaceDestinations.map(({ id, label }) => ({ value: id, label }))}
      selected={workspace.state.selectedTab}
      onSelect={(tab: WorkspaceTab) => selectTab(tab)}
    />
  );
  return (
    <View className="px-4 pb-3 pt-2">
      {workspaceDestinations.length > 4 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {control}
        </ScrollView>
      ) : (
        control
      )}
    </View>
  );
}
