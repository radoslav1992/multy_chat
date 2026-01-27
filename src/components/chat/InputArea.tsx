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
  },
  {
    id: "email",
    label: "Draft an email",
    template: "Draft a professional email about:\n\n",
  },
  {
    id: "notes",
    label: "Meeting notes",
    template: "Turn these points into clear meeting notes:\n\n",
  },
  {
    id: "plan",
    label: "Create a plan",
    template: "Create a step-by-step plan for:\n\n",
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
    <div className="border-t border-border bg-card/50 backdrop-blur-sm p-4">
      <div className="max-w-4xl mx-auto">
        {isEditing && (
          <div className="flex items-center justify-between mb-2 px-3 py-2 rounded-lg border border-border bg-muted/40">
            <span className="text-xs text-muted-foreground">
              Editing last message
            </span>
            {onCancelEdit && (
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                Cancel
              </Button>
            )}
          </div>
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
          <div className="flex items-end p-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  title="Prompt templates"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg"
                  sideOffset={6}
                  align="start"
                >
                  {PROMPT_TEMPLATES.map((item) => (
                    <DropdownMenu.Item
                      key={item.id}
                      className={cn(
                        "cursor-pointer select-none rounded-md px-3 py-2 text-sm outline-none",
                        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                      )}
                      onSelect={() => handleTemplateSelect(item.template)}
                    >
                      {item.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

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
          <div className="flex items-end p-2 gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl flex-shrink-0"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={disabled || isTranscribing}
              title={
                isRecording
                  ? "Stop recording"
                  : speechEnabled
                    ? "Start voice input"
                    : "Configure speech-to-text in settings"
              }
            >
              {isRecording ? (
                <MicOff className="h-4 w-4 text-destructive" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            {isStreaming && onStopStreaming && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl flex-shrink-0"
                onClick={onStopStreaming}
                title="Stop response"
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
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
