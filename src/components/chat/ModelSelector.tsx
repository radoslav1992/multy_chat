import { useState, useEffect, useRef } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Cpu, X, RefreshCw } from "lucide-react";
import { useChatStore, Provider } from "@/stores/chatStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useModelsStore } from "@/stores/modelsStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const PROVIDERS: { id: Provider; name: string; color: string }[] = [
  { id: "anthropic", name: "Anthropic", color: "from-orange-500 to-amber-500" },
  { id: "openai", name: "OpenAI", color: "from-emerald-500 to-teal-500" },
  { id: "gemini", name: "Gemini", color: "from-blue-500 to-indigo-500" },
  { id: "deepseek", name: "DeepSeek", color: "from-violet-500 to-purple-500" },
];

export function ModelSelector() {
  const {
    selectedProvider,
    selectedModel,
    setSelectedProvider,
    setSelectedModel,
  } = useChatStore();
  const { apiKeys } = useSettingsStore();
  const { config, isLoading, refreshModels, getModels } = useModelsStore();
  
  const [customModelDialogOpen, setCustomModelDialogOpen] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const customModelSelectedRef = useRef(false);

  const { getDefaultModel } = useModelsStore();

  // Load models on mount - always refresh to get latest from remote
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);
  
  useEffect(() => {
    if (!config) return;
    const models = getModels(selectedProvider);
    const defaultModel = getDefaultModel(selectedProvider);
    const hasSelectedModel = models.some((m) => m.id === selectedModel);

    if (!customModelSelectedRef.current && models.length > 0 && !hasSelectedModel && defaultModel) {
      setSelectedModel(defaultModel);
    }
  }, [config, selectedProvider, selectedModel, getModels, getDefaultModel, setSelectedModel]);

  const models = getModels(selectedProvider);
  const isCustomModel = models.length > 0 && !models.find((m) => m.id === selectedModel);
  const currentModel = models.find((m) => m.id === selectedModel);
  const currentProviderInfo = PROVIDERS.find((p) => p.id === selectedProvider);

  // Handle provider change - set default model for new provider
  const handleProviderChange = (provider: Provider) => {
    customModelSelectedRef.current = false;
    setSelectedProvider(provider);
    const defaultModel = getDefaultModel(provider);
    if (defaultModel) {
      setSelectedModel(defaultModel);
    }
  };
  
  const handleModelChange = (value: string) => {
    if (value === "custom") {
      setCustomModelDialogOpen(true);
    } else {
      customModelSelectedRef.current = false;
      setSelectedModel(value);
    }
  };
  
  const handleCustomModelSubmit = () => {
    if (customModelId.trim()) {
      customModelSelectedRef.current = true;
      setSelectedModel(customModelId.trim());
      setCustomModelDialogOpen(false);
      setCustomModelId("");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Provider Selector */}
      <SelectPrimitive.Root
        value={selectedProvider}
        onValueChange={(value) => handleProviderChange(value as Provider)}
      >
        <SelectPrimitive.Trigger
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap",
            "border border-border hover:border-primary/30 hover:bg-accent/50",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            !apiKeys[selectedProvider] && "border-destructive/50"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-offset-background",
              apiKeys[selectedProvider] 
                ? "bg-emerald-500 ring-emerald-500/30" 
                : "bg-red-400 ring-red-400/30"
            )}
          />
          <SelectPrimitive.Value>
            {currentProviderInfo?.name}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="overflow-hidden bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-xl z-50 animate-fade-in"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {PROVIDERS.map((provider) => (
                <SelectPrimitive.Item
                  key={provider.id}
                  value={provider.id}
                  className={cn(
                    "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm cursor-pointer",
                    "outline-none select-none transition-colors",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-background",
                      apiKeys[provider.id] 
                        ? "bg-emerald-500 ring-emerald-500/30" 
                        : "bg-red-400 ring-red-400/30"
                    )}
                  />
                  <SelectPrimitive.ItemText>
                    <span className="font-medium">{provider.name}</span>
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-3">
                    <Check className="h-4 w-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>

      {/* Model Selector */}
      <SelectPrimitive.Root
        value={isCustomModel ? "custom" : selectedModel}
        onValueChange={handleModelChange}
      >
        <SelectPrimitive.Trigger
          className={cn(
            "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap max-w-[200px]",
            "border border-border hover:border-primary/30 hover:bg-accent/50",
            "focus:outline-none focus:ring-2 focus:ring-primary/30",
            isCustomModel && "border-primary/50 bg-primary/5"
          )}
        >
          <Cpu className="h-4 w-4 opacity-50 flex-shrink-0" />
          <span className="truncate">
            {isCustomModel ? selectedModel : (currentModel?.name || "Select model")}
          </span>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="overflow-hidden bg-popover/95 backdrop-blur-xl border border-border rounded-xl shadow-xl z-50 animate-fade-in min-w-[220px]"
            position="popper"
            sideOffset={6}
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {isLoading ? (
                <div className="px-3 py-4 text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading models...
                </div>
              ) : models.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No models available
                </div>
              ) : (
                <>
                  {models.map((model) => (
                    <SelectPrimitive.Item
                      key={model.id}
                      value={model.id}
                      className={cn(
                        "relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer",
                        "outline-none select-none transition-colors",
                        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                      )}
                    >
                      <SelectPrimitive.ItemText>
                        <span className="font-medium">{model.name}</span>
                      </SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="absolute right-3">
                        <Check className="h-4 w-4 text-primary" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                  {/* Custom Model Option */}
                  <SelectPrimitive.Item
                    value="custom"
                    className={cn(
                      "relative flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer",
                      "outline-none select-none transition-colors",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                      "border-t border-border mt-1.5 pt-2.5"
                    )}
                  >
                    <SelectPrimitive.ItemText>
                      <span className="text-muted-foreground">Custom Model ID...</span>
                    </SelectPrimitive.ItemText>
                  </SelectPrimitive.Item>
                </>
              )}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      
      {/* Custom Model Dialog */}
      <Dialog.Root open={customModelDialogOpen} onOpenChange={setCustomModelDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-2xl p-6 w-[420px] z-50 shadow-2xl animate-fade-in">
            <Dialog.Title className="text-lg font-semibold mb-2">
              Custom Model ID
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-5">
              Enter the exact model ID from the provider's documentation.
              <br />
              <span className="text-xs text-muted-foreground/70">
                Example: claude-4-5-sonnet-20250514, gpt-5.2, gemini-3.0-pro
              </span>
            </Dialog.Description>
            
            <Input
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              placeholder="Enter model ID..."
              className="mb-5"
              onKeyDown={(e) => e.key === "Enter" && handleCustomModelSubmit()}
              autoFocus
            />
            
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setCustomModelDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCustomModelSubmit}
                disabled={!customModelId.trim()}
              >
                Use Model
              </Button>
            </div>
            
            <Dialog.Close asChild>
              <button
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
