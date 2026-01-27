import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type SidebarTab = "chats" | "knowledge";

interface AppState {
  theme: Theme;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  settingsOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "light",
      sidebarOpen: true,
      sidebarTab: "chats",
      settingsOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: "app-storage",
    }
  )
);
