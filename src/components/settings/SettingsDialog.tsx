import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Eye, EyeOff, Check, AlertCircle } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useSettingsStore } from "@/stores/settingsStore";
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
  const { apiKeys, setApiKey, loadAllApiKeys } = useSettingsStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editingKeys, setEditingKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (settingsOpen) {
      loadAllApiKeys();
      setEditingKeys({});
    }
  }, [settingsOpen, loadAllApiKeys]);

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
