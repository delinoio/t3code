// @effect-diagnostics nodeBuiltinImport:off - Build configuration runs before an Effect runtime exists.
import * as NodeFS from "node:fs";

interface ProductBuildConfig {
  readonly name: string;
  readonly desktopAppId: string;
  readonly iosBundleIdentifier: string;
  readonly androidApplicationId: string;
  readonly scheme: string;
  readonly assets?: { readonly icon?: string; readonly windowsIcon?: string };
  readonly desktopUpdateRepository?: string;
  readonly ios?: { readonly appleTeamId?: string; readonly associatedDomains?: string[] };
  readonly expo?: {
    readonly owner: string;
    readonly projectId: string;
    readonly updatesUrl?: string;
  };
}

export function loadProductBuildConfig(): ProductBuildConfig | undefined {
  const file = process.env.T3CODE_PRODUCT_CONFIG;
  if (!file) return undefined;
  const config = JSON.parse(NodeFS.readFileSync(file, "utf8")) as ProductBuildConfig;
  for (const field of [
    "name",
    "desktopAppId",
    "iosBundleIdentifier",
    "androidApplicationId",
    "scheme",
  ] as const) {
    if (typeof config[field] !== "string" || !config[field])
      throw new Error(`Missing product ${field}.`);
  }
  return config;
}
