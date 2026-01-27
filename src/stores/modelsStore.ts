import { create } from "zustand";
import {
  ModelsConfig,
  ModelConfig,
  loadModelsConfig,
  getModelsForProvider,
  getDefaultModelForProvider,
  clearModelsCache,
} from "@/services/modelsService";
import { Provider } from "@/stores/chatStore";

interface ModelsState {
  config: ModelsConfig | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // Actions
  loadModels: (forceRefresh?: boolean) => Promise<void>;
  refreshModels: () => Promise<void>;
  getModels: (provider: Provider) => ModelConfig[];
  getDefaultModel: (provider: Provider) => string;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,
  lastUpdated: null,

  loadModels: async (forceRefresh = false) => {
    set({ isLoading: true, error: null });
    try {
      const config = await loadModelsConfig(forceRefresh);
      set({
        config,
        isLoading: false,
        lastUpdated: config.lastUpdated,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load models",
      });
    }
  },

  refreshModels: async () => {
    // Clear cache and force reload
    clearModelsCache();
    set({ config: null, isLoading: true, error: null });
    try {
      const config = await loadModelsConfig(true);
      set({
        config,
        isLoading: false,
        lastUpdated: config.lastUpdated,
      });
      console.log("[ModelsStore] Models refreshed, version:", config.version);
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to refresh models",
      });
    }
  },

  getModels: (provider: Provider) => {
    const { config } = get();
    if (!config) return [];
    return getModelsForProvider(config, provider);
  },

  getDefaultModel: (provider: Provider) => {
    const { config } = get();
    if (!config) return "";
    return getDefaultModelForProvider(config, provider);
  },
}));
