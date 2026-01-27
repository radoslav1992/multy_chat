import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code,
  Eye,
  Copy,
  Check,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Maximize2,
  X,
} from "lucide-react";
import mermaid from "mermaid";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface MermaidPreviewProps {
  code: string;
}

// Initialize mermaid with error handling disabled for DOM
mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "loose",
  fontFamily: "Inter, system-ui, sans-serif",
  suppressErrorRendering: true, // Don't render errors to DOM
});

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export function MermaidPreview({ code }: MermaidPreviewProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [copied, setCopied] = useState(false);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const idRef = useRef<string>(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      try {
        setError(null);
        
        // Generate a unique ID for this render
        const id = idRef.current;
        
        // Parse first to check for errors without creating DOM elements
        await mermaid.parse(code);
        
        // If parsing succeeded, render the diagram
        const { svg: renderedSvg } = await mermaid.render(id, code);
        
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        if (isMounted) {
          // Extract just the error message, not the full stack
          const errorMsg = err instanceof Error ? err.message : "Failed to render diagram";
          // Clean up the error message - remove mermaid version info
          const cleanError = errorMsg.split('\n')[0].replace(/^Error: /, '');
          setError(cleanError || "Invalid diagram syntax");
          setSvg("");
        }
      }
    };

    // Clean up any orphaned mermaid error elements
    const cleanupMermaidErrors = () => {
      const errorElements = document.querySelectorAll('[id^="d"]');
      errorElements.forEach((el) => {
        if (el.textContent?.includes('Syntax error') && el.parentElement === document.body) {
          el.remove();
        }
      });
    };

    if (showPreview && code.trim()) {
      renderDiagram();
    }

    return () => {
      isMounted = false;
      cleanupMermaidErrors();
    };
  }, [code, showPreview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Remove any mermaid-generated elements
      const el = document.getElementById(idRef.current);
      if (el) {
        el.remove();
      }
    };
  }, []);

  // Reset zoom and pan when switching views
  useEffect(() => {
    if (!showPreview) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [showPreview]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((prev) => Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM));
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && zoom > 1) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      });
    }
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Download handlers
  const downloadAsSVG = useCallback(async () => {
    if (!svg) return;
    
    try {
      const filePath = await save({
        defaultPath: "mermaid-diagram.svg",
        filters: [{ name: "SVG Image", extensions: ["svg"] }],
      });
      
      if (filePath) {
        const encoder = new TextEncoder();
        await writeFile(filePath, encoder.encode(svg));
      }
    } catch (err) {
      console.error("Failed to save SVG:", err);
    }
    setShowDownloadMenu(false);
  }, [svg]);

  const downloadAsPNG = useCallback(async () => {
    if (!svg) return;

    try {
      // Create a canvas element
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Create an image from SVG
      const img = new Image();
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        try {
          // Set canvas size with higher resolution for better quality
          const scale = 2;
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          
          // Fill with white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw the image
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          // Get PNG data as base64
          const dataUrl = canvas.toDataURL("image/png");
          const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
          
          // Convert base64 to Uint8Array
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          // Open save dialog
          const filePath = await save({
            defaultPath: "mermaid-diagram.png",
            filters: [{ name: "PNG Image", extensions: ["png"] }],
          });
          
          if (filePath) {
            await writeFile(filePath, bytes);
          }
          
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error("Failed to save PNG:", err);
        }
        setShowDownloadMenu(false);
      };

      img.onerror = () => {
        console.error("Failed to load SVG image");
        URL.revokeObjectURL(url);
        setShowDownloadMenu(false);
      };

      img.src = url;
    } catch (err) {
      console.error("Failed to download PNG:", err);
      setShowDownloadMenu(false);
    }
  }, [svg]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
    if (!isFullscreen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [isFullscreen]);

  // Close fullscreen on escape and close download menu on click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isFullscreen) setIsFullscreen(false);
        if (showDownloadMenu) setShowDownloadMenu(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showDownloadMenu && !target.closest('[data-download-menu]')) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isFullscreen, showDownloadMenu]);

  // Don't render anything if code is empty
  if (!code.trim()) {
    return null;
  }

  const DiagramContent = () => (
    <>
      {error ? (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm bg-amber-500/10 px-3 py-2 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">Diagram syntax error - switch to Code view</span>
        </div>
      ) : svg ? (
        <div
          ref={diagramRef}
          className={cn(
            "mermaid-diagram transition-transform duration-100",
            zoom > 1 && "cursor-grab",
            isPanning && "cursor-grabbing"
          )}
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Rendering...</span>
        </div>
      )}
    </>
  );

  const ZoomControls = ({ className }: { className?: string }) => (
    <div className={cn("flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border p-1", className)}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
        onClick={handleZoomOut}
        disabled={zoom <= MIN_ZOOM}
        title="Zoom out"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs font-medium w-12 text-center tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
        onClick={handleZoomIn}
        disabled={zoom >= MAX_ZOOM}
        title="Zoom in"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-md"
        onClick={handleResetZoom}
        title="Reset zoom"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <>
      <div className="my-4 rounded-xl border border-border overflow-hidden bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Mermaid Diagram
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-xs rounded-lg",
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

            {showPreview && svg && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={toggleFullscreen}
                  title="Fullscreen"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>

                <div className="relative" data-download-menu>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDownloadMenu(!showDownloadMenu);
                    }}
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  
                  <AnimatePresence>
                    {showDownloadMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
                      >
                        <button
                          className="w-full px-3 py-2 text-xs text-left hover:bg-muted transition-colors flex items-center gap-2"
                          onClick={downloadAsSVG}
                        >
                          Download SVG
                        </button>
                        <button
                          className="w-full px-3 py-2 text-xs text-left hover:bg-muted transition-colors flex items-center gap-2"
                          onClick={downloadAsPNG}
                        >
                          Download PNG
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 rounded-lg"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
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
              className="relative"
            >
              <div
                ref={containerRef}
                className="p-4 bg-background flex justify-center items-center min-h-[150px] overflow-hidden select-none"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <DiagramContent />
              </div>
              
              {/* Zoom controls overlay */}
              {svg && !error && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                  <ZoomControls />
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="code"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <pre className="p-4 overflow-x-auto text-sm bg-muted/30">
                <code className="text-foreground">{code}</code>
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col"
          >
            {/* Fullscreen header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Mermaid Diagram</span>
              </div>
              
              <div className="flex items-center gap-2">
                <ZoomControls />
                
                <div className="w-px h-6 bg-border mx-2" />
                
                <div className="relative" data-download-menu>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDownloadMenu(!showDownloadMenu);
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  
                  <AnimatePresence>
                    {showDownloadMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden"
                      >
                        <button
                          className="w-full px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                          onClick={downloadAsSVG}
                        >
                          Download as SVG
                        </button>
                        <button
                          className="w-full px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
                          onClick={downloadAsPNG}
                        >
                          Download as PNG
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={toggleFullscreen}
                  title="Close fullscreen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Fullscreen content */}
            <div
              className="flex-1 flex items-center justify-center overflow-hidden select-none"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div
                ref={diagramRef}
                className={cn(
                  "mermaid-diagram transition-transform duration-100",
                  zoom > 1 && "cursor-grab",
                  isPanning && "cursor-grabbing"
                )}
                style={{
                  transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  transformOrigin: "center center",
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>

            {/* Fullscreen hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
              Ctrl/Cmd + Scroll to zoom • Drag to pan • Press Esc to exit
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
