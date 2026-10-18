import { useState } from "react";
import { useExtensionHost, averageTurnOutputTokensPerSecond } from "@SCOPE/t3-extension-sdk/web";
export default function Measurements() {
  const host = useExtensionHost();
  const [environmentId, setEnvironmentId] = useState(host.environmentId);
  const [threadId, setThreadId] = useState(host.threadId ?? "");
  const [result, setResult] = useState("Choose a thread to read its existing turn measurements.");
  return (
    <section>
      <h2>Turn measurements</h2>
      <label>
        Environment{" "}
        <select
          value={environmentId ?? ""}
          onChange={(event) => setEnvironmentId(event.target.value || null)}
        >
          <option value="">Choose an environment</option>
          {host.environments.map((environment) => (
            <option key={environment.environmentId} value={environment.environmentId}>
              {environment.label} ({environment.connectionState})
            </option>
          ))}
        </select>
      </label>
      <label>
        Thread ID <input value={threadId} onChange={(event) => setThreadId(event.target.value)} />
      </label>
      <button
        disabled={!environmentId || !threadId}
        onClick={async () => {
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
      >
        Read measurements
      </button>
      <pre>{result}</pre>
    </section>
  );
}
