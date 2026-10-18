import { defineProduct } from "@SCOPE/t3-kit";

export default defineProduct({
  name: "T3 Extension Example",
  desktopAppId: "org.example.t3.desktop",
  iosBundleIdentifier: "org.example.t3.ios",
  androidApplicationId: "org.example.t3.android",
  scheme: "t3-extension-example",
  extensionDirectory: "extensions",
  entries: { web: "web.ts", native: "native.ts" },
  services: {},
});
