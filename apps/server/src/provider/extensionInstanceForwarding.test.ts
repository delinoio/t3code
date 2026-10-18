import * as ClaudeSdk from "@anthropic-ai/claude-agent-sdk";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { ClaudeSettings } from "@t3tools/contracts";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { vi } from "vite-plus/test";
import { withCodexAppServerClient } from "./CodexProvider.ts";
import { probeClaudeCapabilities } from "./ClaudeProvider.ts";

vi.mock("@anthropic-ai/claude-agent-sdk", { spy: true });

const decodeClaudeSettings = Schema.decodeSync(ClaudeSettings);

const peer = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method !== "initialize") return;
  fs.writeFileSync(process.env.T3_CAPTURE, JSON.stringify({ args: process.argv.slice(2), key: process.env.OPENROUTER_API_KEY, home: process.env.CODEX_HOME }));
  process.stdout.write(JSON.stringify({ id: message.id, result: { userAgent: "codex/0.1.0", codexHome: process.env.CODEX_HOME, platformFamily: "unix", platformOs: "macos" } }) + "\n");
});
`;

it.layer(NodeServices.layer)("extension provider settings boundary", (it) => {
  it.effect("forwards Codex environment and launch config only to the selected process", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-extension-codex-" });
      const binaryPath = path.join(directory, "codex");
      yield* fs.writeFileString(binaryPath, peer);
      yield* fs.chmod(binaryPath, 0o755);
      for (const id of ["one", "two"]) {
        const capture = path.join(directory, `${id}.json`);
        const environment = yield* mergeProviderInstanceEnvironment(
          [
            { name: "OPENROUTER_API_KEY", value: `fixture-${id}`, sensitive: true },
            { name: "T3_CAPTURE", value: capture, sensitive: false },
          ],
          { PATH: process.env.PATH },
        );
        yield* withCodexAppServerClient({
          binaryPath,
          cwd: directory,
          homePath: directory,
          environment,
          launchArgs: `-c 'model_provider="${id}"'`,
        }).pipe(Effect.scoped);
        const received = JSON.parse(yield* fs.readFileString(capture));
        assert.equal(received.key, `fixture-${id}`);
        assert.equal(received.home, directory);
        assert.deepEqual(received.args, ["app-server", "-c", `model_provider="${id}"`]);
      }
    }),
  );

  it.effect("passes isolated Claude instance credentials to the SDK transport", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-extension-claude-" });
      const received: Array<string | undefined> = [];
      const query = vi.spyOn(ClaudeSdk, "query").mockImplementation(({ options }) => {
        received.push(options?.env?.ANTHROPIC_AUTH_TOKEN);
        assert.equal(options?.env?.ANTHROPIC_BASE_URL, "https://provider.example.test");
        return { initializationResult: async () => ({ commands: [] }) } as unknown as ReturnType<
          typeof ClaudeSdk.query
        >;
      });
      yield* Effect.addFinalizer(() => Effect.sync(() => query.mockRestore()));
      for (const id of ["one", "two"]) {
        const environment = yield* mergeProviderInstanceEnvironment(
          [
            { name: "ANTHROPIC_AUTH_TOKEN", value: `fixture-${id}`, sensitive: true },
            {
              name: "ANTHROPIC_BASE_URL",
              value: "https://provider.example.test",
              sensitive: false,
            },
          ],
          {},
        );
        yield* probeClaudeCapabilities(
          decodeClaudeSettings({ homePath: directory }),
          environment,
          directory,
          false,
        );
      }
      assert.deepEqual(received, ["fixture-one", "fixture-two"]);
    }),
  );
});
