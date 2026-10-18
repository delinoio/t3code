import * as NodeTest from "node:test";
import * as NodeAssert from "node:assert/strict";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { defineProduct } from "./product.mjs";
import { isSourceInput } from "./package.mjs";
import { prepareWorkspace, buildProduct } from "./workspace.mjs";

const product = {
  name: "Consumer",
  desktopAppId: "org.example.desktop",
  iosBundleIdentifier: "org.example.ios",
  androidApplicationId: "org.example.android",
  scheme: "consumer",
  extensionDirectory: "extensions",
  entries: { web: "web.ts", native: "native.ts" },
};

NodeTest.test(
  "rejects extension paths outside the consumer and credentials in service URLs",
  () => {
    NodeAssert.throws(() => defineProduct({ ...product, extensionDirectory: "../other" }));
    NodeAssert.throws(() =>
      defineProduct({ ...product, entries: { web: "/tmp/web.ts", native: "native.ts" } }),
    );
    NodeAssert.throws(() =>
      defineProduct({ ...product, services: { issues: "https://user:secret@example.org" } }),
    );
  },
);

NodeTest.test("source collection preserves native dependencies and excludes local state", () => {
  for (const file of [
    "apps/mobile/deps/custom.tgz",
    "apps/mobile/modules/control/android/src/Main.kt",
    "patches/expo.patch",
    "apps/server/src/secrets/SecretRequests.ts",
    "pnpm-lock.yaml",
  ])
    NodeAssert.equal(isSourceInput(file), true, file);
  for (const file of [
    ".env",
    "apps/web/.env.production",
    "apps/server/.t3/state.sqlite",
    "apps/web/dist/index.html",
    ".repos/reference/index.ts",
    "packages/shared/node_modules/dependency/index.js",
  ])
    NodeAssert.equal(isSourceInput(file), false, file);
});

async function fixture(t) {
  const base = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-kit-NodeTest.test-"));
  t.after(() => NodeFSP.rm(base, { recursive: true, force: true }));
  const root = NodePath.join(base, "consumer");
  const kitRoot = NodePath.join(base, "kit");
  await NodeFSP.mkdir(NodePath.join(root, "extensions"), { recursive: true });
  await NodeFSP.mkdir(kitRoot);
  await NodeFSP.mkdir(NodePath.join(root, "node_modules/@consumer/t3-extension-sdk"), {
    recursive: true,
  });
  await NodeFSP.writeFile(
    NodePath.join(root, "node_modules/@consumer/t3-extension-sdk/package.json"),
    JSON.stringify({ version: "0.1.0" }),
  );
  await NodeFSP.writeFile(
    NodePath.join(kitRoot, "metadata.json"),
    JSON.stringify({ scope: "@consumer", version: "0.1.0" }),
  );
  await NodeFSP.writeFile(NodePath.join(root, ".gitignore"), "/.t3-kit/\n");
  await NodeFSP.writeFile(
    NodePath.join(root, "t3.product.mjs"),
    `export default ${JSON.stringify(product)};`,
  );
  await NodeFSP.writeFile(
    NodePath.join(root, "extensions/package.json"),
    JSON.stringify({
      name: "consumer-extensions",
      dependencies: { "@consumer/t3-extension-sdk": "0.1.0" },
    }),
  );
  for (const entry of ["web.ts", "native.ts"])
    await NodeFSP.writeFile(NodePath.join(root, "extensions", entry), "export default [];\n");
  await NodeFSP.writeFile(NodePath.join(root, "extensions/.env"), "TOKEN=never-copy");
  const calls = [];
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "tar") {
      const workspace = args[args.indexOf("-C") + 1];
      for (const directory of ["apps/web", "apps/mobile", "packages/t3-extension-sdk"]) {
        await NodeFSP.mkdir(NodePath.join(workspace, directory), { recursive: true });
        await NodeFSP.writeFile(
          NodePath.join(workspace, directory, "package.json"),
          JSON.stringify({ name: directory, dependencies: {} }),
        );
      }
      await NodeFSP.writeFile(
        NodePath.join(workspace, "pnpm-workspace.yaml"),
        "packages:\n  - apps/*\n  - packages/*\n",
      );
      await NodeFSP.writeFile(NodePath.join(workspace, "pnpm-lock.yaml"), "base lock");
    } else if (command === "vp" && args[0] === "install") {
      if (args.includes("--frozen-lockfile"))
        NodeAssert.equal(
          await NodeFSP.readFile(NodePath.join(options.cwd, "pnpm-lock.yaml"), "utf8"),
          "consumer lock",
        );
      await NodeFSP.writeFile(NodePath.join(options.cwd, "pnpm-lock.yaml"), "consumer lock");
    }
  };
  return { root, kitRoot, execute, calls };
}

NodeTest.test(
  "prepares an isolated workspace, maps the public SDK, and reuses the consumer lock",
  async (t) => {
    const input = await fixture(t);
    const workspace = await prepareWorkspace(input);
    NodeAssert.equal(
      await NodeFSP.readFile(NodePath.join(input.root, "t3-kit.lock.yaml"), "utf8"),
      "consumer lock",
    );
    const extension = JSON.parse(
      await NodeFSP.readFile(NodePath.join(workspace, "extensions/product/package.json"), "utf8"),
    );
    NodeAssert.equal(extension.dependencies["@consumer/t3-extension-sdk"], "workspace:*");
    await NodeAssert.rejects(NodeFSP.access(NodePath.join(workspace, "extensions/product/.env")));
    NodeAssert.match(
      await NodeFSP.readFile(
        NodePath.join(workspace, "apps/web/src/extensions/product.ts"),
        "utf8",
      ),
      /extensions\/product\/web.ts/,
    );
    await prepareWorkspace(input);
    NodeAssert.ok(input.calls.some(({ args }) => args.includes("--frozen-lockfile")));
  },
);

NodeTest.test("rejects SDK mismatch and unknown targets without running a build", async (t) => {
  const input = await fixture(t);
  await NodeFSP.writeFile(
    NodePath.join(input.root, "extensions/package.json"),
    JSON.stringify({
      name: "extensions",
      dependencies: { "@consumer/t3-extension-sdk": "^0.1.0" },
    }),
  );
  await NodeAssert.rejects(prepareWorkspace(input), /exactly match/);
  await NodeAssert.rejects(
    buildProduct({ root: input.root, target: "unknown", execute: input.execute }),
    /Unknown build target/,
  );
});
