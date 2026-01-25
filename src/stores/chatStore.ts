import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

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

export type Provider = "anthropic" | "openai" | "gemini" | "deepseek";

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  messages: Message[];
  isLoading: boolean;
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
  cloneConversation: (id: string, title: string) => Promise<string>;
  updateMessageContent: (messageId: string, content: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (
    content: string,
    apiKey: string,
    context?: string,
    sources?: SourceReference[]
  ) => Promise<void>;
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isLoading: false,
  error: null,
  selectedProvider: "anthropic",
  selectedModel: "claude-4-5-sonnet-20250514",
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
  },

  setSelectedModel: (model: string) => {
    set({ selectedModel: model });
  },

  setSelectedBucketIds: (ids: string[]) => {
    set({ selectedBucketIds: ids });
  },

  clearError: () => {
    set({ error: null });
  },
}));
