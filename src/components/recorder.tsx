"use client";

import { useEffect, useRef, useState } from "react";
import { getUploadUrl, registerRecording } from "@/lib/actions/recording";

type Props = {
  checkInId: string;
  onUploaded?: (recordingId: string) => void;
  maxSeconds?: number;
};

type Phase = "idle" | "requesting" | "ready" | "recording" | "preview" | "uploading" | "uploaded";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}

export function Recorder({ checkInId, onUploaded, maxSeconds = 300 }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const compositeStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const camElRef = useRef<HTMLVideoElement | null>(null);
  const screenElRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount / phase reset.
  useEffect(
    () => () => {
      teardown();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    compositeStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    screenStreamRef.current = null;
    compositeStreamRef.current = null;
    recorderRef.current = null;
  }

  async function requestStreams() {
    setError(null);
    setPhase("requesting");
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      camStreamRef.current = cam;
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenStreamRef.current = screen;
      // Some browsers end the screen stream when the user hits the browser's
      // "Stop sharing" button; wire that up.
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        if (phase === "recording") stop();
      });

      startCompositor();
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permission denied");
      setPhase("idle");
      teardown();
    }
  }

  function startCompositor() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const camEl = camElRef.current!;
    const screenEl = screenElRef.current!;
    camEl.srcObject = camStreamRef.current;
    screenEl.srcObject = screenStreamRef.current;
    camEl.muted = true;
    screenEl.muted = true;
    void camEl.play();
    void screenEl.play();

    const draw = () => {
      // Screen fills; camera as circle in bottom-right.
      if (screenEl.readyState >= 2) {
        ctx.drawImage(screenEl, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (camEl.readyState >= 2) {
        const camW = 240;
        const camH = 240;
        const cx = canvas.width - camW - 24;
        const cy = canvas.height - camH - 24;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx + camW / 2, cy + camH / 2, camW / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        // Cover-crop the camera into the circle.
        const camAR = camEl.videoWidth / camEl.videoHeight || 4 / 3;
        const targetAR = 1;
        let sx = 0,
          sy = 0,
          sw = camEl.videoWidth,
          sh = camEl.videoHeight;
        if (camAR > targetAR) {
          sw = camEl.videoHeight;
          sx = (camEl.videoWidth - sw) / 2;
        } else {
          sh = camEl.videoWidth;
          sy = (camEl.videoHeight - sh) / 2;
        }
        ctx.drawImage(camEl, sx, sy, sw, sh, cx, cy, camW, camH);
        ctx.restore();
        // Ring
        ctx.beginPath();
        ctx.arc(cx + camW / 2, cy + camH / 2, camW / 2 + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    // Composite stream: canvas video + camera audio.
    const canvasStream = canvas.captureStream(30);
    const audioTrack = camStreamRef.current!.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
    compositeStreamRef.current = canvasStream;
  }

  function start() {
    const stream = compositeStreamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = pickMime();
    const rec = new MediaRecorder(stream, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: mime });
      const url = URL.createObjectURL(b);
      setBlob(b);
      setBlobUrl(url);
      setPhase("preview");
      teardown();
    };
    recorderRef.current = rec;
    rec.start(1000);
    startedAtRef.current = Date.now();
    setPhase("recording");
    setElapsed(0);
    tick();
    stopTimerRef.current = setTimeout(() => {
      if (recorderRef.current?.state === "recording") stop();
    }, maxSeconds * 1000);
  }

  function tick() {
    if (recorderRef.current?.state !== "recording") return;
    setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    setTimeout(tick, 500);
  }

  function stop() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  function retake() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setError(null);
    setPhase("idle");
  }

  async function upload() {
    if (!blob) return;
    setError(null);
    setPhase("uploading");
    try {
      const dur = previewRef.current?.duration;
      const durationMs =
        dur && Number.isFinite(dur) ? Math.round(dur * 1000) : null;

      const presign = await getUploadUrl({
        checkInId,
        mimeType: blob.type || "video/webm",
        sizeBytes: blob.size,
      });
      if (!presign.ok) throw new Error(presign.error);

      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "content-type": blob.type || "video/webm" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const reg = await registerRecording({
        checkInId,
        objectKey: presign.objectKey,
        mimeType: blob.type || "video/webm",
        sizeBytes: blob.size,
        durationMs,
      });
      if (!reg.ok) throw new Error(reg.error);

      setPhase("uploaded");
      onUploaded?.(reg.recordingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("preview");
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Video note</p>
          <p className="text-[11px] text-muted-foreground">
            Screen + camera · up to {Math.round(maxSeconds / 60)} min · optional.
          </p>
        </div>
        {phase === "recording" && (
          <span className="inline-flex items-center gap-2 text-xs font-mono">
            <span className="size-2 rounded-full bg-red-500 animate-pulse" />
            {formatTime(elapsed)} / {formatTime(maxSeconds)}
          </span>
        )}
      </div>

      {/* Off-screen sources (invisible but decoded) */}
      <video ref={camElRef} className="hidden" playsInline />
      <video ref={screenElRef} className="hidden" playsInline />

      {(phase === "requesting" || phase === "ready" || phase === "recording") && (
        <canvas
          ref={canvasRef}
          className="w-full aspect-video rounded-md bg-black border border-white/10"
        />
      )}

      {phase === "preview" && blobUrl && (
        <video
          ref={previewRef}
          src={blobUrl}
          controls
          className="w-full aspect-video rounded-md bg-black border border-white/10"
        />
      )}

      {phase === "uploaded" && (
        <div className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-4 py-3 text-sm text-emerald-200">
          ✓ Video attached to this check-in.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" && (
          <button
            type="button"
            onClick={requestStreams}
            className="h-10 px-4 rounded-md border border-white/15 text-sm hover:bg-white/[0.04] transition"
          >
            Record a video
          </button>
        )}
        {phase === "requesting" && (
          <span className="text-xs text-muted-foreground">Requesting camera + screen…</span>
        )}
        {phase === "ready" && (
          <button
            type="button"
            onClick={start}
            className="h-10 px-4 rounded-md bg-red-500/90 text-white text-sm font-medium hover:bg-red-500 transition inline-flex items-center gap-2"
          >
            <span className="size-2 rounded-full bg-white" />
            Start recording
          </button>
        )}
        {phase === "recording" && (
          <button
            type="button"
            onClick={stop}
            className="h-10 px-4 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
          >
            Stop
          </button>
        )}
        {phase === "preview" && (
          <>
            <button
              type="button"
              onClick={upload}
              className="h-10 px-4 rounded-md bg-foreground text-primary-foreground text-sm font-medium hover:bg-foreground/90 transition"
            >
              Attach to check-in
            </button>
            <button
              type="button"
              onClick={retake}
              className="h-10 px-4 rounded-md text-sm text-muted-foreground hover:text-foreground transition"
            >
              Retake
            </button>
          </>
        )}
        {phase === "uploading" && (
          <span className="text-xs text-muted-foreground">Uploading…</span>
        )}

        <span className="flex-1" />
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
