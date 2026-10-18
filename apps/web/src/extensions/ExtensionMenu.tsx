import { observeResize } from "../lib/observeResize";
import { useLayoutEffect, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useOpenExtension } from "./navigation";
import { EllipsisIcon } from "lucide-react";
import { SidebarMenuButton, useSidebar } from "../components/ui/sidebar";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../components/ui/tooltip";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { extensions } from "./registry";
import { ExtensionIcon } from "./ExtensionIcon";

export function ExtensionMenu() {
  const ref = useRef<HTMLLIElement>(null);
  const [capacity, setCapacity] = useState(0);
  const openExtension = useOpenExtension();
  const selected = useParams({ strict: false, select: (params) => params.extensionId });
  const { isMobile, setOpenMobile } = useSidebar();
  useLayoutEffect(() => {
    const element = ref.current;
    const parent = element?.parentElement;
    if (!element || !parent) return;
    const measure = () => {
      const siblings = Array.from(parent.children).filter((child) => child !== element);
      const used = siblings.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
      const gap = Number.parseFloat(getComputedStyle(parent).columnGap) || 0;
      setCapacity(
        Math.max(1, Math.floor((parent.clientWidth - used - siblings.length * gap) / 40)),
      );
    };
    measure();
    return observeResize(
      [parent, ...Array.from(parent.children).filter((child) => child !== element)],
      measure,
    );
  }, []);
  const overflow = extensions.length > capacity;
  const count = overflow ? Math.max(0, capacity - 1) : extensions.length;
  const open = (id: string) => {
    if (isMobile) setOpenMobile(false);
    void openExtension(id);
  };
  if (extensions.length === 0) return null;
  return (
    <li ref={ref} className="flex min-w-0 items-center">
      {extensions.slice(0, count).map((extension) => (
        <div key={extension.id} className="w-10 shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarMenuButton
                  size="icon-lg"
                  aria-label={extension.title}
                  isActive={selected === extension.id}
                  aria-current={selected === extension.id ? "page" : undefined}
                  onClick={() => open(extension.id)}
                >
                  <ExtensionIcon icon={extension.icon} />
                </SidebarMenuButton>
              }
            />
            <TooltipPopup side="top">{extension.title}</TooltipPopup>
          </Tooltip>
        </div>
      ))}
      {overflow ? (
        <Menu>
          <MenuTrigger
            render={
              <SidebarMenuButton size="icon-lg" aria-label="More extensions">
                <EllipsisIcon />
              </SidebarMenuButton>
            }
          />
          <MenuPopup side="top">
            {extensions.slice(count).map((extension) => (
              <MenuItem key={extension.id} onClick={() => open(extension.id)}>
                <ExtensionIcon icon={extension.icon} />
                {extension.title}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      ) : null}
    </li>
  );
}
