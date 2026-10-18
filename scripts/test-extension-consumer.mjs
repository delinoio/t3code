import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import { run } from "../packages/t3-kit/src/process.mjs";

const [directory, target = "web"] = process.argv.slice(2);
if (!directory)
  throw new Error("Usage: node scripts/test-extension-consumer.mjs <tarball-directory> <target>");
const tarballs = (await NodeFSP.readdir(directory)).filter((file) => file.endsWith(".tgz"));
if (tarballs.length !== 2) throw new Error("Expected exactly the kit and SDK tarballs.");
const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-consumer-"));
console.log(`External consumer: ${root}`);
await NodeFSP.writeFile(
  NodePath.join(root, "package.json"),
  JSON.stringify({ name: "isolated-t3-consumer", private: true, type: "module" }),
);
await run(
  "npm",
  ["install", "--ignore-scripts", ...tarballs.map((file) => NodePath.resolve(directory, file))],
  { cwd: root },
);
const installed = JSON.parse(await NodeFSP.readFile(NodePath.join(root, "package.json"), "utf8"));
const kitName = Object.keys(installed.dependencies).find((name) => name.endsWith("/t3-kit"));
if (!kitName) throw new Error("Kit package missing.");
const kitRoot = NodePath.join(root, "node_modules", kitName);
const example = NodePath.join(kitRoot, "examples/minimal");
for (const entry of await NodeFSP.readdir(example)) {
  if (entry === "package.json") continue;
  await NodeFSP.cp(
    NodePath.join(example, entry),
    NodePath.join(root, entry === "gitignore" ? ".gitignore" : entry),
    { recursive: true },
  );
}
const cli = NodePath.join(kitRoot, "src/cli.mjs");
await run("node", [cli, "prepare", "--update"], { cwd: root });
await run("node", [cli, "prepare"], { cwd: root });
await run("node", [cli, "build", target], { cwd: root });
console.log(`Validated ${target} from tarballs in ${root}`);
