import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useLicenseStore } from "@/stores/licenseStore";
import { Provider } from "@/stores/chatStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: Provider; name: string; placeholder: string }[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "gemini", name: "Gemini", placeholder: "AI..." },
  { id: "deepseek", name: "DeepSeek", placeholder: "sk-..." },
];

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useAppStore();
  const {
    apiKeys,
    setApiKey,
    loadAllApiKeys,
    whisperConfig,
    loadWhisperConfig,
    setWhisperConfig,
    downloadWhisperModel,
  } = useSettingsStore();
  const {
    licenseKey,
    status: licenseStatus,
    message: licenseMessage,
    lastChecked,
    loadLicense,
    activateLicense,
    clearLicense,
  } = useLicenseStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [showLicenseKey, setShowLicenseKey] = useState(false);
  const [licenseInput, setLicenseInput] = useState("");
  const [whisperForm, setWhisperForm] = useState(whisperConfig);
  const [whisperSaving, setWhisperSaving] = useState(false);
  const [whisperDownloading, setWhisperDownloading] = useState<string | null>(null);
  const [whisperDownloadError, setWhisperDownloadError] = useState("");
  const [defaultWhisperModelPath, setDefaultWhisperModelPath] = useState("");
  const [fastWhisperModelPath, setFastWhisperModelPath] = useState("");
  const [storedWhisperModelId, setStoredWhisperModelId] = useState<string | null>(null);
  const [isChangingModel, setIsChangingModel] = useState(false);

  useEffect(() => {
    if (settingsOpen) {
      loadAllApiKeys();
      setEditingKeys({});
      loadWhisperConfig();
      loadLicense();
    }
  }, [settingsOpen, loadAllApiKeys, loadWhisperConfig, loadLicense]);

  useEffect(() => {
    if (settingsOpen) {
      setLicenseInput(licenseKey || "");
    }
  }, [settingsOpen, licenseKey]);

  // Reset form when dialog opens
  useEffect(() => {
    if (settingsOpen) {
      setWhisperForm(whisperConfig);
      setIsChangingModel(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen]);

  // Fetch model paths and stored model id when dialog opens
  useEffect(() => {
    if (!settingsOpen) return;
    let mounted = true;
    Promise.all([
      invoke<string>("get_default_whisper_model_path"),
      invoke<string>("get_whisper_model_path", { modelId: "tiny.en" }),
      invoke<string>("get_whisper_model_id"),
    ])
      .then(([defaultPath, fastPath, modelId]) => {
        if (mounted) {
          setDefaultWhisperModelPath(defaultPath);
          setFastWhisperModelPath(fastPath);
          setStoredWhisperModelId(modelId || "base.en");
        }
      })
      .catch((error) => {
        console.error("Failed to load whisper model paths:", error);
      });
    return () => {
      mounted = false;
    };
  }, [settingsOpen]);

  const handleSave = async (provider: Provider) => {
    const key = editingKeys[provider];
    if (!key) return;

    setSaving({ ...saving, [provider]: true });
    try {
      await setApiKey(provider, key);
      setEditingKeys({ ...editingKeys, [provider]: "" });
    } catch (error) {
      console.error("Failed to save API key:", error);
    } finally {
      setSaving({ ...saving, [provider]: false });
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys({ ...showKeys, [provider]: !showKeys[provider] });
  };

  const maskKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••••••" + key.slice(-4);
  };

  const handleWhisperSave = async () => {
    setWhisperSaving(true);
    try {
      await setWhisperConfig({
        binaryPath: whisperForm.binaryPath.trim(),
        modelPath: whisperForm.modelPath.trim(),
        language: whisperForm.language.trim() || "en",
      });
      setWhisperDownloadError("");
    } catch (error) {
      console.error("Failed to save whisper config:", error);
    } finally {
      setWhisperSaving(false);
    }
  };

  // Derive dropdown value from stored model id
  const whisperModelChoice: "default" | "fast" | "custom" =
    storedWhisperModelId === "tiny.en" || storedWhisperModelId === "tiny"
      ? "fast"
      : storedWhisperModelId === "custom"
        ? "custom"
        : "default";

  const handleWhisperModelChange = async (value: "default" | "fast" | "custom") => {
    if (isChangingModel) return;

    const newModelId = value === "fast" ? "tiny.en" : value === "custom" ? "custom" : "base.en";

    // Optimistically update UI immediately
    setStoredWhisperModelId(newModelId);
    setWhisperDownloadError("");
    setIsChangingModel(true);

    const baseConfig = {
      binaryPath: whisperForm.binaryPath.trim(),
      language: whisperForm.language.trim() || "en",
    };

    try {
      // Save the model id first
      await invoke("set_whisper_model_id", { modelId: newModelId });

      if (value === "default") {
        const config = await invoke<typeof whisperForm>("ensure_default_whisper_config");
        setWhisperForm(config);
        await setWhisperConfig(config);
      } else if (value === "fast") {
        const modelPath = await downloadWhisperModel("tiny.en");
        const nextConfig = {
          ...baseConfig,
          modelPath,
        };
        setWhisperForm(nextConfig);
        await setWhisperConfig(nextConfig);
      }
      // For "custom", user will configure manually
    } catch (error) {
      setWhisperDownloadError(String(error));
      // Revert on error - re-fetch actual stored value
      try {
        const actualModelId = await invoke<string>("get_whisper_model_id");
        setStoredWhisperModelId(actualModelId || "base.en");
      } catch {
        setStoredWhisperModelId("base.en");
      }
    } finally {
      setIsChangingModel(false);
    }
  };

  const handleWhisperDownload = async (modelId: string) => {
    setWhisperDownloading(modelId);
    setWhisperDownloadError("");
    try {
      const modelPath = await downloadWhisperModel(modelId);
      const nextConfig = {
        binaryPath: whisperForm.binaryPath.trim(),
        modelPath,
        language: whisperForm.language.trim() || "en",
      };
      setWhisperForm(nextConfig);
      await setWhisperConfig(nextConfig);
    } catch (error) {
      setWhisperDownloadError(String(error));
    } finally {
      setWhisperDownloading(null);
    }
  };

  const licenseBadgeClass =
    licenseStatus === "active"
      ? "text-green-600"
      : licenseStatus === "checking"
        ? "text-blue-600"
        : licenseStatus === "error"
          ? "text-red-600"
          : licenseStatus === "unverified"
            ? "text-amber-600"
            : "text-muted-foreground";

  const licenseBadgeText =
    licenseStatus === "active"
      ? "Active"
      : licenseStatus === "checking"
        ? "Verifying..."
        : licenseStatus === "error"
          ? "Invalid"
          : licenseStatus === "unverified"
            ? "Saved (unverified)"
            : "Not activated";

  const whisperConfigured = !!whisperConfig.modelPath;
  const whisperModelReady = !!whisperConfig.modelPath;

  return (
    <Dialog.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-background border border-border rounded-2xl shadow-xl z-50 p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-xl font-semibold">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                API Keys
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Your API keys are stored securely on your local machine and never
                sent to any server except the respective AI providers.
              </p>

              <div className="space-y-4">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    className="p-4 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white",
                          provider.id === "anthropic" && "bg-anthropic",
                          provider.id === "openai" && "bg-openai",
                          provider.id === "gemini" && "bg-gemini",
                          provider.id === "deepseek" && "bg-deepseek"
                        )}
                      >
                        {provider.name[0]}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium">{provider.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {apiKeys[provider.id] ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <Check className="h-3 w-3" /> Configured
                            </span>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Not configured
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {apiKeys[provider.id] ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-lg font-mono">
                            {showKeys[provider.id]
                              ? apiKeys[provider.id]
                              : maskKey(apiKeys[provider.id])}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleShowKey(provider.id)}
                          >
                            {showKeys[provider.id] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="password"
                            placeholder="Enter new key to update"
                            value={editingKeys[provider.id] || ""}
                            onChange={(e) =>
                              setEditingKeys({
                                ...editingKeys,
                                [provider.id]: e.target.value,
                              })
                            }
                            className="flex-1"
                          />
                          <Button
                            onClick={() => handleSave(provider.id)}
                            disabled={
                              !editingKeys[provider.id] || saving[provider.id]
                            }
                            size="sm"
                          >
                            {saving[provider.id] ? "Saving..." : "Update"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          placeholder={provider.placeholder}
                          value={editingKeys[provider.id] || ""}
                          onChange={(e) =>
                            setEditingKeys({
                              ...editingKeys,
                              [provider.id]: e.target.value,
                            })
                          }
                          className="flex-1"
                        />
                        <Button
                          onClick={() => handleSave(provider.id)}
                          disabled={
                            !editingKeys[provider.id] || saving[provider.id]
                          }
                          size="sm"
                        >
                          {saving[provider.id] ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Speech-to-text (Local Whisper)
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                The default model (base.en, ~142MB) is downloaded automatically on first run.
                For faster transcription, switch to the tiny.en model.
                Choose "Custom" to use another model path.
              </p>

              <div className="space-y-3 p-4 rounded-lg border border-border bg-card">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">
                    Transcription model
                  </label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                    value={whisperModelChoice}
                    disabled={isChangingModel || storedWhisperModelId === null}
                    onChange={(e) => {
                      const val = e.target.value as "default" | "fast" | "custom";
                      handleWhisperModelChange(val);
                    }}
                  >
                    <option value="default">
                      {isChangingModel && whisperModelChoice === "default"
                        ? "Switching..."
                        : "Default (base.en, ~142MB)"}
                    </option>
                    <option value="fast">
                      {isChangingModel && whisperModelChoice === "fast"
                        ? "Downloading..."
                        : "Fast (tiny.en, ~75MB)"}
                    </option>
                    <option value="custom">Custom model path</option>
                  </select>
                </div>
                {whisperModelChoice === "custom" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        Model path (.bin)
                      </label>
                      <Input
                        placeholder="/Users/you/models/ggml-base.en.bin"
                        value={whisperForm.modelPath}
                        onChange={(e) =>
                          setWhisperForm((prev) => ({
                            ...prev,
                            modelPath: e.target.value,
                          }))
                        }
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWhisperDownload("tiny.en")}
                          disabled={!!whisperDownloading}
                        >
                          {whisperDownloading === "tiny.en"
                            ? "Downloading tiny.en..."
                            : "Download tiny.en"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWhisperDownload("small.en")}
                          disabled={!!whisperDownloading}
                        >
                          {whisperDownloading === "small.en"
                            ? "Downloading small.en..."
                            : "Download small.en"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWhisperDownload("base.en")}
                          disabled={!!whisperDownloading}
                        >
                          {whisperDownloading === "base.en"
                            ? "Downloading base.en..."
                            : "Download base.en"}
                        </Button>
                      </div>
                      {whisperDownloadError && (
                        <p className="text-xs text-destructive">
                          {whisperDownloadError}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">
                        Language (optional)
                      </label>
                      <Input
                        placeholder="en"
                        value={whisperForm.language}
                        onChange={(e) =>
                          setWhisperForm((prev) => ({
                            ...prev,
                            language: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleWhisperSave}
                    disabled={whisperSaving}
                  >
                    {whisperSaving ? "Saving..." : "Save"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {whisperConfigured
                      ? "Configured"
                      : whisperModelReady
                        ? "Model ready"
                        : "Preparing default model..."}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                License
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Activate your one-time license key. This unlocks the app on this
                device.
              </p>

              <div className="p-4 rounded-lg border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-medium", licenseBadgeClass)}>
                    {licenseBadgeText}
                  </span>
                  {lastChecked && (
                    <span className="text-xs text-muted-foreground">
                      Last checked: {new Date(lastChecked).toLocaleString()}
                    </span>
                  )}
                </div>

                {licenseMessage && (
                  <p className="text-xs text-muted-foreground">{licenseMessage}</p>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    type={showLicenseKey ? "text" : "password"}
                    placeholder="Enter license key"
                    value={licenseInput}
                    onChange={(e) => setLicenseInput(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowLicenseKey((prev) => !prev)}
                  >
                    {showLicenseKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {licenseKey && (
                  <div className="text-xs text-muted-foreground">
                    Saved key: {showLicenseKey ? licenseKey : maskKey(licenseKey)}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => activateLicense(licenseInput)}
                    disabled={!licenseInput.trim() || licenseStatus === "checking"}
                    size="sm"
                  >
                    {licenseStatus === "checking" ? "Verifying..." : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearLicense}
                    disabled={!licenseKey}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                About
              </h3>
              <p className="text-xs text-muted-foreground">
                Multi-Model Chat v0.1.0
                <br />A modern AI chat application supporting multiple providers.
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
