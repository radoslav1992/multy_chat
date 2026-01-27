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
  Bot,
} from "lucide-react";
import { useState } from "react";
import { Message } from "@/stores/chatStore";
import { MarkdownRenderer } from "@/components/preview/MarkdownRenderer";
import { cn, getProviderIcon } from "@/lib/utils";
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

  const providerColors: Record<string, string> = {
    openai: "from-emerald-500 to-teal-600",
    anthropic: "from-orange-500 to-amber-600",
    gemini: "from-blue-500 to-indigo-600",
    deepseek: "from-violet-500 to-purple-600",
  };

  const getAvatarGradient = () => {
    if (isUser) return "from-primary to-primary/80";
    return providerColors[message.provider] || "from-gray-500 to-gray-600";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "group flex gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
          "bg-gradient-to-br shadow-md",
          getAvatarGradient()
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : (
          <span className="text-white">
            {getProviderIcon(message.provider) || <Bot className="h-4 w-4" />}
          </span>
        )}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "flex-1 space-y-2 min-w-0",
          fullWidth ? "max-w-full" : "max-w-[85%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        {/* Model Badge for Assistant */}
        {!isUser && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn(
              "text-xs font-semibold capitalize",
              message.provider === "openai" && "text-emerald-600 dark:text-emerald-400",
              message.provider === "anthropic" && "text-orange-600 dark:text-orange-400",
              message.provider === "gemini" && "text-blue-600 dark:text-blue-400",
              message.provider === "deepseek" && "text-violet-600 dark:text-violet-400",
            )}>
              {message.provider}
            </span>
            <span className="text-xs text-muted-foreground/60 font-medium">
              {message.model}
            </span>
          </div>
        )}

        {/* Message Bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 transition-shadow duration-200",
            isUser
              ? "bg-gradient-primary text-primary-foreground rounded-tr-md shadow-md shadow-primary/20"
              : "bg-card border border-border rounded-tl-md shadow-sm hover:shadow-md"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed">{message.content}</p>
          ) : message.content ? (
            <MarkdownRenderer content={message.content} />
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {/* Sources */}
        {!isUser && sources.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/30 text-xs overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              onClick={() => setShowSources((prev) => !prev)}
            >
              <span className="font-medium">Sources ({sources.length})</span>
              {showSources ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            {showSources && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="px-4 pb-3 space-y-3 border-t border-border"
              >
                {sources.map((source, index) => (
                  <div key={`${source.filename}-${index}`} className="pt-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground truncate">
                        {source.filename}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        source.score >= 0.7 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                        source.score >= 0.5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {(source.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {source.content}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className={cn(
          "flex items-center gap-1 transition-all duration-200",
          "opacity-0 group-hover:opacity-100"
        )}>
          {isUser ? (
            <>
              {canEdit && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={onEdit}
                  title="Edit message"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={handleCopy}
                title="Copy"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          ) : (
            <>
              {isStreaming && onStopStreaming && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg hover:text-destructive"
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
                  className="h-7 w-7 rounded-lg"
                  onClick={onRegenerate}
                  title="Regenerate"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-lg"
                onClick={handleCopy}
                title="Copy"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
