"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type CommandCenterView = "create" | "projects";

interface UIStoreContextType {
  // Auth Dialog
  authDialogOpen: boolean;
  setAuthDialogOpen: (open: boolean) => void;
  authDialogView: "sign-in" | "sign-up";
  setAuthDialogView: (view: "sign-in" | "sign-up") => void;

  // Account Settings
  accountSettingsOpen: boolean;
  setAccountSettingsOpen: (open: boolean) => void;

  // Command Center
  commandCenterOpen: boolean;
  setCommandCenterOpen: (open: boolean) => void;
  commandCenterView: CommandCenterView;
  setCommandCenterView: (view: CommandCenterView) => void;
}

const UIStoreContext = createContext<UIStoreContextType | undefined>(undefined);

export function useUIStore(props?: { commandCenterActiveView?: CommandCenterView }) {
  const { commandCenterActiveView } = props ?? {};

  const context = useContext(UIStoreContext);
  if (context === undefined) {
    throw new Error("useUIStore must be used within an UIStoreProvider");
  }

  const { setCommandCenterView } = context;

  useEffect(() => {
    if (commandCenterActiveView) {
      setCommandCenterView(commandCenterActiveView);
    }
  }, [commandCenterActiveView, setCommandCenterView]);

  return context;
}

export function UIStoreProvider({ children }: { children: ReactNode }) {
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogView, setAuthDialogView] = useState<"sign-in" | "sign-up">("sign-in");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [commandCenterOpen, setCommandCenterOpen] = useState(false);
  const [commandCenterView, setCommandCenterView] = useState<CommandCenterView>("create");

  return (
    <UIStoreContext.Provider
      value={{
        // Auth Dialog
        authDialogOpen,
        setAuthDialogOpen,
        authDialogView,
        setAuthDialogView,

        // Account Settings
        accountSettingsOpen,
        setAccountSettingsOpen,

        // Command Center
        commandCenterOpen,
        setCommandCenterOpen,
        commandCenterView,
        setCommandCenterView,
      }}
    >
      {children}
    </UIStoreContext.Provider>
  );
}
