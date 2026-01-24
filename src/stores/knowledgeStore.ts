import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface Bucket {
  id: string;
  name: string;
  description: string;
  created_at: string;
  file_count: number;
}

export interface BucketFile {
  id: string;
  bucket_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

export interface SearchResult {
  content: string;
  filename: string;
  score: number;
}

interface KnowledgeState {
  buckets: Bucket[];
  selectedBucketId: string | null;
  bucketFiles: BucketFile[];
  isLoading: boolean;
  isUploading: boolean;
  error: string | null;

  // Actions
  loadBuckets: () => Promise<void>;
  createBucket: (name: string, description: string) => Promise<void>;
  deleteBucket: (id: string) => Promise<void>;
  selectBucket: (id: string | null) => Promise<void>;
  loadBucketFiles: (bucketId: string) => Promise<void>;
  uploadFile: (bucketId: string) => Promise<void>;
  deleteFile: (bucketId: string, fileId: string, filename: string) => Promise<void>;
  searchBucket: (bucketId: string, query: string) => Promise<SearchResult[]>;
  searchMultipleBuckets: (bucketIds: string[], query: string) => Promise<SearchResult[]>;
  clearError: () => void;
}

export const useKnowledgeStore = create<KnowledgeState>((set, get) => ({
  buckets: [],
  selectedBucketId: null,
  bucketFiles: [],
  isLoading: false,
  isUploading: false,
  error: null,

  loadBuckets: async () => {
    try {
      set({ isLoading: true });
      const buckets = await invoke<Bucket[]>("get_buckets");
      set({ buckets, isLoading: false });
    } catch (error) {
      set({ error: `Failed to load buckets: ${error}`, isLoading: false });
    }
  },

  createBucket: async (name: string, description: string) => {
    try {
      const bucket = await invoke<Bucket>("create_bucket", { name, description });
      set((state) => ({
        buckets: [bucket, ...state.buckets],
      }));
    } catch (error) {
      set({ error: `Failed to create bucket: ${error}` });
      throw error;
    }
  },

  deleteBucket: async (id: string) => {
    try {
      await invoke("delete_bucket", { bucketId: id });
      set((state) => ({
        buckets: state.buckets.filter((b) => b.id !== id),
        selectedBucketId: state.selectedBucketId === id ? null : state.selectedBucketId,
        bucketFiles: state.selectedBucketId === id ? [] : state.bucketFiles,
      }));
    } catch (error) {
      set({ error: `Failed to delete bucket: ${error}` });
    }
  },

  selectBucket: async (id: string | null) => {
    set({ selectedBucketId: id, bucketFiles: [] });
    if (id) {
      await get().loadBucketFiles(id);
    }
  },

  loadBucketFiles: async (bucketId: string) => {
    try {
      set({ isLoading: true });
      const files = await invoke<BucketFile[]>("get_bucket_files", { bucketId });
      set({ bucketFiles: files, isLoading: false });
    } catch (error) {
      set({ error: `Failed to load files: ${error}`, isLoading: false });
    }
  },

  uploadFile: async (bucketId: string) => {
    try {
      const result = await open({
        multiple: false,
        filters: [
          {
            name: "Documents",
            extensions: ["pdf", "docx", "doc", "txt", "md"],
          },
        ],
      });

      if (!result) return;

      set({ isUploading: true, error: null });

      console.log("Uploading file:", result);

      // Uses local embedding model - no API key needed
      const file = await invoke<BucketFile>("upload_file", {
        bucketId,
        filePath: result as string,
        apiKey: "", // Not used anymore, local embeddings
      });

      console.log("File uploaded successfully:", file);

      set((state) => ({
        bucketFiles: [file, ...state.bucketFiles],
        buckets: state.buckets.map((b) =>
          b.id === bucketId ? { ...b, file_count: b.file_count + 1 } : b
        ),
        isUploading: false,
        error: null,
      }));
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: `Upload failed: ${errorMessage}`, isUploading: false });
      throw error;
    }
  },

  deleteFile: async (bucketId: string, fileId: string, filename: string) => {
    try {
      await invoke("delete_file", { bucketId, fileId, filename });
      set((state) => ({
        bucketFiles: state.bucketFiles.filter((f) => f.id !== fileId),
        buckets: state.buckets.map((b) =>
          b.id === bucketId ? { ...b, file_count: Math.max(0, b.file_count - 1) } : b
        ),
      }));
    } catch (error) {
      set({ error: `Failed to delete file: ${error}` });
    }
  },

  searchBucket: async (bucketId: string, query: string) => {
    try {
      console.log(`[Knowledge] Searching bucket ${bucketId} for: "${query}"`);
      const results = await invoke<SearchResult[]>("search_bucket", {
        bucketId,
        query,
        apiKey: "", // Not used anymore, local embeddings
        topK: 5,
      });
      console.log(`[Knowledge] Found ${results.length} results in bucket ${bucketId}`);
      return results;
    } catch (error) {
      console.error(`[Knowledge] Search failed:`, error);
      set({ error: `Search failed: ${error}` });
      return [];
    }
  },

  searchMultipleBuckets: async (bucketIds: string[], query: string) => {
    try {
      console.log(`[Knowledge] Searching ${bucketIds.length} buckets for: "${query}"`);
      const allResults: SearchResult[] = [];
      
      for (const bucketId of bucketIds) {
        const results = await get().searchBucket(bucketId, query);
        allResults.push(...results);
      }
      
      // Sort by score and take top results
      const topResults = allResults.sort((a, b) => b.score - a.score).slice(0, 5);
      console.log(`[Knowledge] Returning ${topResults.length} top results`);
      return topResults;
    } catch (error) {
      console.error(`[Knowledge] Multi-bucket search failed:`, error);
      set({ error: `Search failed: ${error}` });
      return [];
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
