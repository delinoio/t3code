import { connectService } from "@SCOPE/t3-extension-sdk/service";
import { createThread } from "@SCOPE/t3-extension-sdk";

const api = await connectService({
  url: process.env.T3_URL,
  token: process.env.T3_TOKEN,
  environmentId: process.env.T3_ENVIRONMENT_ID,
});
try {
  const threadId = await createThread(api, {
    threadId: crypto.randomUUID(),
    commandId: crypto.randomUUID(),
    projectId: process.env.T3_PROJECT_ID,
    title: "External service example",
    modelSelection: { instanceId: process.env.T3_PROVIDER_INSTANCE, model: process.env.T3_MODEL },
    runtimeMode: "approval-required",
    interactionMode: "default",
  });
  console.log(await api.getThread({ threadId }));
} finally {
  await api.close();
}
