import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceMessageRecorderProps {
  threadId: string;
  onSent: () => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
}

const MAX_DURATION = 120; // 2 minutes max

const VoiceMessageRecorder = ({ threadId, onSent, onRecordingStateChange }: VoiceMessageRecorderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [state, setState] = useState<"idle" | "recording" | "preview" | "uploading">("idle");
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    blobRef.current = null;
    setAudioUrl(null);
    setDuration(0);
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use webm if supported, fallback to mp4
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("preview");
        // Stop all tracks
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      };

      recorder.start(250);
      setState("recording");
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION - 1) {
            recorder.stop();
            if (timerRef.current) clearInterval(timerRef.current);
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      toast({
        title: "Microphone access denied",
        description: "Please enable microphone access to send voice messages.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const discardRecording = () => {
    cleanup();
    setState("idle");
  };

  const sendVoiceMessage = async () => {
    if (!user || !blobRef.current) return;
    setState("uploading");

    try {
      const ext = blobRef.current.type.includes("mp4") ? "m4a" : "webm";
      const path = `${threadId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, blobRef.current, { contentType: blobRef.current.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(path, 60 * 60 * 24 * 365);

      if (!urlData?.signedUrl) throw new Error("Failed to get file URL");

      const { error: msgError } = await supabase.from("thread_messages").insert({
        thread_id: threadId,
        sender_id: user.id,
        content: "",
        attachment_url: urlData.signedUrl,
        attachment_type: "audio",
        attachment_name: `voice-message.${ext}`,
      } as any);

      if (msgError) throw msgError;

      cleanup();
      setState("idle");
      onSent();
    } catch (err: any) {
      console.error("Voice upload failed:", err);
      toast({ title: "Upload failed", description: err.message || "Please try again.", variant: "destructive" });
      setState("preview");
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Idle state — just the mic button
  if (state === "idle") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-10 w-10 text-primary"
        onClick={startRecording}
      >
        <Mic className="h-5 w-5" />
      </Button>
    );
  }

  // Uploading
  if (state === "uploading") {
    return (
      <div className="flex items-center gap-2 flex-1">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Sending voice message...</span>
      </div>
    );
  }

  // Recording state
  if (state === "recording") {
    return (
      <div className="flex items-center gap-2 flex-1">
        <div className="flex items-center gap-2 flex-1 rounded-full bg-destructive/10 px-3 py-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
          <span className="text-sm font-medium text-destructive">{formatTime(duration)}</span>
          <span className="text-xs text-muted-foreground ml-auto">Recording...</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9 text-destructive"
          onClick={discardRecording}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={stopRecording}
        >
          <Square className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Preview state
  return (
    <div className="flex items-center gap-2 flex-1">
      <audio src={audioUrl || undefined} controls className="h-9 flex-1 max-w-full" />
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-9 w-9 text-destructive"
        onClick={discardRecording}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        className="shrink-0 h-9 w-9"
        onClick={sendVoiceMessage}
      >
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default VoiceMessageRecorder;
