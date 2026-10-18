// @effect-diagnostics nodeBuiltinImport:off - Build configuration runs before an Effect runtime exists.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { build } from "vite-plus";

const root = process.cwd();
const product = JSON.parse(await NodeFSP.readFile(NodePath.join(root, "t3.product.json"), "utf8"));
for (const surface of ["web", "native"]) {
  const entry = NodePath.join(root, "extensions/product", product.entries[surface]);
  const outDir = NodePath.join(root, ".generated/extension-validation", surface);
  await build({
    configFile: false,
    logLevel: "error",
    ssr: { noExternal: true },
    plugins: [
      {
        name: "extension-registration-only",
        async resolveDynamicImport(source, importer) {
          if (typeof source !== "string" || !importer)
            throw new Error("Extension screen imports must use literal paths.");
          const resolved = await this.resolve(source, importer);
          if (!resolved) throw new Error(`Cannot resolve extension screen ${source}`);
          return { id: resolved.id, external: true };
        },
      },
    ],
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      lib: { entry, formats: ["es"], fileName: () => "registry.mjs" },
      rolldownOptions: {
        output: { entryFileNames: "registry.mjs" },
        external: [/^react(?:\/|$)/, /^react-native(?:\/|$)/],
      },
    },
  });
  const { default: extensions } = await import(
    NodeURL.pathToFileURL(NodePath.join(outDir, "registry.mjs")).href
  );
  if (!Array.isArray(extensions))
    throw new Error(`${surface} entry must export an extension array.`);
  const ids = new Set<string>();
  for (const extension of extensions) {
    if (
      !extension ||
      typeof extension.id !== "string" ||
      extension.id === "more" ||
      !/^[a-z][a-z0-9.-]*$/.test(extension.id) ||
      !extension.title?.trim() ||
      typeof extension.load !== "function"
    )
      throw new Error(`Invalid ${surface} extension registration.`);
    if (ids.has(extension.id))
      throw new Error(`Duplicate ${surface} extension ID: ${extension.id}`);
    ids.add(extension.id);
  }
}
