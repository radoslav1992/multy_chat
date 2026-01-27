import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Provider } from "./chatStore";

interface ApiKeys {
  anthropic: string;
  openai: string;
  gemini: string;
  deepseek: string;
}

interface WhisperConfig {
  binaryPath: string;
  modelPath: string;
  language: string;
}

interface SettingsState {
  apiKeys: ApiKeys;
  whisperConfig: WhisperConfig;
  isLoading: boolean;
  loadApiKey: (provider: Provider) => Promise<string | null>;
  setApiKey: (provider: Provider, apiKey: string) => Promise<void>;
  deleteApiKey: (provider: Provider) => Promise<void>;
  loadAllApiKeys: () => Promise<void>;
  getApiKey: (provider: Provider) => string;
  loadWhisperConfig: () => Promise<void>;
  setWhisperConfig: (config: WhisperConfig) => Promise<void>;
  downloadWhisperModel: (modelId: string) => Promise<string>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKeys: {
    anthropic: "",
    openai: "",
    gemini: "",
    deepseek: "",
  },
  whisperConfig: {
    binaryPath: "",
    modelPath: "",
    language: "en",
  },
  isLoading: false,

  loadApiKey: async (provider: Provider) => {
    try {
      const apiKey = await invoke<string | null>("get_api_key", { provider });
      if (apiKey) {
        set((state) => ({
          apiKeys: { ...state.apiKeys, [provider]: apiKey },
        }));
      }
      return apiKey;
    } catch (error) {
      console.error(`Failed to load API key for ${provider}:`, error);
      return null;
    }
  },

  setApiKey: async (provider: Provider, apiKey: string) => {
    try {
      await invoke("set_api_key", { provider, apiKey });
      set((state) => ({
        apiKeys: { ...state.apiKeys, [provider]: apiKey },
      }));
    } catch (error) {
      console.error(`Failed to set API key for ${provider}:`, error);
      throw error;
    }
  },

  deleteApiKey: async (provider: Provider) => {
    try {
      await invoke("delete_api_key", { provider });
      set((state) => ({
        apiKeys: { ...state.apiKeys, [provider]: "" },
      }));
    } catch (error) {
      console.error(`Failed to delete API key for ${provider}:`, error);
      throw error;
    }
  },

  loadAllApiKeys: async () => {
    set({ isLoading: true });
    const providers: Provider[] = ["anthropic", "openai", "gemini", "deepseek"];
    await Promise.all(providers.map((p) => get().loadApiKey(p)));
    set({ isLoading: false });
  },

  getApiKey: (provider: Provider) => {
    return get().apiKeys[provider];
  },

  loadWhisperConfig: async () => {
    try {
      const config = await invoke<WhisperConfig>("ensure_default_whisper_config");
      set({ whisperConfig: config });
    } catch (error) {
      console.error("Failed to load whisper config:", error);
    }
  },

  setWhisperConfig: async (config: WhisperConfig) => {
    try {
      await invoke("set_whisper_config", {
        binaryPath: config.binaryPath,
        modelPath: config.modelPath,
        language: config.language,
      });
      set({ whisperConfig: config });
    } catch (error) {
      console.error("Failed to save whisper config:", error);
      throw error;
    }
  },

  downloadWhisperModel: async (modelId: string) => {
    try {
      const path = await invoke<string>("download_whisper_model", { modelId });
      return path;
    } catch (error) {
      console.error("Failed to download whisper model:", error);
      throw error;
    }
  },
}));
