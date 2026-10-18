import { Text, View } from "react-native";
import { useExtensionHost } from "@SCOPE/t3-extension-sdk/native";
export default function Issues() {
  const host = useExtensionHost();
  return (
    <View>
      <Text>Issues example</Text>
      <Text>Environment: {host.environmentId ?? "Disconnected"}</Text>
      <Text>{host.services.issues ?? "Configure services.issues in the product repository."}</Text>
    </View>
  );
}
