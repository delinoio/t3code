import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { defineProduct, BUILD_TARGETS } from "./product.mjs";
import { run } from "./process.mjs";

const productFingerprint = (product) =>
  NodeCrypto.createHash("sha256").update(JSON.stringify(product)).digest("hex");

const readJson = async (file) => JSON.parse(await NodeFSP.readFile(file, "utf8"));

export async function loadProduct(root) {
  const config = await import(NodeURL.pathToFileURL(NodePath.join(root, "t3.product.mjs")).href);
  return defineProduct(config.default);
}

async function copyInputs(source, destination) {
  await NodeFSP.cp(source, destination, {
    recursive: true,
    filter: async (file) => {
      const name = NodePath.basename(file);
      if (
        ["node_modules", ".git", ".env", ".t3", "dist"].includes(name) ||
        name.startsWith(".env.")
      )
        return false;
      if ((await NodeFSP.lstat(file)).isSymbolicLink())
        throw new Error(`Extension inputs cannot contain symlinks: ${file}`);
      return true;
    },
  });
}

export async function prepareWorkspace({ root, kitRoot, update = false, execute = run }) {
  const product = await loadProduct(root);
  const metadata = await readJson(NodePath.join(kitRoot, "metadata.json"));
  const installedSdk = await readJson(
    NodePath.join(root, "node_modules", metadata.scope, "t3-extension-sdk/package.json"),
  );
  if (installedSdk.version !== metadata.version)
    throw new Error("Installed SDK must exactly match the kit version.");
  const workspace = NodePath.join(root, ".t3-kit", "workspace");
  const marker = NodePath.join(root, ".t3-kit", "metadata.json");
  const previous = await readJson(marker).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (
    previous &&
    (previous.version !== metadata.version || previous.scope !== metadata.scope) &&
    !update
  ) {
    throw new Error("Kit version changed. Run t3-kit prepare --update.");
  }
  const ignore = await NodeFSP.readFile(NodePath.join(root, ".gitignore"), "utf8").catch(() => "");
  if (!ignore.split(/\r?\n/).some((line) => [".t3-kit", ".t3-kit/", "/.t3-kit/"].includes(line))) {
    throw new Error("Add /.t3-kit/ to the product repository's .gitignore before preparing.");
  }
  await NodeFSP.rm(marker, { force: true });
  await NodeFSP.mkdir(workspace, { recursive: true });
  if (previous && (previous.version !== metadata.version || previous.scope !== metadata.scope)) {
    await NodeFSP.rm(workspace, { recursive: true });
    await NodeFSP.mkdir(workspace, { recursive: true });
  }
  await execute("tar", ["-xzf", NodePath.join(kitRoot, "source.tar.gz"), "-C", workspace]);
  const extensionRoot = NodePath.join(workspace, "extensions", "product");
  await NodeFSP.rm(extensionRoot, { recursive: true, force: true });
  await copyInputs(NodePath.join(root, product.extensionDirectory), extensionRoot);
  const extensionPackage = await readJson(NodePath.join(extensionRoot, "package.json"));
  for (const version of Object.values({
    ...extensionPackage.dependencies,
    ...extensionPackage.devDependencies,
    ...extensionPackage.peerDependencies,
  })) {
    if (typeof version === "string" && /^(file:|link:)/.test(version))
      throw new Error("Extension dependencies must not refer to local files outside the kit.");
  }
  const workspaceFile = NodePath.join(workspace, "pnpm-workspace.yaml");
  const workspaceText = await NodeFSP.readFile(workspaceFile, "utf8");
  await NodeFSP.writeFile(
    workspaceFile,
    workspaceText.replace("packages:\n", "packages:\n  - extensions/*\n") +
      "\nallowUnusedPatches: true\n",
  );
  const sdkName = `${metadata.scope}/t3-extension-sdk`;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (extensionPackage[field]?.[sdkName]) {
      if (extensionPackage[field][sdkName] !== metadata.version)
        throw new Error("Extension SDK must exactly match the kit version.");
      extensionPackage[field][sdkName] = "workspace:*";
    }
  }
  await NodeFSP.writeFile(
    NodePath.join(extensionRoot, "package.json"),
    JSON.stringify(extensionPackage, null, 2),
  );
  const sdkFile = NodePath.join(workspace, "packages/t3-extension-sdk/package.json");
  const sdk = await readJson(sdkFile);
  sdk.name = sdkName;
  sdk.version = metadata.version;
  await NodeFSP.writeFile(sdkFile, JSON.stringify(sdk, null, 2));
  // Hosts use the internal name; both names resolve to the same workspace instance.
  for (const app of ["web", "mobile"]) {
    const file = NodePath.join(workspace, "apps", app, "package.json");
    const manifest = await readJson(file);
    manifest.dependencies["@t3tools/t3-extension-sdk"] = `workspace:${sdkName}@*`;
    manifest.dependencies[extensionPackage.name] = "workspace:*";
    await NodeFSP.writeFile(file, JSON.stringify(manifest, null, 2));
  }
  for (const [surface, app] of [
    ["web", "web"],
    ["native", "mobile"],
  ]) {
    const entry = NodePath.join(extensionRoot, product.entries[surface]);
    await NodeFSP.access(entry);
    const destination = NodePath.join(workspace, "apps", app, "src/extensions/product.ts");
    await NodeFSP.mkdir(NodePath.dirname(destination), { recursive: true });
    const relative = NodePath.relative(NodePath.dirname(destination), entry)
      .split(NodePath.sep)
      .join("/");
    await NodeFSP.writeFile(destination, `export { default } from ${JSON.stringify(relative)};\n`);
    await NodeFSP.writeFile(
      NodePath.join(NodePath.dirname(destination), "services.ts"),
      `export const services: Readonly<Record<string, string>> = ${JSON.stringify(product.services ?? {})};\n`,
    );
  }
  const assets = {};
  for (const [key, source] of Object.entries(product.assets ?? {})) {
    const destination = NodePath.join(workspace, "product-assets", key, NodePath.basename(source));
    await NodeFSP.mkdir(NodePath.dirname(destination), { recursive: true });
    await NodeFSP.copyFile(NodePath.join(root, source), destination);
    assets[key] = destination;
  }
  await NodeFSP.writeFile(
    NodePath.join(workspace, "t3.product.json"),
    JSON.stringify({ ...product, assets }, null, 2),
  );
  const lock = NodePath.join(root, "t3-kit.lock.yaml");
  if (!update) {
    try {
      await NodeFSP.copyFile(lock, NodePath.join(workspace, "pnpm-lock.yaml"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      else update = true;
    }
  }
  await execute("vp", ["install", ...(update ? [] : ["--frozen-lockfile"])], { cwd: workspace });
  await NodeFSP.copyFile(NodePath.join(workspace, "pnpm-lock.yaml"), lock);
  await NodeFSP.writeFile(
    marker,
    JSON.stringify({ ...metadata, productFingerprint: productFingerprint(product) }, null, 2),
  );
  return workspace;
}

export async function buildProduct({ root, target, kitRoot, dev = false, execute = run }) {
  if (!BUILD_TARGETS.includes(target)) throw new Error(`Unknown build target: ${target}`);
  const workspace = NodePath.join(root, ".t3-kit/workspace");
  const prepared = await readJson(NodePath.join(root, ".t3-kit/metadata.json"));
  if (kitRoot) {
    const installed = await readJson(NodePath.join(kitRoot, "metadata.json"));
    const sdk = await readJson(
      NodePath.join(root, "node_modules", installed.scope, "t3-extension-sdk/package.json"),
    );
    if (sdk.version !== installed.version)
      throw new Error("Installed SDK must exactly match the kit version.");
    if (
      prepared.version !== installed.version ||
      prepared.scope !== installed.scope ||
      prepared.sourceCommit !== installed.sourceCommit
    )
      throw new Error("Kit version changed. Run t3-kit prepare --update.");
  }
  const product = await loadProduct(root);
  if (prepared.productFingerprint !== productFingerprint(product))
    throw new Error("Product configuration changed. Run t3-kit prepare.");
  const env = {
    ...process.env,
    T3CODE_PRODUCT_CONFIG: NodePath.join(workspace, "t3.product.json"),
    T3CODE_HOME: NodePath.join(root, ".t3-kit/state"),
  };
  await execute("node", ["scripts/validate-product-extensions.ts"], { cwd: workspace, env });
  if (!dev) {
    // Consumer screens live outside each app's composite project file list.
    for (const app of ["web", "mobile"])
      await execute("vp", ["exec", "tsc-rs", "--noEmit", "--composite", "false"], {
        cwd: NodePath.join(workspace, "apps", app),
        env,
      });
  }
  if (target === "ios" || target === "android") {
    const cwd = NodePath.join(workspace, "apps/mobile");
    if (dev)
      return execute("vp", ["exec", "expo", "start", "--dev-client", "--scheme", product.scheme], {
        cwd,
        env,
      });
    await execute("vp", ["exec", "expo", "export", "--platform", target, "--max-workers", "4"], {
      cwd,
      env,
    });
    await execute(
      "vp",
      ["exec", "expo", "prebuild", "--platform", target, "--clean", "--no-install"],
      {
        cwd,
        env: { ...env, EXPO_NO_GIT_STATUS: "1" },
      },
    );
    if (target === "android")
      return execute("./gradlew", ["assembleDebug", "--no-daemon"], {
        cwd: NodePath.join(cwd, "android"),
        env,
      });
    await execute("pod", ["install"], { cwd: NodePath.join(cwd, "ios"), env });
    const workspaces = (await NodeFSP.readdir(NodePath.join(cwd, "ios"))).filter((file) =>
      file.endsWith(".xcworkspace"),
    );
    if (workspaces.length !== 1) throw new Error("Expected one generated iOS workspace.");
    return execute(
      "xcodebuild",
      [
        "-workspace",
        workspaces[0],
        "-scheme",
        workspaces[0].replace(/\.xcworkspace$/, ""),
        "-configuration",
        "Debug",
        "-sdk",
        "iphonesimulator",
        "-destination",
        "generic/platform=iOS Simulator",
        "-derivedDataPath",
        NodePath.join(root, ".t3-kit/ios-build"),
        "CODE_SIGNING_ALLOWED=NO",
        "build",
      ],
      { cwd: NodePath.join(cwd, "ios"), env },
    );
  }
  const commands = {
    web: ["vp", dev ? ["run", "dev"] : ["run", "--filter", "@t3tools/web", "build"]],
    server: ["vp", dev ? ["run", "dev:server"] : ["run", "--filter", "t3", "build"]],
    desktop: ["vp", ["run", dev ? "dev:desktop" : "dist:desktop:artifact"]],
    ios: ["vp", ["run", "--filter", "@t3tools/mobile", dev ? "dev:client" : "ios"]],
    android: ["vp", ["run", "--filter", "@t3tools/mobile", dev ? "dev:client" : "android"]],
  };
  const [command, args] = commands[target];
  await execute(command, args, { cwd: workspace, env });
}
