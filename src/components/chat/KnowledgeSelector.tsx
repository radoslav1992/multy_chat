import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { BookOpen, Check, Plus, ChevronDown, Upload, Loader2, AlertCircle, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useKnowledgeStore, Bucket } from "@/stores/knowledgeStore";
import { useChatStore } from "@/stores/chatStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

export function KnowledgeSelector() {
  const {
    buckets,
    loadBuckets,
    createBucket,
    deleteBucket,
    uploadFile,
    isUploading,
    error,
    clearError,
  } = useKnowledgeStore();
  
  const { selectedBucketIds, setSelectedBucketIds } = useChatStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<Bucket | null>(null);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  // Clear error when popover closes
  useEffect(() => {
    if (!isOpen) {
      clearError();
      setUploadStatus(null);
    }
  }, [isOpen, clearError]);

  const toggleBucket = (bucketId: string) => {
    if (selectedBucketIds.includes(bucketId)) {
      setSelectedBucketIds(selectedBucketIds.filter((id) => id !== bucketId));
    } else {
      setSelectedBucketIds([...selectedBucketIds, bucketId]);
    }
  };

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) return;
    try {
      await createBucket(newBucketName, "");
      setNewBucketName("");
      setIsCreating(false);
    } catch (e) {
      console.error("Failed to create bucket:", e);
    }
  };

  const handleUpload = async (bucketId: string) => {
    setUploadStatus("Processing file with local AI model...");
    try {
      await uploadFile(bucketId);
      setUploadStatus("File uploaded successfully!");
      // Reload buckets to get updated file count
      await loadBuckets();
      setTimeout(() => setUploadStatus(null), 3000);
    } catch (e) {
      console.error("Upload failed:", e);
      setUploadStatus(null);
    }
  };

  const handleDeleteClick = (bucket: Bucket) => {
    setBucketToDelete(bucket);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (bucketToDelete) {
      // Remove from selected if it was selected
      if (selectedBucketIds.includes(bucketToDelete.id)) {
        setSelectedBucketIds(selectedBucketIds.filter(id => id !== bucketToDelete.id));
      }
      await deleteBucket(bucketToDelete.id);
      setBucketToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const selectedCount = selectedBucketIds.length;

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap",
            "border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring",
            selectedCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "border-border"
          )}
        >
          <BookOpen className="h-4 w-4 flex-shrink-0" />
          <span>
            {selectedCount > 0
              ? `${selectedCount} Bucket${selectedCount === 1 ? "" : "s"}`
              : "Knowledge"}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="w-80 bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden"
          sideOffset={8}
          align="end"
        >
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Knowledge Buckets</h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setIsCreating(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                New
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Select buckets to use their knowledge in this chat
            </p>
          </div>

          {/* Create New Bucket Form */}
          <AnimatePresence>
            {isCreating && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border"
              >
                <div className="p-3 bg-muted/30">
                  <Input
                    placeholder="Bucket name..."
                    value={newBucketName}
                    onChange={(e) => setNewBucketName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateBucket()}
                    className="mb-2"
                    autoFocus
                  />
                  <div className="flex gap-2">
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
                      onClick={() => {
                        setIsCreating(false);
                        setNewBucketName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Buckets List */}
          <div className="max-h-64 overflow-y-auto">
            {buckets.length === 0 ? (
              <div className="p-6 text-center">
                <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No knowledge buckets yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create one to add documents
                </p>
              </div>
            ) : (
              <div className="p-2">
                {buckets.map((bucket) => (
                  <BucketItem
                    key={bucket.id}
                    bucket={bucket}
                    isSelected={selectedBucketIds.includes(bucket.id)}
                    isUploading={isUploading}
                    onToggle={() => toggleBucket(bucket.id)}
                    onUpload={() => handleUpload(bucket.id)}
                    onDelete={() => handleDeleteClick(bucket)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 border-t border-border bg-destructive/10">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            </div>
          )}

          {/* Upload Status */}
          {uploadStatus && !error && (
            <div className="p-3 border-t border-border bg-primary/10">
              <p className="text-xs text-primary font-medium flex items-center gap-2">
                {isUploading && <Loader2 className="h-3 w-3 animate-spin" />}
                {uploadStatus}
              </p>
            </div>
          )}

          {/* Selected Summary */}
          {selectedCount > 0 && !error && !uploadStatus && (
            <div className="p-3 border-t border-border bg-primary/5">
              <p className="text-xs text-primary font-medium">
                {selectedCount} bucket(s) will be searched for relevant context
              </p>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl p-6 w-[400px] z-[100] shadow-xl">
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
    </Popover.Root>
  );
}

interface BucketItemProps {
  bucket: Bucket;
  isSelected: boolean;
  isUploading: boolean;
  onToggle: () => void;
  onUpload: () => void;
  onDelete: () => void;
}

function BucketItem({
  bucket,
  isSelected,
  isUploading,
  onToggle,
  onUpload,
  onDelete,
}: BucketItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer group",
        isSelected ? "bg-primary/10" : "hover:bg-accent/50"
      )}
      onClick={onToggle}
    >
      <div
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0",
          isSelected
            ? "bg-primary border-primary text-white"
            : "border-muted-foreground/30"
        )}
      >
        {isSelected && <Check className="h-3 w-3" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{bucket.name}</p>
        <p className="text-xs text-muted-foreground">
          {bucket.file_count} file(s)
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onUpload();
        }}
        disabled={isUploading}
        title="Upload file"
      >
        {isUploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete bucket"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
