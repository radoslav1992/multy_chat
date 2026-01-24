import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface AppState {
  theme: Theme;
  sidebarOpen: boolean;
  knowledgeSidebarOpen: boolean;
  settingsOpen: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  toggleKnowledgeSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "light",
      sidebarOpen: true,
      knowledgeSidebarOpen: false,
      settingsOpen: false,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleKnowledgeSidebar: () =>
        set((state) => ({ knowledgeSidebarOpen: !state.knowledgeSidebarOpen })),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
    }),
    {
      name: "app-storage",
    }
  )
);
