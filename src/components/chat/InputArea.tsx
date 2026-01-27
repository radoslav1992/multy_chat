import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Send, BookOpen, X, Sparkles, Square, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useChatStore } from "@/stores/chatStore";
import { useKnowledgeStore } from "@/stores/knowledgeStore";
import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

const PROMPT_TEMPLATES = [
  {
    id: "summarize",
    label: "Summarize text",
    template: "Summarize the following:\n\n",
    icon: "📝",
  },
  {
    id: "email",
    label: "Draft an email",
    template: "Draft a professional email about:\n\n",
    icon: "✉️",
  },
  {
    id: "notes",
    label: "Meeting notes",
    template: "Turn these points into clear meeting notes:\n\n",
    icon: "📋",
  },
  {
    id: "plan",
    label: "Create a plan",
    template: "Create a step-by-step plan for:\n\n",
    icon: "🎯",
  },
];

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  isStreaming?: boolean;
  onStopStreaming?: () => void;
  speechEnabled?: boolean;
  speechDisabledReason?: string;
  onTranscribe?: (wavBase64: string) => Promise<void>;
  onRequestSettings?: () => void;
}

export function InputArea({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  isEditing,
  onCancelEdit,
  isStreaming,
  onStopStreaming,
  speechEnabled,
  speechDisabledReason,
  onTranscribe,
  onRequestSettings,
}: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { selectedBucketIds, setSelectedBucketIds } = useChatStore();
  const { buckets } = useKnowledgeStore();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

  const insertTemplate = (template: string) => {
    if (!value.trim()) return template;
    const separator = value.endsWith("\n") ? "\n" : "\n\n";
    return `${value}${separator}${template}`;
  };

  const handleTemplateSelect = (template: string) => {
    const nextValue = insertTemplate(template);
    onChange(nextValue);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const stopStreamTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const samples = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples * blockAlign;
    const bufferLength = 44 + dataSize;
    const view = new DataView(new ArrayBuffer(bufferLength));

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples; i += 1) {
      for (let channel = 0; channel < numChannels; channel += 1) {
        const sample = buffer.getChannelData(channel)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
        offset += 2;
      }
    }

    return view.buffer;
  };

  const resampleTo16k = async (buffer: AudioBuffer): Promise<AudioBuffer> => {
    if (buffer.sampleRate === 16000) {
      return buffer;
    }
    const targetSampleRate = 16000;
    const length = Math.ceil(buffer.duration * targetSampleRate);
    const offline = new OfflineAudioContext(buffer.numberOfChannels, length, targetSampleRate);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    return offline.startRendering();
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const startRecording = async () => {
    if (!speechEnabled) {
      toast({
        title: "Speech not configured",
        description: speechDisabledReason || "Whisper model not ready yet.",
        variant: "destructive",
      });
      onRequestSettings?.();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          setIsTranscribing(true);
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          const audioContext = new AudioContext();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const resampledBuffer = await resampleTo16k(audioBuffer);
          const wavBuffer = audioBufferToWav(resampledBuffer);
          const wavBase64 = arrayBufferToBase64(wavBuffer);
          await onTranscribe?.(wavBase64);
        } catch (error) {
          toast({
            title: "Transcription failed",
            description: String(error),
            variant: "destructive",
          });
        } finally {
          setIsTranscribing(false);
          stopStreamTracks();
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Microphone access failed",
        description: String(error),
        variant: "destructive",
      });
      stopStreamTracks();
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div className="border-t border-border bg-gradient-to-t from-background via-background to-transparent pt-2 pb-4 px-4">
      <div className="max-w-4xl mx-auto">
        {isEditing && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-3 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5"
          >
            <span className="text-xs text-primary font-medium">
              Editing last message
            </span>
            {onCancelEdit && (
              <Button variant="ghost" size="sm" onClick={onCancelEdit} className="h-7 text-xs">
                Cancel
              </Button>
            )}
          </motion.div>
        )}

        {/* Selected Knowledge Buckets */}
        <AnimatePresence>
          {selectedBuckets.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-primary">RAG Active</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedBuckets.map((bucket) => (
                      <span
                        key={bucket.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium"
                      >
                        {bucket.name}
                        <button
                          onClick={() => removeBucket(bucket.id)}
                          className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Container */}
        <div
          className={cn(
            "relative flex items-end rounded-2xl border-2 bg-card shadow-sm transition-all duration-300",
            selectedBuckets.length > 0
              ? "border-primary/30 shadow-primary/5"
              : "border-border hover:border-muted-foreground/30",
            "focus-within:border-primary/50 focus-within:shadow-lg focus-within:shadow-primary/10"
          )}
        >
          {/* Left Actions */}
          <div className="flex items-end p-2 gap-1">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10"
                  title="Prompt templates"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[220px] rounded-xl border border-border bg-popover/95 backdrop-blur-xl p-1.5 shadow-xl animate-fade-in"
                  sideOffset={8}
                  align="start"
                >
                  <div className="px-2 py-1.5 mb-1">
                    <p className="text-xs font-medium text-muted-foreground">Quick prompts</p>
                  </div>
                  {PROMPT_TEMPLATES.map((item) => (
                    <DropdownMenu.Item
                      key={item.id}
                      className={cn(
                        "cursor-pointer select-none rounded-lg px-3 py-2.5 text-sm outline-none transition-colors",
                        "flex items-center gap-2",
                        "data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary"
                      )}
                      onSelect={() => handleTemplateSelect(item.template)}
                    >
                      <span className="text-base">{item.icon}</span>
                      {item.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-2 py-3.5 text-sm min-h-[52px]",
              "placeholder:text-muted-foreground/50 focus:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />

          {/* Right Actions */}
          <div className="flex items-end p-2 gap-1">
            {/* Recording Button */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-9 w-9 rounded-xl transition-all",
                isRecording 
                  ? "bg-destructive/10 text-destructive animate-recording" 
                  : "text-muted-foreground hover:text-primary hover:bg-primary/10"
              )}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled || isTranscribing}
              title={
                isRecording
                  ? "Stop recording"
                  : speechEnabled
                    ? "Voice input"
                    : "Configure speech-to-text"
              }
            >
              {isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : isTranscribing ? (
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            {/* Stop Streaming Button */}
            {isStreaming && onStopStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={onStopStreaming}
                title="Stop response"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}

            {/* Send Button */}
            <Button
              variant="default"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={onSend}
              disabled={disabled || !value.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hint */}
        <div className="flex items-center justify-center gap-3 mt-2.5 text-xs text-muted-foreground/60">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Enter</kbd> to send
          </span>
          <span className="text-muted-foreground/30">•</span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Shift+Enter</kbd> new line
          </span>
          {selectedBuckets.length > 0 && (
            <>
              <span className="text-muted-foreground/30">•</span>
              <span className="text-primary/60">Knowledge search active</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
