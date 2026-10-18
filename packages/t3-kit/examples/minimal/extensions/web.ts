import { defineExtension } from "@SCOPE/t3-extension-sdk";
export default [
  defineExtension({
    id: "measurements",
    title: "Measurements",
    icon: "activity",
    load: () => import("./web-screen"),
  }),
  defineExtension({
    id: "issues",
    title: "Issues",
    icon: "issues",
    load: () => import("./web-issues"),
  }),
];
