import { lazy } from "react";
import { extensionRegistry } from "@t3tools/t3-extension-sdk";
import product from "./product";

export const extensions = extensionRegistry(product);

export const extensionScreens = new Map(
  extensions.map((extension) => [extension.id, lazy(extension.load)]),
);
