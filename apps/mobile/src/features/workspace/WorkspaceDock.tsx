import { AppText } from "../../components/ui/AppText";
import { phoneDestinations } from "../../extensions/registry";
import { Keyboard, Pressable, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { GlassSurface } from "../../components/ui/GlassSurface";
import { useWorkspaceTabs } from "./WorkspaceTabsContext";
import { WORKSPACE_DOCK } from "./workspace-tabs-state";

export function WorkspaceDock(props: { readonly onNewTask: () => void }) {
  const workspace = useWorkspaceTabs()!;
  return (
    <View
      className="w-full flex-row items-center justify-between"
      style={{ gap: WORKSPACE_DOCK.gap }}
    >
      <GlassSurface
        style={{
          width: Math.max(WORKSPACE_DOCK.tabsWidth, phoneDestinations.length * 52),
          height: WORKSPACE_DOCK.height,
          borderRadius: WORKSPACE_DOCK.height / 2,
        }}
      >
        <View className="flex-1 flex-row p-1" accessibilityRole="tablist">
          {phoneDestinations.map(({ id: tab, label, icon }) => {
            const selected =
              workspace.state.selectedTab === tab ||
              (tab === "extension:more" &&
                !phoneDestinations.some((item) => item.id === workspace.state.selectedTab));
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onPress={() => {
                  if (workspace.state.selectedTab === tab) return;
                  Keyboard.dismiss();
                  workspace.dispatch({ type: "select", tab });
                }}
                className={
                  selected
                    ? "flex-1 items-center justify-center rounded-full bg-subtle-strong"
                    : "flex-1 items-center justify-center rounded-full"
                }
              >
                <SymbolView
                  name={icon}
                  size={phoneDestinations.length > 2 ? 20 : 23}
                  tintColorClassName={selected ? "accent-focus" : "accent-icon"}
                />
                {phoneDestinations.length > 2 ? (
                  <AppText className="text-xs" numberOfLines={1}>
                    {tab === "pullRequests" ? "Pulls" : label}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
      <GlassSurface
        style={{
          width: WORKSPACE_DOCK.height,
          height: WORKSPACE_DOCK.height,
          borderRadius: WORKSPACE_DOCK.height / 2,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          onPress={props.onNewTask}
          className="flex-1 items-center justify-center"
        >
          <SymbolView name="square.and.pencil" size={23} tintColorClassName="accent-icon" />
        </Pressable>
      </GlassSurface>
    </View>
  );
}
