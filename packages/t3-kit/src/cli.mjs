#!/usr/bin/env node
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { prepareWorkspace, buildProduct } from "./workspace.mjs";

const [command, ...args] = process.argv.slice(2);
const root = process.cwd();
try {
  if (command === "prepare") {
    await prepareWorkspace({
      root,
      kitRoot: NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), ".."),
      update: args.includes("--update"),
    });
  } else if (command === "build" || command === "dev") {
    await buildProduct({
      root,
      kitRoot: NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), ".."),
      target: args[0] ?? "web",
      dev: command === "dev",
    });
  } else {
    throw new Error(
      "Usage: t3-kit prepare [--update] | build|dev <web|server|desktop|ios|android>",
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
