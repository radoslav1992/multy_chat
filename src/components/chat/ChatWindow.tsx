import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Sparkles, AlertCircle, PanelLeft, PanelRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { MessageBubble } from "./MessageBubble";
import { InputArea } from "./InputArea";
import { ModelSelector } from "./ModelSelector";
import { KnowledgeSelector } from "./KnowledgeSelector";
import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chatStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { useAppStore } from "@/stores/appStore";

export function ChatWindow() {
  const {
    messages,
    currentConversationId,
    isLoading,
    error,
    selectedProvider,
    selectedBucketIds,
    sendMessage,
    createConversation,
    clearError,
  } = useChatStore();
  
  const { getApiKey, loadAllApiKeys } = useSettingsStore();
  const { searchMultipleBuckets } = useKnowledgeStore();
  const { setSettingsOpen, sidebarOpen, toggleSidebar, knowledgeSidebarOpen, toggleKnowledgeSidebar } = useAppStore();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    loadAllApiKeys();
  }, [loadAllApiKeys]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const apiKey = getApiKey(selectedProvider);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    // Create conversation if none exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createConversation(input.slice(0, 50));
    }

    // Search knowledge buckets if any are selected (uses local embeddings)
    let context: string | undefined;
    console.log("[RAG] Selected bucket IDs:", selectedBucketIds);
    if (selectedBucketIds.length > 0) {
      console.log("[RAG] Searching buckets:", selectedBucketIds);
      try {
        const results = await searchMultipleBuckets(selectedBucketIds, input);
        console.log("[RAG] Search results:", results);
        if (results.length > 0) {
          context = results
            .map((r) => `[Source: ${r.filename}, Relevance: ${(r.score * 100).toFixed(1)}%]\n${r.content}`)
            .join("\n\n---\n\n");
          console.log("[RAG] Context length:", context.length, "chars");
          console.log("[RAG] Context preview:", context.substring(0, 500));
        } else {
          console.log("[RAG] No relevant results found in knowledge buckets");
        }
      } catch (err) {
        console.error("[RAG] Search error:", err);
      }
    } else {
      console.log("[RAG] No buckets selected");
    }

    const messageContent = input;
    setInput("");
    
    // Log when sending with context
    if (context) {
      console.log("[Chat] Sending message with RAG context");
    }
    
    await sendMessage(messageContent, apiKey, context);
  };

  const hasApiKey = !!getApiKey(selectedProvider);

  return (
    <div className="flex flex-col h-full">
      {/* Header with Model Selector */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm gap-4 min-h-[60px]">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className={sidebarOpen ? "text-primary" : ""}
            title="Toggle Chat History"
          >
            <PanelLeft className="h-5 w-5" />
          </Button>
          <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
          <h1 className="font-semibold text-base whitespace-nowrap">Multi-Model Chat</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <KnowledgeSelector />
          <ModelSelector />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleKnowledgeSidebar}
            className={knowledgeSidebarOpen ? "text-primary" : ""}
            title="Toggle Knowledge Sidebar"
          >
            <PanelRight className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="max-w-4xl mx-auto py-6 px-4">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center min-h-[400px] text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">
                  Start a New Conversation
                </h2>
                <p className="text-muted-foreground max-w-md">
                  Choose your AI provider and model above, then type your message
                  below to begin chatting.
                </p>
                {!hasApiKey && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-4 p-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">
                      Please add your {selectedProvider} API key in settings
                    </span>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLast={index === messages.length - 1}
                />
              ))
            )}
          </AnimatePresence>

          {/* Loading Indicator */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2 text-muted-foreground py-4"
              >
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span
                    className="w-2 h-2 rounded-full bg-primary animate-pulse"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full bg-primary animate-pulse"
                    style={{ animationDelay: "0.4s" }}
                  />
                </div>
                <span className="text-sm">Thinking...</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Display */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg mt-4"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-destructive font-medium">Error</p>
                    <p className="text-sm text-destructive/80 mt-1">{error}</p>
                  </div>
                  <button
                    onClick={clearError}
                    className="text-destructive/60 hover:text-destructive text-sm"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <InputArea
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isLoading || !hasApiKey}
        placeholder={
          hasApiKey
            ? "Type your message..."
            : `Add your ${selectedProvider} API key in settings to start`
        }
      />
    </div>
  );
}
