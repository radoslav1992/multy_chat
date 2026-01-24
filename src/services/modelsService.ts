import { Provider } from "@/stores/chatStore";

export interface ModelConfig {
  id: string;
  name: string;
}

export interface ProviderConfig {
  name: string;
  models: ModelConfig[];
  default: string;
}

export interface ModelsConfig {
  version: string;
  lastUpdated: string;
  providers: Record<Provider, ProviderConfig>;
}

// GitHub Gist raw URL for models config
const REMOTE_CONFIG_URL = "https://gist.githubusercontent.com/radoslav1992/4cbac7dbb64fcb1a851de3e22dea6c4c/raw/models.json";

// Local fallback URL (works in dev mode)
const LOCAL_CONFIG_URL = "/models.json";

const CACHE_KEY = "models_config_cache";
const CACHE_EXPIRY_KEY = "models_config_expiry";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Hardcoded fallback in case both remote and local fail
const FALLBACK_CONFIG: ModelsConfig = {
  version: "fallback",
  lastUpdated: "2026-01-24",
  providers: {
    anthropic: {
      name: "Anthropic",
      models: [
        { id: "claude-4-5-sonnet-20250514", name: "Claude 4.5 Sonnet" },
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      ],
      default: "claude-4-5-sonnet-20250514",
    },
    openai: {
      name: "OpenAI",
      models: [
        { id: "gpt-4o", name: "GPT-4o" },
        { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      ],
      default: "gpt-4o",
    },
    gemini: {
      name: "Google Gemini",
      models: [
        { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      ],
      default: "gemini-2.5-flash",
    },
    deepseek: {
      name: "DeepSeek",
      models: [
        { id: "deepseek-chat", name: "DeepSeek V3" },
        { id: "deepseek-reasoner", name: "DeepSeek R1" },
      ],
      default: "deepseek-chat",
    },
  },
};

function getCachedConfig(): ModelsConfig | null {
  try {
    const expiry = localStorage.getItem(CACHE_EXPIRY_KEY);
    if (expiry && Date.now() > parseInt(expiry, 10)) {
      // Cache expired
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      return null;
    }

    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ModelsConfig;
    }
  } catch (e) {
    console.warn("[ModelsService] Failed to read cache:", e);
  }
  return null;
}

function setCachedConfig(config: ModelsConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(config));
    localStorage.setItem(CACHE_EXPIRY_KEY, String(Date.now() + CACHE_DURATION_MS));
  } catch (e) {
    console.warn("[ModelsService] Failed to write cache:", e);
  }
}

async function fetchConfig(url: string): Promise<ModelsConfig | null> {
  try {
    const response = await fetch(url, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data as ModelsConfig;
  } catch (e) {
    console.warn(`[ModelsService] Failed to fetch from ${url}:`, e);
    return null;
  }
}

export async function loadModelsConfig(forceRefresh = false): Promise<ModelsConfig> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = getCachedConfig();
    if (cached) {
      console.log("[ModelsService] Using cached config, version:", cached.version);
      return cached;
    }
  }

  // Try local config first (faster, works in dev)
  let config = await fetchConfig(LOCAL_CONFIG_URL);
  
  // If local fails, try remote
  if (!config) {
    console.log("[ModelsService] Local config not found, trying remote...");
    config = await fetchConfig(REMOTE_CONFIG_URL);
  }

  // If both fail, use fallback
  if (!config) {
    console.warn("[ModelsService] Using hardcoded fallback config");
    return FALLBACK_CONFIG;
  }

  // Cache the successful result
  setCachedConfig(config);
  console.log("[ModelsService] Loaded config, version:", config.version);
  
  return config;
}

export function getModelsForProvider(config: ModelsConfig, provider: Provider): ModelConfig[] {
  return config.providers[provider]?.models || [];
}

export function getDefaultModelForProvider(config: ModelsConfig, provider: Provider): string {
  return config.providers[provider]?.default || config.providers[provider]?.models[0]?.id || "";
}
