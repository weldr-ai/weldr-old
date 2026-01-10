"use client";

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
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { authClient } from "@weldr/auth/client";
import { Button } from "@weldr/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { LogoIcon } from "@weldr/ui/icons";
import { cn } from "@weldr/ui/lib/utils";

import { useUIStore } from "@/lib/context/ui-store";

export function MainDropdownMenu({
  side = "bottom",
  className,
}: {
  side?: "bottom" | "top" | "left" | "right";
  className?: string;
}) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { setCommandCenterView, setCommandCenterOpen, setAccountSettingsOpen } = useUIStore();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-8", className)}>
          <LogoIcon className="size-6" />
          <span className="sr-only">Weldr</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start" side={side}>
        {session && (
          <>
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            <Link href="/">
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
              <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
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
              <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100">
                <span className="text-xs">
                  {typeof window !== "undefined" &&
                  window.navigator?.userAgent.toLowerCase().includes("mac")
                    ? "⌘"
                    : "Ctrl"}
                </span>
                k
              </kbd>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {session && (
          <>
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                setAccountSettingsOpen(true);
              }}
            >
              <SettingsIcon className="mr-2 size-4 text-muted-foreground" />
              Account Settings
            </DropdownMenuItem>
          </>
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

        <DropdownMenuLabel>Support</DropdownMenuLabel>
        <Link href="https://weldr.ai/support" target="_blank">
          <DropdownMenuItem>
            <HelpCircleIcon className="mr-2 size-3.5 text-muted-foreground" />
            Help
            <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
          </DropdownMenuItem>
        </Link>

        <Link href="https://blog.weldr.ai" target="_blank">
          <DropdownMenuItem>
            <RssIcon className="mr-2 size-3.5 text-muted-foreground" />
            Blog
            <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
          </DropdownMenuItem>
        </Link>

        <Link href="https://docs.weldr.ai" target="_blank">
          <DropdownMenuItem>
            <FileTextIcon className="mr-2 size-3.5 text-muted-foreground" />
            Docs
            <ExternalLinkIcon className="ml-auto size-3 text-muted-foreground" />
          </DropdownMenuItem>
        </Link>

        {session && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () =>
                await authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push("/auth/sign-in");
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
