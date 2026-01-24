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
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
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
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, apiKey: string, context?: string) => Promise<void>;
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

  selectConversation: async (id: string) => {
    set({ currentConversationId: id });
    await get().loadMessages(id);
  },

  sendMessage: async (content: string, apiKey: string, context?: string) => {
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
