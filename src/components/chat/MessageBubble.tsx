import { motion } from "framer-motion";
import {
  User,
  Copy,
  Check,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Pencil,
  Square,
} from "lucide-react";
import { useState } from "react";
import { Message } from "@/stores/chatStore";
import { MarkdownRenderer } from "@/components/preview/MarkdownRenderer";
import { cn, getProviderColor, getProviderIcon } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  canRegenerate?: boolean;
  onRegenerate?: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  fullWidth?: boolean;
}

export function MessageBubble({
  message,
  canRegenerate,
  onRegenerate,
  canEdit,
  onEdit,
  isStreaming,
  onStopStreaming,
  fullWidth,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const isUser = message.role === "user";
  const sources = message.sources ?? [];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "group flex gap-4 py-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold",
          isUser
            ? "bg-primary text-primary-foreground"
            : getProviderColor(message.provider)
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          getProviderIcon(message.provider)
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "flex-1 space-y-2",
          fullWidth ? "max-w-full" : "max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* Model Badge for Assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground capitalize">
              {message.provider}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {message.model}
            </span>
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-md"
              : "bg-card border border-border rounded-tl-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : isStreaming ? (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {/* Sources */}
        {!isUser && sources.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 text-xs">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSources((prev) => !prev)}
            >
              <span>Sources ({sources.length})</span>
              {showSources ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
            {showSources && (
              <div className="px-3 pb-3 space-y-2">
                {sources.map((source, index) => (
                  <div key={`${source.filename}-${index}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">
                        {source.filename}
                      </span>
                      <span className="text-muted-foreground">
                        {(source.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap">
                      {source.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {isUser ? (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEdit}
                title="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isStreaming && onStopStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onStopStreaming}
                title="Stop response"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
            {canRegenerate && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRegenerate}
                title="Regenerate response"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
