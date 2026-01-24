import { useState, useEffect } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Cpu, X, RefreshCw } from "lucide-react";
import { useChatStore, Provider } from "@/stores/chatStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useModelsStore } from "@/stores/modelsStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const PROVIDERS: { id: Provider; name: string }[] = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "gemini", name: "Gemini" },
  { id: "deepseek", name: "DeepSeek" },
];

export function ModelSelector() {
  const {
    selectedProvider,
    selectedModel,
    setSelectedProvider,
    setSelectedModel,
  } = useChatStore();
  const { apiKeys } = useSettingsStore();
  const { config, isLoading, loadModels, getModels } = useModelsStore();
  
  const [customModelDialogOpen, setCustomModelDialogOpen] = useState(false);
  const [customModelId, setCustomModelId] = useState("");

  const { getDefaultModel } = useModelsStore();

  // Load models on mount
  useEffect(() => {
    if (!config) {
      loadModels();
    }
  }, [config, loadModels]);

  const models = getModels(selectedProvider);
  const isCustomModel = models.length > 0 && !models.find((m) => m.id === selectedModel);
  const currentModel = models.find((m) => m.id === selectedModel);

  // Handle provider change - set default model for new provider
  const handleProviderChange = (provider: Provider) => {
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
      setSelectedModel(value);
    }
  };
  
  const handleCustomModelSubmit = () => {
    if (customModelId.trim()) {
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
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
            "border border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
            !apiKeys[selectedProvider] && "border-destructive/50"
          )}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              apiKeys[selectedProvider] ? "bg-green-500" : "bg-red-400"
            )}
          />
          <SelectPrimitive.Value>
            {PROVIDERS.find((p) => p.id === selectedProvider)?.name}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="overflow-hidden bg-popover border border-border rounded-lg shadow-lg z-50"
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-1">
              {PROVIDERS.map((provider) => (
                <SelectPrimitive.Item
                  key={provider.id}
                  value={provider.id}
                  className={cn(
                    "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer",
                    "outline-none select-none",
                    "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      apiKeys[provider.id] ? "bg-green-500" : "bg-red-400"
                    )}
                  />
                  <SelectPrimitive.ItemText>
                    {provider.name}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2">
                    <Check className="h-4 w-4" />
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
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap max-w-[180px]",
            "border border-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
            isCustomModel && "border-primary/50"
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
            className="overflow-hidden bg-popover border border-border rounded-lg shadow-lg z-50"
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-1">
              {isLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Loading models...
                </div>
              ) : models.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  No models available
                </div>
              ) : (
                <>
                  {models.map((model) => (
                    <SelectPrimitive.Item
                      key={model.id}
                      value={model.id}
                      className={cn(
                        "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer",
                        "outline-none select-none",
                        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                      )}
                    >
                      <SelectPrimitive.ItemText>{model.name}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="absolute right-2">
                        <Check className="h-4 w-4" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
                  {/* Custom Model Option */}
                  <SelectPrimitive.Item
                    value="custom"
                    className={cn(
                      "relative flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer",
                      "outline-none select-none",
                      "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
                      "border-t border-border mt-1 pt-2"
                    )}
                  >
                    <SelectPrimitive.ItemText>✏️ Custom Model ID...</SelectPrimitive.ItemText>
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
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl p-6 w-[400px] z-50 shadow-xl">
            <Dialog.Title className="text-lg font-semibold mb-2">
              Custom Model ID
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-4">
              Enter the exact model ID from the provider's documentation.
              <br />
              <span className="text-xs">
                Example: claude-4-5-sonnet-20250514, gpt-5.2, gemini-3.0-pro
              </span>
            </Dialog.Description>
            
            <Input
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              placeholder="Enter model ID..."
              className="mb-4"
              onKeyDown={(e) => e.key === "Enter" && handleCustomModelSubmit()}
              autoFocus
            />
            
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
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
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
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
