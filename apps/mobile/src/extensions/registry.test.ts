import { expect, it } from "vite-plus/test";
import { phoneWorkspaceDestinations, workspaceDestinations } from "./registry";
it("preserves the default tabs and uses More only after two extensions", () => {
  expect(phoneWorkspaceDestinations(workspaceDestinations)).toBe(workspaceDestinations);
  const added = ["one", "two", "three"].map((id) => ({
    id: `extension:${id}` as const,
    label: id,
    icon: "gearshape" as const,
  }));
  const two = [...workspaceDestinations, ...added.slice(0, 2)];
  expect(phoneWorkspaceDestinations(two)).toBe(two);
  expect(
    phoneWorkspaceDestinations([...workspaceDestinations, ...added]).map((tab) => tab.id),
  ).toEqual(["threads", "pullRequests", "extension:one", "extension:more"]);
});
