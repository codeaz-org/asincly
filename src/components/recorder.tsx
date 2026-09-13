"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, Camera, Check, ChevronDown, MonitorUp, NotebookPen, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { MarkLoader } from "@/components/brand/loader";
import { Button } from "@/components/ui/button";
import { getUploadUrl, registerRecording } from "@/lib/actions/recording";
import type { PrevItem } from "@/lib/ai/draft-schema";
import { plainText } from "@/lib/note-items";

export type RecorderContext = {
  lastDate: string | null;
  lastDateLabel: string | null;
  previous: PrevItem[];
  openBlockers: PrevItem[];
};

type Props = {
  checkInId: string;
  onUploaded?: (recordingId: string) => void;
  maxSeconds?: number;
  /** Already attached recordings (a new one replaces them). */
  existingCount?: number;
  /** The author's previous plan and open blockers, shown while talking. */
  context?: RecorderContext;
};

type Phase = "idle" | "requesting" | "ready" | "recording" | "preview" | "uploading";
type Mode = "camera" | "screen";
export type Hint = "done" | "not_done";

// Safari records mp4; Chrome/Firefox webm. The server allowlists both.
const VIDEO_MIMES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a", "video/mp4"];
const AUDIO_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

function pick(candidates: string[], fallback: string): string {
  if (typeof MediaRecorder === "undefined") return fallback;
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? fallback;
}

const base = (mime: string) => mime.split(";")[0];
const noopSubscribe = () => () => {};

function readNotes(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function Recorder({ checkInId, onUploaded, maxSeconds = 300, existingCount = 0, context }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("camera");
  const canShareScreen = useSyncExternalStore(noopSubscribe, () => !!navigator.mediaDevices?.getDisplayMedia, () => false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [video, setVideo] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, Hint>>({});
  // Talking points live only on this device (per check-in) until they're
  // handed to the drafter with the recording.
  const notesKey = `asincly:notes:${checkInId}`;
  const storedNotes = useSyncExternalStore(noopSubscribe, () => readNotes(notesKey), () => "");
  const [typedNotes, setTypedNotes] = useState<string | null>(null);
  const notes = typedNotes ?? storedNotes;
  const [sheetOpen, setSheetOpen] = useState(false);
  function changeNotes(value: string) {
    setTypedNotes(value);
    try {
      if (value.trim()) localStorage.setItem(notesKey, value);
      else localStorage.removeItem(notesKey);
    } catch {
      // Storage blocked: notes still work for this visit.
    }
  }

  const camStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const videoRecRef = useRef<MediaRecorder | null>(null);
  const audioRecRef = useRef<MediaRecorder | null>(null);
  const videoChunks = useRef<Blob[]>([]);
  const audioChunks = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const camElRef = useRef<HTMLVideoElement | null>(null);
  const screenElRef = useRef<HTMLVideoElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      teardown();
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  function teardown() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    for (const s of [camStreamRef, screenStreamRef, recordStreamRef]) {
      s.current?.getTracks().forEach((t) => t.stop());
      s.current = null;
    }
    videoRecRef.current = null;
    audioRecRef.current = null;
  }

  async function requestStreams() {
    setError(null);
    setPhase("requesting");
    try {
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      camStreamRef.current = cam;

      if (mode === "screen") {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screen;
        screen.getVideoTracks()[0].addEventListener("ended", () => {
          if (videoRecRef.current?.state === "recording") stop();
        });
        startCompositor();
      } else {
        recordStreamRef.current = cam;
        const live = liveRef.current;
        if (live) {
          live.srcObject = cam;
          live.muted = true;
          void live.play();
        }
      }
      setPhase("ready");
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "Camera access was blocked. Allow it in your browser to record." : "Couldn't start the camera.");
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
      if (screenEl.readyState >= 2) {
        ctx.drawImage(screenEl, 0, 0, canvas.width, canvas.height);
      } else {
        ctx.fillStyle = "#1c1814";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (camEl.readyState >= 2) {
        const d = 240;
        const cx = canvas.width - d - 24;
        const cy = canvas.height - d - 24;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx + d / 2, cy + d / 2, d / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const ar = camEl.videoWidth / camEl.videoHeight || 4 / 3;
        let sx = 0,
          sy = 0,
          sw = camEl.videoWidth,
          sh = camEl.videoHeight;
        if (ar > 1) {
          sw = camEl.videoHeight;
          sx = (camEl.videoWidth - sw) / 2;
        } else {
          sh = camEl.videoWidth;
          sy = (camEl.videoHeight - sh) / 2;
        }
        ctx.drawImage(camEl, sx, sy, sw, sh, cx, cy, d, d);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx + d / 2, cy + d / 2, d / 2 + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 196, 120, 0.7)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    const canvasStream = canvas.captureStream(30);
    const audioTrack = camStreamRef.current!.getAudioTracks()[0];
    if (audioTrack) canvasStream.addTrack(audioTrack);
    recordStreamRef.current = canvasStream;
  }

  function start() {
    const stream = recordStreamRef.current;
    const cam = camStreamRef.current;
    if (!stream || !cam) return;
    videoChunks.current = [];
    audioChunks.current = [];
    audioBlobRef.current = null;

    const videoMime = pick(VIDEO_MIMES, "video/webm");
    const videoRec = new MediaRecorder(stream, { mimeType: videoMime });
    videoRec.ondataavailable = (e) => e.data.size > 0 && videoChunks.current.push(e.data);

    // A separate audio-only recording is what gets transcribed: a few hundred
    // KB for five minutes instead of the full video.
    const audioTracks = cam.getAudioTracks();
    let audioDone: Promise<void> = Promise.resolve();
    if (audioTracks.length > 0 && typeof MediaRecorder !== "undefined") {
      const audioMime = pick(AUDIO_MIMES, "");
      if (audioMime) {
        const audioRec = new MediaRecorder(new MediaStream(audioTracks), { mimeType: audioMime, audioBitsPerSecond: 32_000 });
        audioRec.ondataavailable = (e) => e.data.size > 0 && audioChunks.current.push(e.data);
        audioDone = new Promise((resolve) => {
          audioRec.onstop = () => {
            audioBlobRef.current = new Blob(audioChunks.current, { type: base(audioMime) });
            resolve();
          };
        });
        audioRecRef.current = audioRec;
        audioRec.start(1000);
      }
    }

    videoRec.onstop = async () => {
      await audioDone;
      const b = new Blob(videoChunks.current, { type: base(videoMime) });
      const url = URL.createObjectURL(b);
      videoUrlRef.current = url;
      setVideo(b);
      setVideoUrl(url);
      setPhase("preview");
      teardown();
    };
    videoRecRef.current = videoRec;
    videoRec.start(1000);
    startedAtRef.current = Date.now();
    setPhase("recording");
    setElapsed(0);
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 500);
    stopTimerRef.current = setTimeout(() => {
      if (videoRecRef.current?.state === "recording") stop();
    }, maxSeconds * 1000);
  }

  function stop() {
    const a = audioRecRef.current;
    if (a && a.state !== "inactive") a.stop();
    const v = videoRecRef.current;
    if (v && v.state !== "inactive") v.stop();
  }

  function retake() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    videoUrlRef.current = null;
    setVideo(null);
    setVideoUrl(null);
    setError(null);
    setPhase("idle");
  }

  function cancelLive() {
    teardown();
    setPhase("idle");
  }

  // Best-effort poster frame so the feed shows a real thumbnail.
  async function capturePoster(): Promise<Blob | null> {
    const el = previewRef.current;
    if (!el || !el.videoWidth) return null;
    try {
      if (el.currentTime < 0.3 && Number.isFinite(el.duration)) {
        el.currentTime = Math.min(0.5, el.duration / 2);
        await new Promise<void>((res) => {
          const done = () => {
            el.removeEventListener("seeked", done);
            res();
          };
          el.addEventListener("seeked", done);
          setTimeout(res, 800);
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      canvas.getContext("2d")?.drawImage(el, 0, 0);
      return await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.8));
    } catch {
      return null;
    }
  }

  async function put(blob: Blob, mimeType: string): Promise<string | null> {
    const sign = await getUploadUrl({ checkInId, mimeType, sizeBytes: blob.size });
    if (!sign.ok) throw new Error(sign.error);
    const res = await fetch(sign.uploadUrl, { method: "PUT", body: blob, headers: { "content-type": mimeType } });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return sign.objectKey;
  }

  async function upload() {
    if (!video) return;
    setError(null);
    setPhase("uploading");
    try {
      const dur = previewRef.current?.duration;
      const durationMs = dur && Number.isFinite(dur) ? Math.round(dur * 1000) : null;
      const poster = await capturePoster();
      const mimeType = video.type || "video/webm";
      const audio = audioBlobRef.current;

      const [objectKey, audioKey, posterKey] = await Promise.all([
        put(video, mimeType),
        audio && audio.size > 0 ? put(audio, audio.type).catch(() => null) : Promise.resolve(null),
        poster ? put(poster, "image/jpeg").catch(() => null) : Promise.resolve(null),
      ]);
      if (!objectKey) throw new Error("Upload failed");

      const reg = await registerRecording({
        checkInId,
        objectKey,
        audioKey,
        posterKey,
        mimeType,
        sizeBytes: video.size,
        durationMs,
        hints,
        notes: notes.trim() ? notes.slice(0, 2000) : undefined,
      });
      if (!reg.ok) throw new Error(reg.error);
      onUploaded?.(reg.recordingId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setPhase("preview");
    }
  }

  const live = phase === "requesting" || phase === "ready" || phase === "recording";
  const progress = Math.min(1, elapsed / maxSeconds);
  const hasPlan = !!context && (context.previous.length > 0 || context.openBlockers.length > 0);
  const showPanel = live || phase === "idle";
  const panel = (
    <WhileYouTalk context={context} hints={hints} onHint={setHints} notes={notes} onNotes={changeNotes} />
  );

  return (
    <div className="space-y-4">
      {/* Off-screen sources for the screen compositor (decoded, not shown). */}
      <video ref={camElRef} className="hidden" playsInline />
      <video ref={screenElRef} className="hidden" playsInline />

      <div className={cn("grid gap-4", showPanel && "lg:grid-cols-[1fr_300px]")}>
        <div className="space-y-4 min-w-0">
          {phase === "idle" && (
            <div className="space-y-4">
              {canShareScreen && (
                <div role="radiogroup" aria-label="What to record" className="grid grid-cols-2 gap-2">
                  <ModeOption active={mode === "camera"} onClick={() => setMode("camera")} icon={<Camera />} label="Camera" hint="Just you" />
                  <ModeOption active={mode === "screen"} onClick={() => setMode("screen")} icon={<MonitorUp />} label="Screen + camera" hint="Show your work" />
                </div>
              )}
              <button
                type="button"
                onClick={requestStreams}
                className="group w-full rounded-2xl border border-dashed border-line-strong hover:border-amber/60 hover:bg-amber/[0.04] transition px-6 py-12 flex flex-col items-center gap-3 text-center"
              >
                <span className="grid place-items-center size-20 rounded-full border-2 border-ink/25 group-hover:border-amber group-hover:scale-105 transition">
                  <span className="size-8 rounded-full bg-danger" />
                </span>
                <span className="text-lg font-medium text-ink">Turn on camera</span>
                <span className="text-sm text-soft">
                  Up to {Math.round(maxSeconds / 60)} min{existingCount > 0 ? " · replaces your current video" : ""}
                </span>
              </button>
              {/* Phones: prepare below the camera button before starting. */}
              <div className="lg:hidden">{panel}</div>
            </div>
          )}

          {live && (
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black">
              {/* Both mounted so refs exist the moment permissions resolve. */}
              <canvas ref={canvasRef} className={cn("w-full aspect-video", mode === "screen" ? "block" : "hidden")} />
              <video
                ref={liveRef}
                playsInline
                muted
                className={cn("w-full aspect-[4/5] sm:aspect-video object-cover -scale-x-100", mode === "camera" ? "block" : "hidden")}
              />
              {phase === "requesting" && (
                <div className="absolute inset-0 grid place-items-center bg-ground/80">
                  <MarkLoader size="md" label="Asking for your camera" />
                </div>
              )}
              {phase === "recording" && (
                <div className="absolute inset-x-0 top-0 h-1 bg-ink/10">
                  <div className="h-full bg-danger transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
              {/* Phones: notes and plan ride over the camera in a collapsible sheet. */}
              {(hasPlan || notes.trim()) && phase !== "requesting" && (
                <div className="lg:hidden absolute inset-x-0 top-3 px-3">
                  <div className="rounded-2xl bg-ground/80 backdrop-blur-md border border-line">
                    <button
                      type="button"
                      onClick={() => setSheetOpen((v) => !v)}
                      aria-expanded={sheetOpen}
                      className="w-full flex items-center gap-2 px-3 h-10 text-sm text-ink"
                    >
                      <NotebookPen className="size-4 text-amber" />
                      Your notes &amp; plan
                      <ChevronDown className={cn("ml-auto size-4 transition-transform", sheetOpen && "rotate-180")} />
                    </button>
                    {sheetOpen && <div className="max-h-[50vh] overflow-y-auto px-1 pb-1">{panel}</div>}
                  </div>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-3">
                {phase === "recording" && (
                  <span className="inline-flex items-center gap-2 text-xs font-mono tabular-nums rounded-full bg-ground/70 backdrop-blur px-3 py-1 text-ink">
                    <span className="size-2 rounded-full bg-danger animate-mark-breathe" />
                    {formatTime(elapsed)} / {formatTime(maxSeconds)}
                  </span>
                )}
                <div className="flex items-center gap-4">
                  {phase === "ready" && (
                    <button type="button" onClick={cancelLive} className="text-xs text-ink/80 hover:text-ink rounded-full bg-ground/60 backdrop-blur px-3 py-1.5">
                      Cancel
                    </button>
                  )}
                  {phase === "ready" && (
                    <button
                      type="button"
                      onClick={start}
                      aria-label="Start recording"
                      className="grid place-items-center size-16 rounded-full border-[3px] border-ink/90 bg-ground/40 backdrop-blur hover:scale-105 active:scale-95 transition"
                    >
                      <span className="size-10 rounded-full bg-danger" />
                    </button>
                  )}
                  {phase === "recording" && (
                    <button
                      type="button"
                      onClick={stop}
                      aria-label="Stop recording"
                      className="grid place-items-center size-16 rounded-full border-[3px] border-ink/90 bg-ground/40 backdrop-blur hover:scale-105 active:scale-95 transition"
                    >
                      <span className="size-6 rounded-[5px] bg-danger" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {(phase === "preview" || phase === "uploading") && videoUrl && (
            <div className="space-y-4">
              <div className="relative">
                <video
                  ref={previewRef}
                  src={videoUrl}
                  controls={phase === "preview"}
                  playsInline
                  className={cn("w-full aspect-video rounded-2xl bg-black border border-line", phase === "uploading" && "opacity-50")}
                />
                {phase === "uploading" && (
                  <div className="absolute inset-0 grid place-items-center">
                    <MarkLoader size="md" label="Uploading" />
                  </div>
                )}
              </div>
              {phase === "preview" && (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="primary" size="lg" onClick={upload}>
                    Use this video <ArrowRight />
                  </Button>
                  <Button type="button" variant="ghost" size="lg" onClick={retake}>
                    <RotateCcw /> Retake
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {showPanel && (
          <aside aria-label="While you talk" className="hidden lg:block">
            {panel}
          </aside>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Tapping cycles an item: unmarked → done → still going → unmarked.
function nextHint(current: Hint | undefined): Hint | undefined {
  if (!current) return "done";
  if (current === "done") return "not_done";
  return undefined;
}

function setHint(
  hints: Record<string, Hint>,
  key: string,
  onHint: (h: Record<string, Hint>) => void,
) {
  const next = { ...hints };
  const value = nextHint(hints[key]);
  if (value) next[key] = value;
  else delete next[key];
  onHint(next);
}

function WhileYouTalk({
  context,
  hints,
  onHint,
  notes,
  onNotes,
}: {
  context?: RecorderContext;
  hints: Record<string, Hint>;
  onHint: (h: Record<string, Hint>) => void;
  notes: string;
  onNotes: (value: string) => void;
}) {
  const previous = context?.previous ?? [];
  const blockers = context?.openBlockers ?? [];
  const notesId = useId();
  return (
    <div className="lg:sticky lg:top-24 rounded-2xl border border-line bg-ground-raised/70 p-4 space-y-4">
      <p className="text-xs text-soft">What got done · what&rsquo;s next · anything blocking · who you need</p>
      {previous.length > 0 && (
        <div className="space-y-1.5">
          <p className="kicker text-[10px]">
            Last time{context?.lastDateLabel ? ` · ${context.lastDateLabel}` : ""}
          </p>
          <ul className="space-y-0.5">
            {previous.map((item) => {
              const hint = hints[item.key] ?? (item.checked ? "done" : undefined);
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setHint(hints, item.key, onHint)}
                    aria-label={`${plainText(item.text)}: ${hint === "done" ? "done" : hint === "not_done" ? "still going" : "not marked"}`}
                    className="w-full flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-ink/[0.05] transition"
                  >
                    <HintBox hint={hint} />
                    <span className={cn("text-sm leading-snug", hint === "done" ? "text-soft line-through decoration-soft/40" : "text-ink")}>
                      {plainText(item.text)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-faint px-2">Tap to mark, or just say it.</p>
        </div>
      )}
      {blockers.length > 0 && (
        <div className="space-y-1.5">
          <p className="kicker text-[10px]">Still blocking you</p>
          <ul className="space-y-1">
            {blockers.map((b) => (
              <li key={b.key} className="flex items-start gap-2.5 px-2 text-sm text-ink">
                <span className="mt-1.5 size-1.5 rounded-full bg-danger shrink-0" />
                {plainText(b.text)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor={notesId} className="kicker text-[10px] block">
          Your notes
        </label>
        <textarea
          id={notesId}
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder={"Jot what you want to mention…\n- demo went well\n- ask Lena about the keys"}
          className="w-full resize-y rounded-xl bg-ink/[0.04] border border-line px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-faint focus:outline-none focus:border-amber/50"
        />
        <p className="text-[11px] text-faint">
          Only you see these. They help the AI catch anything you meant to say.
        </p>
      </div>
    </div>
  );
}

function HintBox({ hint, small }: { hint: Hint | undefined; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-md border shrink-0 transition",
        small ? "size-3.5" : "mt-0.5 size-4",
        hint === "done" && "bg-amber border-amber text-amber-ink",
        hint === "not_done" && "border-amber/60 text-amber",
        !hint && "border-line-strong",
      )}
    >
      {hint === "done" && <Check className="size-3" strokeWidth={3} />}
      {hint === "not_done" && <ArrowRight className="size-3" strokeWidth={3} />}
    </span>
  );
}

function ModeOption({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition [&_svg]:size-5",
        active ? "border-amber/50 bg-amber/[0.08] text-ink" : "border-line text-soft hover:text-ink hover:border-line-strong",
      )}
    >
      {icon}
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-soft">{hint}</span>
      </span>
    </button>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
