import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { stagePackages } from "../packages/t3-kit/src/package.mjs";

const [scope, version, upstreamBaseCommit, output] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Usage: node scripts/package-extension-kit.mjs @scope 0.x.y <upstream-sha> <output-directory>",
  );
await stagePackages({
  root: NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), ".."),
  output: NodePath.resolve(output),
  scope,
  version,
  upstreamBaseCommit,
});
