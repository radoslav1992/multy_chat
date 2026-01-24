import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  BookOpen,
  Plus,
  Trash2,
  Upload,
  File,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useKnowledgeStore, Bucket } from "@/stores/knowledgeStore";
import { useChatStore } from "@/stores/chatStore";
import { cn, formatFileSize } from "@/lib/utils";

interface KnowledgeSidebarProps {
  isOpen: boolean;
}

export function KnowledgeSidebar({ isOpen }: KnowledgeSidebarProps) {
  const {
    buckets,
    selectedBucketId,
    bucketFiles,
    isLoading,
    isUploading,
    loadBuckets,
    createBucket,
    deleteBucket,
    selectBucket,
    uploadFile,
    deleteFile,
  } = useKnowledgeStore();

  const { selectedBucketIds, setSelectedBucketIds } = useChatStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [newBucketDescription, setNewBucketDescription] = useState("");
  const [expandedBuckets, setExpandedBuckets] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);

  const handleDeleteClick = (bucket: Bucket) => {
    setBucketToDelete(bucket);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (bucketToDelete) {
      await deleteBucket(bucketToDelete.id);
      setBucketToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBuckets();
    }
  }, [isOpen, loadBuckets]);

  // Filter buckets based on search query
  const filteredBuckets = useMemo(() => {
    if (!searchQuery.trim()) return buckets;
    const query = searchQuery.toLowerCase();
    return buckets.filter((bucket) =>
      bucket.name.toLowerCase().includes(query) ||
      bucket.description?.toLowerCase().includes(query)
    );
  }, [buckets, searchQuery]);

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) return;
    await createBucket(newBucketName, newBucketDescription);
    setNewBucketName("");
    setNewBucketDescription("");
    setIsCreating(false);
  };

  const handleUpload = async (bucketId: string) => {
    // Uses local embedding model - no API key required
    await uploadFile(bucketId);
  };

  const toggleBucketExpand = async (bucketId: string) => {
    const newExpanded = new Set(expandedBuckets);
    if (newExpanded.has(bucketId)) {
      newExpanded.delete(bucketId);
    } else {
      newExpanded.add(bucketId);
      await selectBucket(bucketId);
    }
    setExpandedBuckets(newExpanded);
  };

  const toggleBucketSelection = (bucketId: string) => {
    if (selectedBucketIds.includes(bucketId)) {
      setSelectedBucketIds(selectedBucketIds.filter((id) => id !== bucketId));
    } else {
      setSelectedBucketIds([...selectedBucketIds, bucketId]);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 320, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-col border-l border-border bg-card h-full overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Knowledge Buckets</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Add documents to enhance AI responses with your own knowledge.
            </p>
            
            {/* Search Input */}
            {buckets.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search buckets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Create New Bucket Form */}
          <AnimatePresence>
            {isCreating && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-4 border-b border-border bg-muted/30 overflow-hidden"
              >
                <Input
                  placeholder="Bucket name"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  className="mb-2"
                />
                <Input
                  placeholder="Description (optional)"
                  value={newBucketDescription}
                  onChange={(e) => setNewBucketDescription(e.target.value)}
                  className="mb-3"
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreateBucket}
                    disabled={!newBucketName.trim()}
                    className="flex-1"
                  >
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buckets List */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {isLoading && buckets.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : buckets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No knowledge buckets yet
                </p>
              ) : filteredBuckets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No buckets match "{searchQuery}"
                </p>
              ) : (
                filteredBuckets.map((bucket) => (
                  <BucketItem
                    key={bucket.id}
                    bucket={bucket}
                    isExpanded={expandedBuckets.has(bucket.id)}
                    isSelected={selectedBucketIds.includes(bucket.id)}
                    files={selectedBucketId === bucket.id ? bucketFiles : []}
                    isUploading={isUploading}
                    onToggleExpand={() => toggleBucketExpand(bucket.id)}
                    onToggleSelect={() => toggleBucketSelection(bucket.id)}
                    onDelete={() => handleDeleteClick(bucket)}
                    onUpload={() => handleUpload(bucket.id)}
                    onDeleteFile={(fileId, filename) =>
                      deleteFile(bucket.id, fileId, filename)
                    }
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          {selectedBucketIds.length > 0 && (
            <div className="p-3 border-t border-border bg-primary/5">
              <p className="text-xs text-primary font-medium">
                {selectedBucketIds.length} bucket(s) active for chat
              </p>
            </div>
          )}
        </motion.aside>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl p-6 w-[400px] z-50 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold">
              Delete Knowledge Bucket
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete "{bucketToDelete?.name}"? This will permanently remove the bucket and all its documents. This action cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-3 mt-6">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete Bucket
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </AnimatePresence>
  );
}

interface BucketItemProps {
  bucket: Bucket;
  isExpanded: boolean;
  isSelected: boolean;
  files: any[];
  isUploading: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onDelete: () => void;
  onUpload: () => void;
  onDeleteFile: (fileId: string, filename: string) => void;
}

function BucketItem({
  bucket,
  isExpanded,
  isSelected,
  files,
  isUploading,
  onToggleExpand,
  onToggleSelect,
  onDelete,
  onUpload,
  onDeleteFile,
}: BucketItemProps) {
  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-accent/30"
      )}
    >
      {/* Bucket Header */}
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={onToggleExpand}
          className="p-1 hover:bg-accent rounded"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <button
          onClick={onToggleSelect}
          className={cn(
            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
            isSelected
              ? "bg-primary border-primary text-white"
              : "border-muted-foreground/30 hover:border-primary"
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </button>

        <div className="flex-1 min-w-0" onClick={onToggleExpand}>
          <p className="font-medium text-sm truncate">{bucket.name}</p>
          <p className="text-xs text-muted-foreground">
            {bucket.file_count} file(s)
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {bucket.description && (
                <p className="text-xs text-muted-foreground pl-7">
                  {bucket.description}
                </p>
              )}

              {/* Upload Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 ml-7"
                onClick={onUpload}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {isUploading ? "Uploading..." : "Upload File"}
              </Button>

              {/* Files List */}
              {files.length > 0 && (
                <div className="space-y-1 pl-7">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs"
                    >
                      <File className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{file.filename}</p>
                        <p className="text-muted-foreground">
                          {formatFileSize(file.file_size)} • {file.chunk_count}{" "}
                          chunks
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onDeleteFile(file.id, file.filename)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
