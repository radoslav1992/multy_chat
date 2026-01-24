import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Eye, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface CodePreviewProps {
  code: string;
  language: string;
}

export function CodePreview({ code, language }: CodePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine if this code can be previewed
  const isPreviewable = ["html", "htm", "svg", "jsx", "tsx"].includes(
    language.toLowerCase()
  );

  return (
    <div className="my-4 rounded-lg border border-border overflow-hidden bg-muted/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {language || "code"}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isPreviewable && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs",
                showPreview && "bg-primary/10 text-primary"
              )}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? (
                <>
                  <Code className="h-3 w-3 mr-1" />
                  Code
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </>
              )}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {showPreview && isPreviewable ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-white dark:bg-gray-900"
          >
            <div
              className="preview-content"
              dangerouslySetInnerHTML={{ __html: code }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <pre className="p-4 overflow-x-auto text-sm">
              <code className={`language-${language}`}>{code}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
