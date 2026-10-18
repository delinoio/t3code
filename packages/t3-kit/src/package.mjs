import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import { run } from "./process.mjs";

const exec = NodeUtil.promisify(NodeChildProcess.execFile);
const roots = [
  "apps/server/",
  "apps/web/",
  "apps/desktop/",
  "apps/mobile/",
  "packages/",
  "scripts/",
  "assets/",
  "native/",
  "packaging/",
  "patches/",
  "oxlint-plugin-t3code/",
  ".vite-hooks/",
];
const rootFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "vite.config.ts",
  "third-party-licenses.config.json",
  "LICENSE",
  ".gitignore",
]);

export function isSourceInput(file) {
  if (!(rootFiles.has(file) || roots.some((root) => file.startsWith(root)))) return false;
  return !file
    .split("/")
    .some(
      (part) =>
        [
          "node_modules",
          ".git",
          ".t3",
          ".t3-kit",
          ".repos",
          "auth.json",
          ".npmrc",
          ".generated",
          "dist",
          "dist-electron",
          "dist-exe",
          "build",
          "Pods",
          ".gradle",
        ].includes(part) ||
        part === ".env" ||
        part.startsWith(".env."),
    );
}

export async function stagePackages({
  root,
  output,
  scope,
  version,
  upstreamBaseCommit,
  execute = run,
}) {
  if (!/^@[a-z0-9][a-z0-9._-]*$/.test(scope))
    throw new Error("An npm scope such as @example is required.");
  if (!/^0\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version))
    throw new Error("An explicit 0.x release version is required.");
  if (!/^[a-f0-9]{40}$/.test(upstreamBaseCommit))
    throw new Error("An upstream base commit SHA is required.");
  const sourceCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const files = (
    await exec("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      maxBuffer: 20 * 1024 * 1024,
    })
  ).stdout
    .split("\0")
    .filter(isSourceInput);
  await NodeFSP.mkdir(output, { recursive: true });
  const source = await NodeFSP.mkdtemp(NodePath.join(output, "source-"));
  try {
    for (const file of files) {
      const stat = await NodeFSP.lstat(NodePath.join(root, file));
      if (!stat.isFile()) throw new Error(`Source input must be a regular file: ${file}`);
      await NodeFSP.mkdir(NodePath.dirname(NodePath.join(source, file)), { recursive: true });
      await NodeFSP.copyFile(NodePath.join(root, file), NodePath.join(source, file));
    }
    for (const name of ["t3-kit", "t3-extension-sdk"]) {
      const directory = NodePath.join(output, name);
      await NodeFSP.mkdir(directory, { recursive: true });
      await NodeFSP.copyFile(NodePath.join(root, "LICENSE"), NodePath.join(directory, "LICENSE"));
      const manifest = {
        name: `${scope}/${name}`,
        version,
        type: "module",
        license: "MIT",
        private: false,
        engines: { node: ">=24.13.1" },
        t3Kit: { sourceCommit, upstreamBaseCommit, extensionApiVersion: 1 },
        ...(name === "t3-kit"
          ? {
              bin: { "t3-kit": "src/cli.mjs" },
              exports: { ".": "./src/product.mjs" },
              files: ["src", "source.tar.gz", "metadata.json", "examples", "README.md", "LICENSE"],
            }
          : {
              exports: Object.fromEntries(
                ["index", "web", "native", "service"].map((entry) => [
                  entry === "index" ? "." : `./${entry}`,
                  {
                    types: `./dist/${entry === "web" ? "native" : entry}.d.mts`,
                    import: `./dist/${entry}.mjs`,
                  },
                ]),
              ),
              files: ["dist", "LICENSE"],
              peerDependencies: { react: "^19.0.0" },
              peerDependenciesMeta: { react: { optional: true } },
              dependencies: { effect: "4.0.5", "@types/react": "~19.3.0" },
            }),
      };
      await NodeFSP.writeFile(
        NodePath.join(directory, "package.json"),
        JSON.stringify(manifest, null, 2),
      );
    }
    const metadata = {
      version,
      scope,
      sourceCommit,
      upstreamBaseCommit,
      extensionApiVersion: 1,
      node: ">=24.13.1",
    };
    const kit = NodePath.join(output, "t3-kit");
    await NodeFSP.cp(NodePath.join(root, "packages/t3-kit/src"), NodePath.join(kit, "src"), {
      recursive: true,
    });
    await NodeFSP.writeFile(NodePath.join(kit, "metadata.json"), JSON.stringify(metadata, null, 2));
    await NodeFSP.cp(
      NodePath.join(root, "packages/t3-kit/examples"),
      NodePath.join(kit, "examples"),
      {
        recursive: true,
      },
    );
    for (const entry of await NodeFSP.readdir(NodePath.join(kit, "examples"), {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const file = NodePath.join(entry.parentPath, entry.name);
      const text = await NodeFSP.readFile(file, "utf8");
      await NodeFSP.writeFile(
        file,
        text.replaceAll("@SCOPE", scope).replaceAll("VERSION", version),
      );
    }
    await NodeFSP.copyFile(
      NodePath.join(root, "packages/t3-kit/README.md"),
      NodePath.join(kit, "README.md"),
    );
    await execute("tar", ["-czf", NodePath.join(kit, "source.tar.gz"), "-C", source, "."], {
      cwd: root,
    });
    await execute("vp", ["pack"], { cwd: NodePath.join(root, "packages/t3-extension-sdk") });
    await NodeFSP.rm(NodePath.join(output, "t3-extension-sdk/dist"), {
      recursive: true,
      force: true,
    });
    await NodeFSP.cp(
      NodePath.join(root, "packages/t3-extension-sdk/dist"),
      NodePath.join(output, "t3-extension-sdk/dist"),
      { recursive: true },
    );
    return metadata;
  } finally {
    await NodeFSP.rm(source, { recursive: true, force: true });
  }
}
