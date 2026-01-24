import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Eye, Copy, Check, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface HtmlPreviewProps {
  code: string;
}

export function HtmlPreview({ code }: HtmlPreviewProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Create a full HTML document for the iframe
  const getIframeContent = () => {
    // Check if the code is a complete HTML document
    if (code.includes("<html") || code.includes("<!DOCTYPE")) {
      return code;
    }

    // Wrap partial HTML in a document
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Inter, system-ui, sans-serif;
      margin: 0;
      padding: 16px;
      background: white;
      color: #1a1a1a;
    }
    * {
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  ${code}
</body>
</html>
    `;
  };

  useEffect(() => {
    if (iframeRef.current && showPreview) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(getIframeContent());
        doc.close();
      }
    }
  }, [code, showPreview]);

  return (
    <div
      className={cn(
        "my-4 rounded-lg border border-border overflow-hidden bg-muted/30",
        expanded && "fixed inset-4 z-50 m-0"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase">
            HTML Preview
          </span>
        </div>

        <div className="flex items-center gap-1">
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

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <Minimize2 className="h-3 w-3" />
            ) : (
              <Maximize2 className="h-3 w-3" />
            )}
          </Button>

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
        {showPreview ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "bg-white",
              expanded ? "h-[calc(100%-44px)]" : "h-[300px]"
            )}
          >
            <iframe
              ref={iframeRef}
              title="HTML Preview"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={expanded ? "h-[calc(100%-44px)] overflow-auto" : ""}
          >
            <pre className="p-4 overflow-x-auto text-sm">
              <code className="language-html">{code}</code>
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop for expanded mode */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/50 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
