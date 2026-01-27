import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Sparkles,
  AlertCircle,
  PanelLeft,
  PanelRight,
  Download,
  GitCompare,
  Tag,
  GitBranch,
  Plus,
  X,
  Folder,
  LayoutGrid,
  Pencil,
} from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { MessageBubble } from "./MessageBubble";
import { InputArea } from "./InputArea";
import { ModelSelector } from "./ModelSelector";
import { KnowledgeSelector } from "./KnowledgeSelector";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toaster";
import { Message, useChatStore, Provider } from "@/stores/chatStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { useAppStore } from "@/stores/appStore";
import { useLicenseStore } from "@/stores/licenseStore";

export function ChatWindow() {
  const {
    messages,
    currentConversationId,
    isLoading,
    isStreaming,
    streamingMessageId,
    streamingContent,
    error,
    selectedProvider,
    selectedModel,
    selectedBucketIds,
    sendMessageStream,
    setupStreamListeners,
    stopStreaming,
    regenerateLastResponse,
    compareResponse,
    updateMessageContent,
    updateConversationTags,
    updateConversationFolder,
    cloneConversation,
    exportConversation,
    conversations,
    createConversation,
    clearError,
  } = useChatStore();
  
  const { getApiKey, loadAllApiKeys, whisperConfig, loadWhisperConfig } = useSettingsStore();
  const { searchMultipleBuckets } = useKnowledgeStore();
  const { setSettingsOpen, sidebarOpen, toggleSidebar, knowledgeSidebarOpen, toggleKnowledgeSidebar } = useAppStore();
  const {
    status: licenseStatus,
    loadLicense,
    getGraceDaysRemaining,
    requiresActivation,
  } = useLicenseStore();
  const { toast } = useToast();
  
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false);
  const [compareView, setCompareView] = useState(false);

  const currentConversation = conversations.find(
    (conversation) => conversation.id === currentConversationId
  );
  const currentTags = currentConversation?.tags ?? [];
  const currentFolder = currentConversation?.folder ?? null;
  const folderOptions = Array.from(
    new Set(
      conversations
        .map((conversation) => conversation.folder)
        .filter((folder): folder is string => !!folder && folder.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    loadAllApiKeys();
  }, [loadAllApiKeys]);

  useEffect(() => {
    loadWhisperConfig();
  }, [loadWhisperConfig]);

  useEffect(() => {
    loadLicense();
  }, [loadLicense]);

  // Set up streaming listeners on mount - only once
  useEffect(() => {
    let unlisteners: (() => void)[] = [];
    let mounted = true;
    
    setupStreamListeners().then((fns) => {
      if (mounted) {
        unlisteners = fns;
      } else {
        // Cleanup if component unmounted before promise resolved
        fns.forEach((fn) => fn());
      }
    });

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => fn());
    };
  }, []); // Empty dependency array - setup only once

  useEffect(() => {
    // Scroll to bottom when messages change or streaming content updates
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, [messages, streamingContent, isStreaming]);

  useEffect(() => {
    setEditingMessageId(null);
  }, [currentConversationId]);

  useEffect(() => {
    if (!tagPopoverOpen) {
      setTagInput("");
    }
  }, [tagPopoverOpen]);

  useEffect(() => {
    if (!folderPopoverOpen) {
      setFolderInput("");
    }
  }, [folderPopoverOpen]);

  const trimSnippet = (content: string, maxLength = 400) => {
    if (content.length <= maxLength) return content;
    return `${content.slice(0, maxLength)}...`;
  };

  const buildContext = async (query: string) => {
    if (selectedBucketIds.length === 0) {
      return { context: undefined, sources: undefined };
    }

    try {
      const results = await searchMultipleBuckets(selectedBucketIds, query);
      if (results.length === 0) {
        return { context: undefined, sources: undefined };
      }

      const context = results
        .map(
          (r) =>
            `[Source: ${r.filename}, Relevance: ${(r.score * 100).toFixed(1)}%]\n${r.content}`
        )
        .join("\n\n---\n\n");

      const sources = results.map((result) => ({
        filename: result.filename,
        score: result.score,
        content: trimSnippet(result.content),
      }));

      return { context, sources };
    } catch (err) {
      console.error("[RAG] Search error:", err);
      return { context: undefined, sources: undefined };
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (requiresActivation()) {
      toast({
        title: "License required",
        description: "Please activate your license to continue.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    if (editingMessageId) {
      const lastAssistant = [...messages]
        .reverse()
        .find((message) => message.role === "assistant");
      const provider = (lastAssistant?.provider as Provider) || selectedProvider;
      const model = lastAssistant?.model || selectedModel;
      const apiKey = getApiKey(provider);

      if (!apiKey) {
        setSettingsOpen(true);
        return;
      }

      const { context, sources } = await buildContext(trimmed);

      await updateMessageContent(editingMessageId, trimmed);
      setEditingMessageId(null);
      setInput("");

      if (lastAssistant) {
        await regenerateLastResponse(apiKey, provider, model, context, sources);
      } else {
        await compareResponse(apiKey, provider, model, context, sources);
      }
      return;
    }

    const apiKey = getApiKey(selectedProvider);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    // Create conversation if none exists
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = await createConversation(trimmed.slice(0, 50));
    }

    const { context, sources } = await buildContext(trimmed);
    const messageContent = trimmed;
    setInput("");

    // Use streaming for sending messages
    await sendMessageStream(messageContent, apiKey, context, sources);
  };

  const handleRegenerate = async () => {
    if (requiresActivation()) {
      toast({
        title: "License required",
        description: "Please activate your license to continue.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    if (!lastAssistant || !lastUser) {
      toast({
        title: "Cannot regenerate",
        description: "No assistant response to regenerate yet.",
        variant: "destructive",
      });
      return;
    }

    const provider = lastAssistant.provider as Provider;
    const apiKey = getApiKey(provider);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    const { context, sources } = await buildContext(lastUser.content);

    await regenerateLastResponse(apiKey, provider, lastAssistant.model, context, sources);
  };

  const handleCompare = async () => {
    if (requiresActivation()) {
      toast({
        title: "License required",
        description: "Please activate your license to continue.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    if (!lastUser) {
      toast({
        title: "Cannot compare",
        description: "No user message available for comparison.",
        variant: "destructive",
      });
      return;
    }

    const apiKey = getApiKey(selectedProvider);
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }

    const { context, sources } = await buildContext(lastUser.content);

    await compareResponse(apiKey, selectedProvider, selectedModel, context, sources);
  };

  const handleTranscribe = async (wavBase64: string) => {
    if (requiresActivation()) {
      toast({
        title: "License required",
        description: "Please activate your license to continue.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    try {
      const transcript = await invoke<string>("transcribe_audio", { wavBase64 });
      const cleaned = transcript.trim();
      if (cleaned) {
        setInput((prev) => (prev ? `${prev} ${cleaned}` : cleaned));
      }
    } catch (error) {
      toast({
        title: "Transcription failed",
        description: String(error),
        variant: "destructive",
      });
    }
  };

  const handleFork = async () => {
    if (!currentConversationId) return;
    const title = currentConversation?.title || "Conversation";
    const forkTitle = `Copy of ${title}`;

    try {
      await cloneConversation(currentConversationId, forkTitle);
      toast({
        title: "Conversation forked",
        description: "You can continue in the new copy.",
      });
    } catch (err) {
      toast({
        title: "Fork failed",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const handleEditMessage = (message: Message) => {
    setEditingMessageId(message.id);
    setInput(message.content);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setInput("");
  };

  const handleAddTag = async () => {
    if (!currentConversationId) return;
    const trimmed = tagInput.trim();
    if (!trimmed) return;

    const normalized = trimmed.toLowerCase();
    const existing = new Set(currentTags.map((tag) => tag.toLowerCase()));
    if (existing.has(normalized)) {
      setTagInput("");
      return;
    }

    const nextTags = [...currentTags, trimmed];
    await updateConversationTags(currentConversationId, nextTags);
    setTagInput("");
  };

  const handleRemoveTag = async (tag: string) => {
    if (!currentConversationId) return;
    const nextTags = currentTags.filter((existing) => existing !== tag);
    await updateConversationTags(currentConversationId, nextTags);
  };

  const handleSetFolder = async (folder?: string | null) => {
    if (!currentConversationId) return;
    await updateConversationFolder(currentConversationId, folder ?? null);
  };

  const handleAddFolder = async () => {
    if (!currentConversationId) return;
    const trimmed = folderInput.trim();
    if (!trimmed) return;
    await handleSetFolder(trimmed);
    setFolderInput("");
    setFolderPopoverOpen(false);
  };

  const handleStopStreaming = () => {
    stopStreaming();
  };

  const handleExport = async () => {
    if (!currentConversationId) return;

    const conversation = conversations.find((c) => c.id === currentConversationId);
    const title = conversation?.title || "conversation";
    const safeTitle = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "conversation";
    const defaultPath = `${safeTitle.replace(/\s+/g, "-").toLowerCase()}.md`;

    const filePath = await save({
      defaultPath,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });

    if (!filePath) return;

    try {
      await exportConversation(currentConversationId, filePath);
      toast({
        title: "Export complete",
        description: "Conversation saved as Markdown.",
      });
    } catch (err) {
      toast({
        title: "Export failed",
        description: String(err),
        variant: "destructive",
      });
    }
  };

  const hasApiKey = !!getApiKey(selectedProvider);
  const graceDaysRemaining = getGraceDaysRemaining();
  const licenseBlocked = requiresActivation();
  const showLicenseBanner = licenseStatus !== "active";
  const hasWhisperModel = !!whisperConfig.modelPath;
  const speechEnabled = hasWhisperModel;
  const speechDisabledReason = hasWhisperModel
    ? "Whisper model is ready. Try recording again."
    : "Preparing default Whisper model. Open settings if it doesn't appear.";

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const lastUserId = [...messages].reverse().find((m) => m.role === "user")?.id;
  const streamingId = isStreaming ? streamingMessageId : null;

  const turns = useMemo(() => {
    const result: { user: Message; assistants: Message[] }[] = [];
    let currentUser: Message | null = null;
    let currentAssistants: Message[] = [];

    for (const message of messages) {
      if (message.role === "user") {
        if (currentUser) {
          result.push({ user: currentUser, assistants: currentAssistants });
        }
        currentUser = message;
        currentAssistants = [];
        continue;
      }

      if (message.role === "assistant" && currentUser) {
        currentAssistants.push(message);
      }
    }

    if (currentUser) {
      result.push({ user: currentUser, assistants: currentAssistants });
    }

    return result;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with Model Selector */}
      <header className="flex items-center px-4 py-3 border-b border-border bg-card/50 backdrop-blur-sm gap-2 min-h-[60px]">
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
          <h1 className="font-semibold text-base whitespace-nowrap hidden md:block">Multi-Model Chat</h1>
        </div>
        <div className="flex items-center gap-1 flex-1 justify-end overflow-x-auto">
          <KnowledgeSelector />
          <ModelSelector />
          <Popover.Root open={folderPopoverOpen} onOpenChange={setFolderPopoverOpen}>
            <Popover.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Set folder"
                disabled={!currentConversationId}
                className={currentFolder ? "text-primary" : ""}
              >
                <Folder className="h-5 w-5" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="w-72 rounded-xl border border-border bg-popover p-3 shadow-lg"
                sideOffset={8}
                align="end"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Folder</span>
                  <button
                    onClick={() => setFolderPopoverOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {folderOptions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {folderOptions.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => handleSetFolder(folder)}
                        className={`px-2 py-1 rounded-md text-xs border ${
                          currentFolder === folder
                            ? "border-primary text-primary bg-primary/10"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {folder}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    value={folderInput}
                    onChange={(e) => setFolderInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
                    placeholder="New folder"
                    className="h-8"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleAddFolder}
                    disabled={!folderInput.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() => handleSetFolder(null)}
                  disabled={!currentFolder}
                >
                  Clear folder
                </Button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
            <Popover.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                title="Manage tags"
                disabled={!currentConversationId}
              >
                <Tag className="h-5 w-5" />
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="w-72 rounded-xl border border-border bg-popover p-3 shadow-lg"
                sideOffset={8}
                align="end"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Tags</span>
                  <button
                    onClick={() => setTagPopoverOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {currentTags.length === 0 ? (
                  <p className="text-xs text-muted-foreground mb-3">
                    Add tags to organize conversations.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {currentTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    placeholder="Add tag"
                    className="h-8"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={handleAddTag}
                    disabled={!tagInput.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFork}
            title="Fork conversation"
            disabled={!currentConversationId}
          >
            <GitBranch className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCompareView((prev) => !prev)}
            title={compareView ? "Exit compare view" : "Compare view"}
            className={compareView ? "text-primary" : ""}
          >
            <LayoutGrid className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCompare}
            title="Compare with selected model"
            disabled={!currentConversationId || !lastUserId || isLoading}
          >
            <GitCompare className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            title="Export conversation"
            disabled={!currentConversationId}
          >
            <Download className="h-5 w-5" />
          </Button>
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

      {showLicenseBanner && (
        <div className="border-b border-border bg-muted/30 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {licenseBlocked ? (
                <span className="text-destructive">
                  License required to continue. Your grace period has ended.
                </span>
              ) : (
                <span>
                  Trial mode: {graceDaysRemaining} day
                  {graceDaysRemaining === 1 ? "" : "s"} left before activation is required.
                </span>
              )}
            </div>
            <Button size="sm" onClick={() => setSettingsOpen(true)}>
              Activate License
            </Button>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
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
            ) : compareView ? (
              <div className="space-y-6">
                {turns.map((turn) => (
                  <div key={turn.user.id} className="space-y-4">
                    <div className="rounded-xl border border-border bg-primary/5 px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground">User</p>
                        {turn.user.id === lastUserId && !isLoading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditMessage(turn.user)}
                            title="Edit message"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{turn.user.content}</p>
                    </div>
                    {turn.assistants.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Awaiting assistant response...
                      </p>
                    ) : (
                      <div
                        className={`grid gap-4 ${
                          turn.assistants.length > 1 ? "md:grid-cols-2" : "grid-cols-1"
                        }`}
                      >
                        {turn.assistants.map((assistant) => (
                          <MessageBubble
                            key={assistant.id}
                            message={assistant}
                            isLast={assistant.id === lastAssistantId}
                            canRegenerate={assistant.id === lastAssistantId && !isLoading}
                            onRegenerate={
                              assistant.id === lastAssistantId ? handleRegenerate : undefined
                            }
                            isStreaming={assistant.id === streamingId}
                            onStopStreaming={assistant.id === streamingId ? handleStopStreaming : undefined}
                            fullWidth
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLast={index === messages.length - 1}
                  canRegenerate={message.id === lastAssistantId && !isLoading}
                  onRegenerate={message.id === lastAssistantId ? handleRegenerate : undefined}
                  canEdit={message.role === "user" && message.id === lastUserId && !isLoading}
                  onEdit={
                    message.role === "user" && message.id === lastUserId
                      ? () => handleEditMessage(message)
                      : undefined
                  }
                  isStreaming={message.id === streamingId}
                  onStopStreaming={message.id === streamingId ? handleStopStreaming : undefined}
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
        disabled={isLoading || !hasApiKey || licenseBlocked}
        isStreaming={isStreaming}
        onStopStreaming={handleStopStreaming}
        isEditing={!!editingMessageId}
        onCancelEdit={editingMessageId ? handleCancelEdit : undefined}
        speechEnabled={speechEnabled}
        speechDisabledReason={speechDisabledReason}
        onTranscribe={handleTranscribe}
        onRequestSettings={() => setSettingsOpen(true)}
        placeholder={
          licenseBlocked
            ? "Activate your license in settings to continue"
            : hasApiKey
            ? editingMessageId
              ? "Edit your message..."
              : "Type your message..."
            : `Add your ${selectedProvider} API key in settings to start`
        }
      />
    </div>
  );
}
