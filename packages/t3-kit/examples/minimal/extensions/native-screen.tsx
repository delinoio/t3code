import { useState } from "react";
import { Text, TextInput, Button, View } from "react-native";
import { useExtensionHost, averageTurnOutputTokensPerSecond } from "@SCOPE/t3-extension-sdk/native";
export default function Measurements() {
  const host = useExtensionHost();
  const [environmentId, setEnvironmentId] = useState(host.environmentId);
  const [threadId, setThreadId] = useState(host.threadId ?? "");
  const [result, setResult] = useState("Choose a thread to read its existing turn measurements.");
  return (
    <View>
      <Text>Turn measurements</Text>
      {host.environments.map((environment) => (
        <Button
          key={environment.environmentId}
          title={`${environment.label} (${environment.connectionState})`}
          onPress={() => setEnvironmentId(environment.environmentId)}
        />
      ))}
      <TextInput accessibilityLabel="Thread ID" value={threadId} onChangeText={setThreadId} />
      <Button
        title="Read measurements"
        disabled={!environmentId || !threadId}
        onPress={async () => {
          try {
            const thread = await host.api(environmentId!).getThread({ threadId });
            setResult(
              thread.providerTurns
                .map(
                  (turn) =>
                    `${turn.id}: ${averageTurnOutputTokensPerSecond(turn) ?? "unavailable"} tokens/s (whole turn average)`,
                )
                .join("\n") || "No provider turns.",
            );
          } catch (error) {
            setResult(String(error));
          }
        }}
      />
      <Text>{result}</Text>
    </View>
  );
}
