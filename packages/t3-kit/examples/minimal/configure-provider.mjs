import { connectService } from "@SCOPE/t3-extension-sdk/service";

// Run this on the service host. Credentials are never part of the product build.
const driver = process.env.T3_DRIVER;
if (driver !== "codex" && driver !== "claudeAgent")
  throw new Error("T3_DRIVER must be codex or claudeAgent.");
const instanceId = process.env.T3_PROVIDER_INSTANCE;
const secret = process.env.PROVIDER_API_KEY;
if (!instanceId || !secret) throw new Error("Set T3_PROVIDER_INSTANCE and PROVIDER_API_KEY.");
const api = await connectService({
  url: process.env.T3_URL,
  token: process.env.T3_TOKEN,
  environmentId: process.env.T3_ENVIRONMENT_ID,
});
try {
  await api.updateSettings({
    patch: {},
    providerInstanceMutation: {
      operation: "create",
      instanceId,
      instance: {
        driver,
        displayName: "External API example",
        enabled: true,
        environment:
          driver === "claudeAgent"
            ? [
                {
                  name: "ANTHROPIC_BASE_URL",
                  value: process.env.PROVIDER_BASE_URL,
                  sensitive: false,
                },
                { name: "ANTHROPIC_AUTH_TOKEN", value: secret, sensitive: true },
              ]
            : [{ name: "OPENROUTER_API_KEY", value: secret, sensitive: true }],
        config: driver === "codex" ? { launchArgs: process.env.CODEX_LAUNCH_ARGS ?? "" } : {},
      },
    },
  });
  // Server configuration reads return masked credentials.
  console.log(Object.keys((await api.getConfig({})).settings.providerInstances));
} finally {
  await api.close();
}
