import { phoneDestinations, workspaceDestinations } from "../../extensions/registry";
import { useDeviceType, useNativeLayoutMetrics } from "../../native/native-layout-metrics";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Platform, View, type NativeSyntheticEvent } from "react-native";
import {
  Tabs,
  type TabSelectedEvent,
  type TabSelectionPreventedEvent,
  type TabSelectionRejectedEvent,
} from "react-native-screens";

import { WorkspaceTabsContext, useWorkspaceTabs } from "./WorkspaceTabsContext";
import type { WorkspaceTab } from "./workspace-tabs-state";
import { NativeWorkspaceTabActivityContext } from "../../native/v5-workspace-context";
import { useSystemWorkspaceTabBar } from "./useSystemWorkspaceTabBar";

const PULL_REQUEST_ICON = require("../../../assets/icons/pull-request.png");
const COMPOSE_TAB = "compose";

/** Retain each native controller tree; removing its root can leave RNS's stack empty. */
function RetainedWorkspaceTab(props: {
  readonly tab: WorkspaceTab;
  readonly active: boolean;
  readonly children: ReactNode;
}) {
  const workspace = useWorkspaceTabs()!;
  const { isTabActive } = workspace;
  const isActive = useCallback(() => isTabActive(props.tab), [isTabActive, props.tab]);
  const activity = useMemo(
    () => ({
      active: props.active,
      isActive,
    }),
    [props.active, isActive],
  );
  const [content, setContent] = useState(
    props.active ? { workspace, children: props.children } : null,
  );
  if (props.active && (content?.workspace !== workspace || content?.children !== props.children))
    setContent({ workspace, children: props.children });
  return content ? (
    <NativeWorkspaceTabActivityContext value={activity}>
      <WorkspaceTabsContext value={content.workspace}>{content.children}</WorkspaceTabsContext>
    </NativeWorkspaceTabActivityContext>
  ) : null;
}

export function WorkspaceNativeTabs(props: {
  readonly children: ReactNode;
  readonly hidden: boolean;
  readonly onSelect: () => void;
  readonly onNewTask: () => void;
}) {
  const workspace = useWorkspaceTabs()!;
  const metrics = useNativeLayoutMetrics();
  const deviceType = useDeviceType();
  const phoneBar =
    Platform.OS === "ios" &&
    deviceType !== "pad" &&
    (metrics?.verticalBarEdge ?? "none") === "none";
  const [provenance, setProvenance] = useState(0);
  const systemTabBar = useSystemWorkspaceTabBar();
  const destinations = phoneBar ? phoneDestinations : workspaceDestinations;
  const selectedTab = workspace.state.selectedTab;
  const nativeSelectedTab = destinations.some((item) => item.id === selectedTab)
    ? selectedTab
    : "extension:more";
  const request = useMemo(
    () => ({ selectedScreenKey: nativeSelectedTab, baseProvenance: provenance }),
    [nativeSelectedTab, provenance],
  );
  return (
    <View style={{ flex: 1 }}>
      <Tabs.Host
        navStateRequest={request}
        tabBarHidden={props.hidden || !systemTabBar}
        ios={{ tabBarControllerMode: "tabBar", tabBarMinimizeBehavior: "never" }}
        onTabSelectionPrevented={({
          nativeEvent,
        }: NativeSyntheticEvent<TabSelectionPreventedEvent>) => {
          if (nativeEvent.preventedScreenKey === COMPOSE_TAB) props.onNewTask();
        }}
        onTabSelectionRejected={({
          nativeEvent,
        }: NativeSyntheticEvent<TabSelectionRejectedEvent>) => {
          setProvenance(nativeEvent.provenance);
        }}
        onTabSelected={({ nativeEvent }: NativeSyntheticEvent<TabSelectedEvent>) => {
          const item = destinations.find((item) => item.id === nativeEvent.selectedScreenKey);
          if (!item) return;
          const tab = item.id;
          setProvenance(nativeEvent.provenance);
          if (nativeEvent.actionOrigin === "programmatic-js" || tab === selectedTab) return;
          Keyboard.dismiss();
          props.onSelect();
          workspace.dispatch({ type: "select", tab });
        }}
      >
        {destinations.map(({ id: tab, label, icon }) => (
          <Tabs.Screen
            key={tab}
            screenKey={tab}
            title={tab === "pullRequests" ? "Pulls" : label}
            tabBarItemAccessibilityLabel={label}
            ios={{
              icon:
                tab === "pullRequests"
                  ? { type: "templateSource", templateSource: PULL_REQUEST_ICON }
                  : { type: "sfSymbol", name: icon },
              selectedIcon:
                tab === "threads" ? { type: "sfSymbol", name: "text.bubble.fill" } : undefined,
              overrideScrollViewContentInsetAdjustmentBehavior: false,
            }}
          >
            <RetainedWorkspaceTab
              tab={nativeSelectedTab === tab ? selectedTab : tab}
              active={nativeSelectedTab === tab}
            >
              {props.children}
            </RetainedWorkspaceTab>
          </Tabs.Screen>
        ))}
        {phoneBar ? (
          <Tabs.Screen
            key={COMPOSE_TAB}
            screenKey={COMPOSE_TAB}
            title="New chat"
            preventNativeSelection
            ios={{
              role: "search",
              // iOS 27 detaches a search tab only while it may activate search.
              automaticallyActivatesSearch: true,
              icon: { type: "sfSymbol", name: "square.and.pencil" },
            }}
          >
            <View />
          </Tabs.Screen>
        ) : null}
      </Tabs.Host>
    </View>
  );
}
