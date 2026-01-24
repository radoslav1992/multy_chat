import { create } from "zustand";
import {
  ModelsConfig,
  ModelConfig,
  loadModelsConfig,
  getModelsForProvider,
  getDefaultModelForProvider,
} from "@/services/modelsService";
import { Provider } from "@/stores/chatStore";

interface ModelsState {
  config: ModelsConfig | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // Actions
  loadModels: (forceRefresh?: boolean) => Promise<void>;
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
