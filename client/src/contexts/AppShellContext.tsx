import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type AppShellContextValue = {
  sidebarOpen: boolean;
  activeModule: string;
  commandPaletteOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setActiveModule: (module: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState("overview");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen(open => !open), []);
  const value = useMemo(
    () => ({
      sidebarOpen,
      activeModule,
      commandPaletteOpen,
      setSidebarOpen,
      toggleSidebar,
      setActiveModule,
      setCommandPaletteOpen,
    }),
    [sidebarOpen, activeModule, commandPaletteOpen, toggleSidebar]
  );
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell() {
  const value = useContext(AppShellContext);
  if (!value)
    throw new Error("useAppShell must be used inside AppShellProvider");
  return value;
}
