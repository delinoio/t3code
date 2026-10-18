import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      web: "src/react.ts",
      native: "src/react.ts",
      service: "src/service.ts",
    },
    outDir: "dist",
    dts: { generator: "tsc", eager: true },
    clean: true,
    deps: {
      alwaysBundle: (id) => id.startsWith("@t3tools/"),
      neverBundle: (id) => id === "react" || id.startsWith("effect"),
    },
  },
});
