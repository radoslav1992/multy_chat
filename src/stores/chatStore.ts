import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string;
  model: string;
  created_at: string;
  sources?: SourceReference[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
  tags?: string[];
  folder?: string | null;
}

export interface ConversationSearchResult {
  id: string;
  title: string;
  updated_at: string;
  snippet: string;
  pinned: boolean;
  tags: string[];
  folder?: string | null;
}

export interface SourceReference {
  filename: string;
  score: number;
  content: string;
}

interface RegenerateResponse {
  message: Message;
  conversation_id: string;
  replaced_message_id: string;
}

interface CompareResponse {
  message: Message;
  conversation_id: string;
}

interface StreamStarted {
  message_id: string;
  conversation_id: string;
  provider: string;
  model: string;
}

interface StreamingChunk {
  message_id: string;
  conversation_id: string;
  delta: string;
  done: boolean;
}

export type Provider = "anthropic" | "openai" | "gemini" | "deepseek";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  error: string | null;
  selectedProvider: Provider;
  selectedModel: string;
  selectedBucketIds: string[];

  // Actions
  initializeDatabase: () => Promise<void>;
  loadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  setConversationPinned: (id: string, pinned: boolean) => Promise<void>;
  updateConversationTags: (id: string, tags: string[]) => Promise<void>;
  updateConversationFolder: (id: string, folder?: string | null) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  cloneConversation: (id: string, title: string) => Promise<string>;
  updateMessageContent: (messageId: string, content: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (
    content: string,
    apiKey: string,
    context?: string,
    sources?: SourceReference[]
  ) => Promise<void>;
  sendMessageStream: (
    content: string,
    apiKey: string,
    context?: string,
    sources?: SourceReference[]
  ) => Promise<void>;
  setupStreamListeners: () => Promise<UnlistenFn[]>;
  stopStreaming: () => void;
  regenerateLastResponse: (
    apiKey: string,
    provider: Provider,
    model: string,
    context?: string,
    sources?: SourceReference[]
  ) => Promise<void>;
  compareResponse: (
    apiKey: string,
    provider: Provider,
    model: string,
    context?: string,
    sources?: SourceReference[]
  ) => Promise<void>;
  searchConversations: (query: string) => Promise<ConversationSearchResult[]>;
  exportConversation: (conversationId: string, filePath: string) => Promise<void>;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: string) => void;
  setSelectedBucketIds: (ids: string[]) => void;
  clearError: () => void;
}

// Load persisted model selection from localStorage
const getPersistedSelection = (): { provider: Provider; model: string } => {
  try {
    const saved = localStorage.getItem("selectedModel");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.provider && parsed.model) {
        return { provider: parsed.provider, model: parsed.model };
      }
    }
  } catch {
    // Ignore parse errors
  }
  return { provider: "anthropic", model: "claude-4-5-sonnet-20250514" };
};

const persistedSelection = getPersistedSelection();

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: "",
  error: null,
  selectedProvider: persistedSelection.provider,
  selectedModel: persistedSelection.model,
  selectedBucketIds: [],

  initializeDatabase: async () => {
    try {
      await get().loadConversations();
    } catch (error) {
      console.error("Failed to initialize database:", error);
    }
  },

  loadConversations: async () => {
    try {
      const conversations = await invoke<Conversation[]>("get_conversations");
      set({ conversations });
    } catch (error) {
      set({ error: `Failed to load conversations: ${error}` });
    }
  },

  loadMessages: async (conversationId: string) => {
    try {
      const messages = await invoke<Message[]>("get_messages", {
        conversationId,
      });
      set({ messages });
    } catch (error) {
      set({ error: `Failed to load messages: ${error}` });
    }
  },

  createConversation: async (title?: string) => {
    try {
      const conversation = await invoke<Conversation>("create_conversation", {
        title: title || "New Chat",
      });
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        currentConversationId: conversation.id,
        messages: [],
      }));
      return conversation.id;
    } catch (error) {
      set({ error: `Failed to create conversation: ${error}` });
      throw error;
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await invoke("delete_conversation", { conversationId: id });
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        currentConversationId:
          state.currentConversationId === id
            ? null
            : state.currentConversationId,
        messages: state.currentConversationId === id ? [] : state.messages,
      }));
    } catch (error) {
      set({ error: `Failed to delete conversation: ${error}` });
    }
  },

  setConversationPinned: async (id: string, pinned: boolean) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, pinned } : conversation
      ),
    }));

    try {
      await invoke("update_conversation_pinned", { conversationId: id, pinned });
      await get().loadConversations();
    } catch (error) {
      set({ error: `Failed to update conversation pin: ${error}` });
    }
  },

  updateConversationTags: async (id: string, tags: string[]) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, tags } : conversation
      ),
    }));

    try {
      await invoke("update_conversation_tags", { conversationId: id, tags });
    } catch (error) {
      set({ error: `Failed to update conversation tags: ${error}` });
    }
  },

  updateConversationFolder: async (id: string, folder?: string | null) => {
    const normalized = folder?.trim() ? folder : null;
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, folder: normalized } : conversation
      ),
    }));

    try {
      await invoke("update_conversation_folder", {
        conversationId: id,
        folder: normalized,
      });
    } catch (error) {
      set({ error: `Failed to update conversation folder: ${error}` });
    }
  },

  updateConversationTitle: async (id: string, title: string) => {
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        conversation.id === id ? { ...conversation, title } : conversation
      ),
    }));

    try {
      await invoke("update_conversation_title", {
        conversationId: id,
        title,
      });
    } catch (error) {
      set({ error: `Failed to update conversation title: ${error}` });
    }
  },

  cloneConversation: async (id: string, title: string) => {
    try {
      const conversation = await invoke<Conversation>("clone_conversation", {
        conversationId: id,
        title,
      });

      set((state) => ({
        conversations: [conversation, ...state.conversations],
        currentConversationId: conversation.id,
        messages: [],
      }));

      await get().loadMessages(conversation.id);
      await get().loadConversations();
      return conversation.id;
    } catch (error) {
      set({ error: `Failed to clone conversation: ${error}` });
      throw error;
    }
  },

  updateMessageContent: async (messageId: string, content: string) => {
    try {
      await invoke("update_message_content", { messageId, content });
      set((state) => ({
        messages: state.messages.map((message) =>
          message.id === messageId ? { ...message, content } : message
        ),
      }));
    } catch (error) {
      set({ error: `Failed to update message: ${error}` });
      throw error;
    }
  },

  selectConversation: async (id: string) => {
    set({ currentConversationId: id });
    await get().loadMessages(id);
  },

  sendMessage: async (
    content: string,
    apiKey: string,
    context?: string,
    sources?: SourceReference[]
  ) => {
    const { currentConversationId, selectedProvider, selectedModel } = get();

    if (!currentConversationId) {
      set({ error: "No conversation selected" });
      return;
    }

    // Add optimistic user message
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId,
      role: "user",
      content,
      provider: selectedProvider,
      model: selectedModel,
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null,
    }));

    try {
      const response = await invoke<{ message: Message; conversation_id: string }>(
        "send_message",
        {
          request: {
            conversation_id: currentConversationId,
            content,
            provider: selectedProvider,
            model: selectedModel,
            api_key: apiKey,
            context,
            sources,
          },
        }
      );

      set((state) => ({
        messages: [
          ...state.messages.filter((m) => !m.id.startsWith("temp-")),
          { ...userMessage, id: `user-${Date.now()}` },
          response.message,
        ],
        isLoading: false,
      }));

      // Refresh conversations to update timestamps
      await get().loadConversations();
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((m) => !m.id.startsWith("temp-")),
        isLoading: false,
        error: `Failed to send message: ${error}`,
      }));
    }
  },

  sendMessageStream: async (
    content: string,
    apiKey: string,
    context?: string,
    sources?: SourceReference[]
  ) => {
    const { currentConversationId, selectedProvider, selectedModel, isStreaming, isLoading } = get();

    // Prevent double sends
    if (isStreaming || isLoading) {
      console.warn("[ChatStore] Already streaming or loading, ignoring duplicate send");
      return;
    }

    if (!currentConversationId) {
      set({ error: "No conversation selected" });
      return;
    }

    // Add optimistic user message
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: currentConversationId,
      role: "user",
      content,
      provider: selectedProvider,
      model: selectedModel,
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      isStreaming: true,
      streamingContent: "",
      error: null,
    }));

    try {
      const response = await invoke<StreamStarted>("send_message_stream", {
        request: {
          conversation_id: currentConversationId,
          content,
          provider: selectedProvider,
          model: selectedModel,
          api_key: apiKey,
          context,
          sources,
        },
      });

      // Create placeholder message for streaming
      const streamingMessage: Message = {
        id: response.message_id,
        conversation_id: response.conversation_id,
        role: "assistant",
        content: "",
        provider: response.provider,
        model: response.model,
        created_at: new Date().toISOString(),
        sources,
      };

      set((state) => ({
        messages: [
          ...state.messages.filter((m) => !m.id.startsWith("temp-")),
          { ...userMessage, id: `user-${Date.now()}` },
          streamingMessage,
        ],
        streamingMessageId: response.message_id,
        isLoading: false,
      }));

      // Auto-generate title from first message if still "New Chat"
      const { conversations, messages, updateConversationTitle } = get();
      const conversation = conversations.find((c) => c.id === currentConversationId);
      const isFirstMessage = messages.filter((m) => m.role === "user").length <= 1;
      
      if (conversation && conversation.title === "New Chat" && isFirstMessage) {
        // Generate title from user message (first 50 chars, trim to last word)
        let title = content.trim();
        if (title.length > 50) {
          title = title.substring(0, 50);
          const lastSpace = title.lastIndexOf(" ");
          if (lastSpace > 20) {
            title = title.substring(0, lastSpace);
          }
          title += "...";
        }
        updateConversationTitle(currentConversationId, title);
      }
    } catch (error) {
      set((state) => ({
        messages: state.messages.filter((m) => !m.id.startsWith("temp-")),
        isLoading: false,
        isStreaming: false,
        error: `Failed to send message: ${error}`,
      }));
    }
  },

  setupStreamListeners: async () => {
    const unlisten1 = await listen<StreamingChunk>("stream-chunk", (event) => {
      const chunk = event.payload;
      const { currentConversationId, streamingMessageId } = get();

      // Only process chunks for current conversation
      if (chunk.conversation_id !== currentConversationId) return;
      if (chunk.message_id !== streamingMessageId) return;

      if (chunk.done) {
        // Streaming completed
        set({
          isStreaming: false,
          streamingMessageId: null,
          streamingContent: "",
        });
        // Refresh conversations
        get().loadConversations();
      } else {
        // Append delta to streaming content and update message
        set((state) => {
          const newContent = state.streamingContent + chunk.delta;
          return {
            streamingContent: newContent,
            messages: state.messages.map((m) =>
              m.id === chunk.message_id
                ? { ...m, content: newContent }
                : m
            ),
          };
        });
      }
    });

    const unlisten2 = await listen<StreamingChunk>("stream-error", (event) => {
      const chunk = event.payload;
      set({
        isStreaming: false,
        streamingMessageId: null,
        streamingContent: "",
        error: chunk.delta,
      });
    });

    return [unlisten1, unlisten2];
  },

  stopStreaming: () => {
    set({
      isStreaming: false,
      streamingMessageId: null,
    });
  },

  regenerateLastResponse: async (
    apiKey: string,
    provider: Provider,
    model: string,
    context?: string,
    sources?: SourceReference[]
  ) => {
    const { currentConversationId } = get();

    if (!currentConversationId) {
      set({ error: "No conversation selected" });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await invoke<RegenerateResponse>(
        "regenerate_last_assistant",
        {
          request: {
            conversation_id: currentConversationId,
            provider,
            model,
            api_key: apiKey,
            context,
            sources,
          },
        }
      );

      set((state) => ({
        messages: [
          ...state.messages.filter((m) => m.id !== response.replaced_message_id),
          response.message,
        ],
        isLoading: false,
      }));

      await get().loadConversations();
    } catch (error) {
      set({
        isLoading: false,
        error: `Failed to regenerate response: ${error}`,
      });
    }
  },

  compareResponse: async (
    apiKey: string,
    provider: Provider,
    model: string,
    context?: string,
    sources?: SourceReference[]
  ) => {
    const { currentConversationId } = get();

    if (!currentConversationId) {
      set({ error: "No conversation selected" });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await invoke<CompareResponse>("compare_response", {
        request: {
          conversation_id: currentConversationId,
          provider,
          model,
          api_key: apiKey,
          context,
          sources,
        },
      });

      set((state) => ({
        messages: [...state.messages, response.message],
        isLoading: false,
      }));

      await get().loadConversations();
    } catch (error) {
      set({
        isLoading: false,
        error: `Failed to compare response: ${error}`,
      });
    }
  },

  searchConversations: async (query: string) => {
    try {
      const results = await invoke<ConversationSearchResult[]>(
        "search_conversations",
        { query }
      );
      return results;
    } catch (error) {
      set({ error: `Failed to search conversations: ${error}` });
      return [];
    }
  },

  exportConversation: async (conversationId: string, filePath: string) => {
    try {
      await invoke("export_conversation_markdown", { conversationId, filePath });
    } catch (error) {
      set({ error: `Failed to export conversation: ${error}` });
      throw error;
    }
  },

  setSelectedProvider: (provider: Provider) => {
    set({ selectedProvider: provider });
    // Persist selection
    const { selectedModel } = get();
    localStorage.setItem("selectedModel", JSON.stringify({ provider, model: selectedModel }));
  },

  setSelectedModel: (model: string) => {
    set({ selectedModel: model });
    // Persist selection
    const { selectedProvider } = get();
    localStorage.setItem("selectedModel", JSON.stringify({ provider: selectedProvider, model }));
  },

  setSelectedBucketIds: (ids: string[]) => {
    set({ selectedBucketIds: ids });
  },

  clearError: () => {
    set({ error: null });
  },
}));
