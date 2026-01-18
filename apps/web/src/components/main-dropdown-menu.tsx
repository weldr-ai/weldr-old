import { Link, useNavigate } from "@tanstack/react-router";
import { useTheme } from "better-themes";
import {
  BoxesIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HelpCircleIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  PlusIcon,
  RssIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react";

import type { Session } from "@weldr/auth";
import { Button } from "@weldr/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@weldr/ui/components/dropdown-menu";
import { cn } from "@weldr/ui/lib/utils";
import { WeldrLogo } from "@weldr/ui/logos/weldr";

import { authClient } from "@/lib/auth/client";
import { useUIStore } from "@/lib/context/ui-store";

export function MainDropdownMenu({
  side = "bottom",
  className,
  session,
}: {
  side?: "bottom" | "top" | "left" | "right";
  className?: string;
  session: Session | null;
}) {
  const navigate = useNavigate();
  const { setCommandCenterView, setCommandCenterOpen, setAccountSettingsOpen } = useUIStore();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className={cn("size-8", className)}>
            <WeldrLogo className="size-6" />
            <span className="sr-only">Weldr</span>
          </Button>
        }
      />
      <DropdownMenuContent className="w-56" align="start" side={side}>
        {session && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Projects</DropdownMenuLabel>
              <Link to="/">
                <DropdownMenuItem>
                  <LayoutDashboardIcon className="mr-2 size-3.5 text-muted-foreground" />
                  Home
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem
                onClick={() => {
                  setCommandCenterView("create");
                  setCommandCenterOpen(true);
                }}
              >
                <PlusIcon className="mr-2 size-3.5 text-muted-foreground" />
                Create Project
                <kbd className="pointer-events-none ml-auto inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 select-none">
                  <span className="text-xs">
                    {typeof window !== "undefined" &&
                    window.navigator?.userAgent.toLowerCase().includes("mac")
                      ? "⌘"
                      : "Ctrl"}
                  </span>
                  <span className="text-xs">
                    {typeof window !== "undefined" &&
                    window.navigator?.userAgent.toLowerCase().includes("mac")
                      ? "⌥"
                      : "Alt"}
                  </span>
                  <span className="text-xs">n</span>
                </kbd>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setCommandCenterView("projects");
                  setCommandCenterOpen(true);
                }}
              >
                <BoxesIcon className="mr-2 size-3.5 text-muted-foreground" />
                View All Projects
                <kbd className="pointer-events-none ml-auto inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 select-none">
                  <span className="text-xs">
                    {typeof window !== "undefined" &&
                    window.navigator?.userAgent.toLowerCase().includes("mac")
                      ? "⌘"
                      : "Ctrl"}
                  </span>
                  k
                </kbd>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {session && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                setAccountSettingsOpen(true);
              }}
            >
              <SettingsIcon className="mr-2 size-4 text-muted-foreground" />
              Account Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PaletteIcon className="mr-3.5 size-4 text-muted-foreground" />
            Appearance
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value)}>
              <DropdownMenuRadioItem value="light">
                Light
                <SunIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                Dark
                <MoonIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                System
                <MonitorIcon className="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Support</DropdownMenuLabel>
          <a href="https://weldr.ai/support" target="_blank" rel="noopener noreferrer">
            <DropdownMenuItem>
              <HelpCircleIcon className="mr-2 size-3.5 text-muted-foreground" />
              Help
              <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>
          </a>

          <a href="https://blog.weldr.ai" target="_blank" rel="noopener noreferrer">
            <DropdownMenuItem>
              <RssIcon className="mr-2 size-3.5 text-muted-foreground" />
              Blog
              <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>
          </a>

          <a href="https://docs.weldr.ai" target="_blank" rel="noopener noreferrer">
            <DropdownMenuItem>
              <FileTextIcon className="mr-2 size-3.5 text-muted-foreground" />
              Docs
              <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
            </DropdownMenuItem>
          </a>
        </DropdownMenuGroup>

        {session && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () =>
                await authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      navigate({ to: "/auth/sign-in" });
                    },
                  },
                })
              }
            >
              <LogOutIcon className="mr-2 size-3.5 text-destructive" />
              Logout
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
