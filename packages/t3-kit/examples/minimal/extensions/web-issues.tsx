import { useExtensionHost } from "@SCOPE/t3-extension-sdk/web";
export default function Issues() {
  const host = useExtensionHost();
  return (
    <section>
      <h2>Issues example</h2>
      <p>Environment: {host.environmentId ?? "Disconnected"}</p>
      <p>{host.services.issues ?? "Configure services.issues in the product repository."}</p>
    </section>
  );
}
