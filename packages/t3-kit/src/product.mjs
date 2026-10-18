import * as NodePath from "node:path";

export const BUILD_TARGETS = ["server", "web", "desktop", "ios", "android"];

export function relativeInput(value, field) {
  if (
    typeof value !== "string" ||
    !value ||
    NodePath.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`${field} must be a relative path inside the product repository.`);
  }
  return value;
}

export function defineProduct(product) {
  if (!product || typeof product !== "object")
    throw new Error("A product configuration is required.");
  for (const key of [
    "name",
    "desktopAppId",
    "iosBundleIdentifier",
    "androidApplicationId",
    "scheme",
  ]) {
    if (typeof product[key] !== "string" || !product[key].trim())
      throw new Error(`Missing product.${key}.`);
  }
  if (!/^[a-z][a-z0-9+.-]*$/.test(product.scheme)) throw new Error("Invalid product.scheme.");
  const extensionDirectory = relativeInput(product.extensionDirectory, "extensionDirectory");
  for (const surface of ["web", "native"])
    relativeInput(product.entries?.[surface], `entries.${surface}`);
  for (const [key, value] of Object.entries(product.assets ?? {}))
    relativeInput(value, `assets.${key}`);
  for (const [name, address] of Object.entries(product.services ?? {})) {
    const url = new URL(address);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error(`Invalid service address: ${name}.`);
    }
  }
  return Object.freeze({ ...product, extensionDirectory });
}
