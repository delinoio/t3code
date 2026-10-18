import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { services } from "./services";
import { Component, createElement, Suspense, lazy, useMemo, useState, type ReactNode } from "react";
import { View, Pressable, ScrollView, BackHandler } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import { ExtensionHostProvider } from "@t3tools/t3-extension-sdk/native";
import { createExtensionApi } from "@t3tools/t3-extension-sdk/host";
import { AppText } from "../components/ui/AppText";
import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../state/atom-registry";
import { useWorkspaceEnvironments } from "../state/workspace";
import { useWorkspaceTabs } from "../features/workspace/WorkspaceTabsContext";
import { extensions, extensionScreens, extensionTab } from "./registry";

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
      <View>
        <AppText>This extension could not load.</AppText>
        <Pressable
          className="min-h-12 justify-center"
          accessibilityRole="button"
          onPress={this.props.retry}
        >
          <AppText>Retry</AppText>
        </Pressable>
      </View>
    ) : (
      this.props.children
    );
  }
}

export function ExtensionScreen({ tab }: { tab: string }) {
  const workspace = useWorkspaceTabs()!;
  const environments = useWorkspaceEnvironments();
  const navigation = useNavigation();
  const { dispatch } = workspace;
  const environmentId = environments.length === 1 ? environments[0]!.environmentId : null;
  const [attempt, retry] = useState(0);
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        dispatch({ type: "select", tab: "threads" });
        return true;
      });
      return () => subscription.remove();
    }, [dispatch]),
  );
  const host = useMemo(
    () => ({
      environments: environments.map((environment) => ({
        environmentId: environment.environmentId,
        label: environment.environmentLabel,
        connectionState: environment.connectionState,
      })),
      environmentId,
      projectId: null,
      threadId: null,
      services,
      api: (id: string) => createExtensionApi(connectionAtomRuntime, appAtomRegistry, id),
      openThread: (environmentId: string, threadId: string) => {
        dispatch({ type: "select", tab: "threads" });
        navigation.navigate("Thread", {
          environmentId: EnvironmentId.make(environmentId),
          threadId: ThreadId.make(threadId),
        });
      },
    }),
    [environmentId, environments, navigation, dispatch],
  );
  const extension = extensions.find((entry) => extensionTab(entry.id) === tab);
  const Screen = extension ? extensionScreens.get(extension.id) : undefined;
  return (
    <View className="flex-1 bg-screen p-4">
      <Pressable
        className="min-h-12 justify-center"
        accessibilityRole="button"
        onPress={() => dispatch({ type: "select", tab: "threads" })}
      >
        <AppText>Back to threads</AppText>
      </Pressable>
      {tab === "extension:more" ? (
        <ScrollView>
          {extensions.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              className="min-h-12 justify-center"
              onPress={() => dispatch({ type: "select", tab: extensionTab(entry.id) })}
            >
              <AppText>{entry.title}</AppText>
            </Pressable>
          ))}
        </ScrollView>
      ) : !extension ? (
        <AppText>This extension is no longer available.</AppText>
      ) : (
        <ExtensionHostProvider host={host}>
          {environments.find((environment) => environment.environmentId === environmentId)
            ?.connectionState !== "connected" ? (
            <AppText>Connect an environment to use T3 operations.</AppText>
          ) : null}
          <ExtensionBoundary
            key={`${tab}:${attempt}`}
            retry={() => {
              extensionScreens.set(extension.id, lazy(extension.load));
              retry((value) => value + 1);
            }}
          >
            <Suspense fallback={<AppText>Loading extension…</AppText>}>
              {Screen ? createElement(Screen) : null}
            </Suspense>
          </ExtensionBoundary>
        </ExtensionHostProvider>
      )}
    </View>
  );
}
