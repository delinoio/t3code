# T3 source and build kit

This package builds a product from a pinned T3 source snapshot. Product code lives in a separate repository. Do not edit the generated `.t3-kit/workspace` directory.

Copy `examples/minimal` into a new repository and rename `gitignore` to `.gitignore`. Install the two exact package versions in its manifest. Run `t3-kit prepare --update` once and commit `t3-kit.lock.yaml`. Subsequent `t3-kit prepare` calls install that lock with frozen dependencies. Run prepare after editing extensions. Never put credentials in product configuration or extension source.

```
npx t3-kit prepare --update
npx t3-kit dev web
npx t3-kit build server
npx t3-kit build web
npx t3-kit build desktop
npx t3-kit build ios
npx t3-kit build android
```

The host needs Node 24.13.1 or newer and Vite Plus (`vp`). Native builds also need the platform toolchain: Xcode and CocoaPods for iOS; Java and Android SDK for Android. Signing and distribution credentials belong to the product repository. Product builds do not inherit upstream update destinations or the upstream Apple team.

Register screens using the SDK's `defineExtension`. Each platform entry exports an array. Screen loaders return a module with a default React component. IDs are unique, stable, and cannot be `more`. Use `/web` or `/native` to read the host context. The host supplies the existing environment connection; extension screens must not create a second application connection or import internal workspace files.

The `/service` entry connects external Node services to a directly reachable T3 HTTP(S) URL using an existing bearer credential. It verifies the environment identity. Dispose subscriptions and call `close()` when finished. A disconnected service connection must be closed and recreated; cloud relay login is not implemented. T3 credentials must not be sent to unrelated external services.

Turn measurements distinguish each provider turn from thread totals. The helper reports output tokens divided by the entire turn duration only when complete usage and valid timestamps exist. It does not measure the model's generation interval.

Package metadata records the source commit, upstream base commit, SDK API version and runtime requirement. Upgrade both packages together, run `prepare --update`, review the new lock and rebuild each platform before releasing your product.

The minimal example includes `service.mjs` (creates and reads a thread) and `configure-provider.mjs` (creates a Codex or Claude instance through the existing settings API). Supply their environment variables at runtime. Provider URL conversion and Codex launch arguments belong to your product; these examples do not assert compatibility with a live API provider. Automated transport fixtures verify that the configured values reach the selected harness without leaking into another instance.

Use `getWorkspace` for the current project/thread list, `getThread` for provider turns and context usage, and subscriptions for subsequent state changes. Keep the command, thread and message IDs stable when retrying a command. In client screens, subscribe to `subscribePermission` to control availability; the server still checks each command. Unsubscribe when leaving a screen. Use the host's environment list to choose a destination when no single environment is selected.

Maintainers release the two packages with the separate **Extension kit release** workflow. Supply `@delinoio`, a new exact version and the upstream base SHA. The workflow installs the actual tarballs outside the checkout and builds every target before its optional `next` publication job. Configure `NPM_TOKEN` in the `npm-extension-kit` environment. The existing upstream release workflow is unchanged. A failed build prevents publication; npm publication of two packages is sequential, so inspect the registry before retrying a partially completed publication.
