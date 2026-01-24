import { motion } from "framer-motion";
import { User, Copy, Check } from "lucide-react";
import { useState } from "react";
import { Message } from "@/stores/chatStore";
import { MarkdownRenderer } from "@/components/preview/MarkdownRenderer";
import { cn, getProviderColor, getProviderIcon } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

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
      className={cn("flex gap-4 py-4", isUser ? "flex-row-reverse" : "flex-row")}
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
          "flex-1 max-w-[80%] space-y-2",
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
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {/* Actions */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
