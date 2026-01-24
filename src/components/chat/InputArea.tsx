import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, BookOpen, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chatStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { cn } from "@/lib/utils";

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputArea({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedBucketIds, setSelectedBucketIds } = useChatStore();
  const { buckets } = useKnowledgeStore();

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        200
      )}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  };

  const selectedBuckets = buckets.filter((b) => selectedBucketIds.includes(b.id));

  const removeBucket = (bucketId: string) => {
    setSelectedBucketIds(selectedBucketIds.filter((id) => id !== bucketId));
  };

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="max-w-4xl mx-auto">
        {/* Selected Knowledge Buckets */}
        <AnimatePresence>
          {selectedBuckets.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-3 p-2 bg-primary/5 rounded-lg border border-primary/20">
                <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm text-primary font-medium">RAG Active:</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {selectedBuckets.map((bucket) => (
                    <span
                      key={bucket.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium"
                    >
                      {bucket.name}
                      <button
                        onClick={() => removeBucket(bucket.id)}
                        className="hover:bg-primary/20 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Container */}
        <div
          className={cn(
            "relative flex items-end rounded-2xl border bg-background transition-all duration-200",
            selectedBuckets.length > 0
              ? "border-primary/50 ring-1 ring-primary/20"
              : "border-border",
            "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
          )}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-4 py-3 text-sm min-h-[48px]",
              "placeholder:text-muted-foreground focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />

          {/* Send Button */}
          <div className="flex items-end p-2">
            <Button
              variant="default"
              size="icon"
              className="h-8 w-8 rounded-xl flex-shrink-0"
              onClick={onSend}
              disabled={disabled || !value.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hint */}
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send, Shift + Enter for new line
          {selectedBuckets.length > 0 && (
            <span className="text-primary ml-2">
              • Knowledge search enabled
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
