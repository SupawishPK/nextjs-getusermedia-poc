"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ============================================================
   POC: getUserMedia ครบทุกแบบในหน้าเดียว
   - ขอสิทธิ์กล้อง/ไมค์ ด้วย getUserMedia หลายรูปแบบ
   - enumerateDevices + Permissions API
   - getDisplayMedia (แชร์หน้าจอ)
   - Log ทุก event: console + หน้าจอ + localStorage
     (localStorage ทำให้ log รอด reload และทำงานได้ทั้ง dev
      และ static export / GitHub Pages)
   ============================================================ */

type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  category: string;
  message: string;
  detail?: string;
}

interface DeviceLite {
  deviceId: string;
  kind: string;
  label: string;
  groupId: string;
}

interface StreamInfo {
  tracks: { kind: string; label: string; readyState: string; muted: boolean }[];
  settings: { width?: number; height?: number; frameRate?: number; facingMode?: string; deviceId?: string } | null;
}

/* key สำหรับเก็บ log ไว้ใน localStorage (วงแหวน ~500 รายการ) */
const LS_KEY = "gum-poc-logs";

/* รูปแบบการขอสิทธิ์ทั้งหมดที่ใช้ใน POC นี้ */
const VARIANTS: { id: string; label: string; constraints: MediaStreamConstraints }[] = [
  { id: "video-basic", label: "กล้องอย่างเดียว (video: true)", constraints: { video: true } },
  { id: "video-hd", label: "กล้อง HD 1280x720", constraints: { video: { width: { ideal: 1280 }, height: { ideal: 720 } } } },
  { id: "video-fhd", label: "กล้อง FHD 1920x1080", constraints: { video: { width: { ideal: 1920 }, height: { ideal: 1080 } } } },
  { id: "video-facing-user", label: "กล้องหน้า (facingMode: user)", constraints: { video: { facingMode: "user" } } },
  { id: "video-facing-env", label: "กล้องหลัง (facingMode: environment)", constraints: { video: { facingMode: "environment" } } },
  { id: "video-audio", label: "กล้อง + ไมค์ (video + audio)", constraints: { video: true, audio: true } },
  { id: "audio-only", label: "ไมค์อย่างเดียว (audio: true)", constraints: { audio: true } },
];

/* แปลง error ของ getUserMedia เป็นข้อความไทย + คำแนะนำ */
function describeError(err: unknown): { name: string; message: string; hint: string } {
  if (err instanceof DOMException) {
    const e = err as DOMException & { constraint?: string };
    switch (e.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        return {
          name: e.name,
          message: e.message || "ผู้ใช้ปฏิเสธสิทธิ์ หรือเคยกด 'Block' ไว้ (ต้องไปปลดล็อกที่ตั้งค่าของเบราว์เซอร์/OS)",
          hint: "ลอง: เปิด https:// รีเฟรชหน้าแล้วกด Allow ใหม่, หรือเข้า site settings ของเบราว์เซอร์เพื่อรีเซ็ตสิทธิ์กล้อง/ไมค์",
        };
      case "NotFoundError":
      case "DevicesNotFoundError":
        return {
          name: e.name,
          message: e.message || "ไม่พบอุปกรณ์กล้อง/ไมค์ในเครื่อง",
          hint: "ลอง: เสียบกล้อง/ไมค์ให้เรียบร้อย, เช็ค device manager, หรือใช้เบราว์เซอร์ตัวอื่น",
        };
      case "NotReadableError":
      case "TrackStartError":
        return {
          name: e.name,
          message: e.message || "อ่านสัญญาณจากกล้อง/ไมค์ไม่ได้ (อุปกรณ์ถูกโปรแกรมอื่นยึดครองอยู่)",
          hint: "ลอง: ปิดแอปที่ใช้กล้องอยู่ (Zoom, Teams, OBS...) แล้วลองใหม่",
        };
      case "OverconstrainedError":
        return {
          name: e.name,
          message: e.message || `ไม่สามารถตอบสนอง constraint ที่ขอได้${e.constraint ? ` (constraint: ${e.constraint})` : ""}`,
          hint: "ลอง: ลด spec ลง (จาก FHD เป็น HD), หรือใช้ ideal แทน exact",
        };
      case "SecurityError":
        return {
          name: e.name,
          message: e.message || "ไม่ได้รับอนุญาตให้ใช้ getUserMedia (ต้องเป็น HTTPS หรือ localhost เท่านั้น)",
          hint: "ลอง: รันบน localhost หรือ deploy ขึ้น HTTPS (ไม่รองรับ http:// บนเครื่องอื่น / file://)",
        };
      case "AbortError":
        return {
          name: e.name,
          message: e.message || "มีคำขอ getUserMedia อีกตัวกำลังทำงานอยู่ ถูกยกเลิก",
          hint: "ลอง: กดปุ่มทีละปุ่ม รอให้เสร็จก่อนกดปุ่มถัดไป",
        };
      case "TypeError":
        return {
          name: e.name,
          message: e.message || "constraints ไม่ถูกต้อง (invalid constraints)",
          hint: "ลอง: ตรวจสอบรูปแบบ constraints เช่น deviceId ต้องเป็น string, อย่าใส่ค่าว่าง",
        };
      default:
        return { name: e.name, message: e.message || "เกิด error ที่ไม่รู้จัก", hint: "ดู error console (F12) เพิ่มเติม" };
    }
  }
  return { name: "UnknownError", message: String(err), hint: "ดู error console (F12) เพิ่มเติม" };
}

export default function GetUserMediaPocPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idRef = useRef(0);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [devices, setDevices] = useState<DeviceLite[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [permCamera, setPermCamera] = useState<PermissionState | "unsupported" | "unknown">("unknown");
  const [permMic, setPermMic] = useState<PermissionState | "unsupported" | "unknown">("unknown");
  const [streamState, setStreamState] = useState<"idle" | "starting" | "active" | "stopped" | "error">("idle");
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [isSecure, setIsSecure] = useState(true);

  /* -------- logging: หน้าจอ + console + localStorage -------- */
  const log = useCallback((level: LogLevel, category: string, message: string, detail?: string) => {
    const entry: LogEntry = {
      id: ++idRef.current,
      time: new Date().toISOString(),
      level,
      category,
      message,
      detail,
    };
    setLogs((prev) => [...prev.slice(-499), entry]);

    const prefix = `[${entry.time}] [${level}] [${category}] ${message}`;
    if (level === "ERROR") console.error(prefix, detail ?? "");
    else if (level === "WARN") console.warn(prefix, detail ?? "");
    else console.log(prefix, detail ?? "");

    /* persist ลง localStorage — ใช้ได้ทั้ง dev และ static export (ไม่มี server ให้ POST log) */
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as Array<Omit<LogEntry, "id">>;
      saved.push({ level, category, message, detail, time: entry.time });
      localStorage.setItem(LS_KEY, JSON.stringify(saved.slice(-500)));
    } catch {
      /* localStorage ใช้ไม่ได้ (privacy mode) — ข้าม ไม่ block UI */
    }
  }, []);

  /* -------- ขอสิทธิ์กล้อง/ไมค์ (getUserMedia) -------- */
  const requestStream = useCallback(
    async (label: string, constraints: MediaStreamConstraints) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        log("ERROR", "API", "navigator.mediaDevices.getUserMedia ไม่รองรับในเบราว์เซอร์นี้", navigator.userAgent);
        setStreamState("error");
        return;
      }
      stopStream(false);
      setStreamState("starting");
      log("INFO", "getUserMedia", `เริ่มขอสิทธิ์: ${label}`, JSON.stringify(constraints));

      const started = Date.now();
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const elapsed = Date.now() - started;

        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStreamState("active");
        setStreamInfo({
          tracks: stream.getTracks().map((t) => ({ kind: t.kind, label: t.label, readyState: t.readyState, muted: t.muted })),
          settings: stream.getVideoTracks()[0]?.getSettings() ?? null,
        });
        log(
          "SUCCESS",
          "getUserMedia",
          `ได้สิทธิ์แล้ว: ${label} (ใช้เวลา ${elapsed}ms, ${stream.getTracks().length} track)`,
          JSON.stringify({ constraints, tracks: stream.getTracks().map((t) => ({ kind: t.kind, label: t.label })) })
        );
        refreshDevices();
      } catch (err) {
        const d = describeError(err);
        setStreamState("error");
        setStreamInfo(null);
        log("ERROR", "getUserMedia", `${label} → ${d.name}: ${d.message}`);
        log("WARN", "hint", d.hint);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log]
  );

  /* -------- ขอสิทธิ์ด้วย deviceId ที่เลือกจาก enumerateDevices -------- */
  const requestSelectedDevice = useCallback(async () => {
    if (!selectedDeviceId) {
      log("WARN", "deviceId", "ยังไม่ได้เลือกอุปกรณ์ (กด 'สแกนอุปกรณ์' ก่อน แล้วเลือกในรายการ)");
      return;
    }
    await requestStream(
      `อุปกรณ์ที่เลือก (${selectedDeviceId.slice(0, 12)}…)`,
      { video: { deviceId: { exact: selectedDeviceId } } }
    );
  }, [selectedDeviceId, requestStream, log]);

  /* -------- แชร์หน้าจอ (getDisplayMedia) -------- */
  const requestDisplay = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      log("ERROR", "API", "navigator.mediaDevices.getDisplayMedia ไม่รองรับในเบราว์เซอร์นี้");
      return;
    }
    stopStream(false);
    setStreamState("starting");
    log("INFO", "getDisplayMedia", "เริ่มขอแชร์หน้าจอ...");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreamState("active");
      setStreamInfo({
        tracks: stream.getTracks().map((t) => ({ kind: t.kind, label: t.label, readyState: t.readyState, muted: t.muted })),
        settings: stream.getVideoTracks()[0]?.getSettings() ?? null,
      });
      log("SUCCESS", "getDisplayMedia", "แชร์หน้าจอสำเร็จ", JSON.stringify(stream.getTracks().map((t) => t.label)));
    } catch (err) {
      const d = describeError(err);
      setStreamState("error");
      log("ERROR", "getDisplayMedia", `แชร์หน้าจอล้มเหลว → ${d.name}: ${d.message}`);
      log("WARN", "hint", d.hint);
    }
  }, [log]);

  /* -------- หยุด stream -------- */
  const stopStream = useCallback(
    (doLog = true) => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStreamInfo(null);
      setStreamState("stopped");
      if (doLog) log("INFO", "stream", "หยุด stream แล้ว (stopTracks ทั้งหมด)");
    },
    [log]
  );

  /* -------- enumerateDevices -------- */
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const clean: DeviceLite[] = list.map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind,
        label: d.label || "(ยังไม่ระบุชื่อ — ต้องขอสิทธิ์ก่อน ถึงจะเห็น label)",
        groupId: d.groupId || "",
      }));
      setDevices(clean);
      const counts = clean.reduce<Record<string, number>>((acc, d) => {
        acc[d.kind] = (acc[d.kind] ?? 0) + 1;
        return acc;
      }, {});
      log(
        "INFO",
        "enumerateDevices",
        `พบอุปกรณ์ทั้งหมด ${list.length} ตัว (${Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", ")})`,
        clean.map((d) => `${d.kind}: ${d.label}${d.groupId ? ` [group: ${d.groupId.slice(0, 8)}…]` : ""}`).join(" | ")
      );
    } catch (err) {
      const d = describeError(err);
      log("ERROR", "enumerateDevices", `สแกนอุปกรณ์ล้มเหลว → ${d.name}: ${d.message}`);
    }
  }, [log]);

  /* -------- Permissions API -------- */
  const checkPermissions = useCallback(async () => {
    if (typeof navigator.permissions?.query !== "function") {
      setPermCamera("unsupported");
      setPermMic("unsupported");
      log("WARN", "permissions", "Permissions API ไม่รองรับในเบราว์เซอร์นี้ (Safari/Firefox ไม่ query camera ได้)");
      return;
    }
    try {
      const cam = await navigator.permissions.query({ name: "camera" as PermissionName });
      setPermCamera(cam.state);
      log("INFO", "permissions", `สถานะสิทธิ์กล้อง (Permissions API): ${cam.state}`);
      cam.addEventListener("change", () => {
        setPermCamera(cam.state);
        log("INFO", "permissions", `สถานะสิทธิ์กล้องเปลี่ยนเป็น: ${cam.state}`);
      });

      const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setPermMic(mic.state);
      log("INFO", "permissions", `สถานะสิทธิ์ไมค์ (Permissions API): ${mic.state}`);
      mic.addEventListener("change", () => {
        setPermMic(mic.state);
        log("INFO", "permissions", `สถานะสิทธิ์ไมค์เปลี่ยนเป็น: ${mic.state}`);
      });
    } catch (err) {
      setPermCamera("unsupported");
      setPermMic("unsupported");
      log("WARN", "permissions", "Permissions API query camera/microphone ไม่รองรับในเบราว์เซอร์นี้", String(err));
    }
  }, [log]);

  /* -------- mount: โหลด log เดิม + เช็ค secure context + สิทธิ์ + อุปกรณ์ -------- */
  useEffect(() => {
    /* โหลด log เก่าจาก localStorage กลับมา (กรณีเปิดซ้ำ/refresh) */
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as Array<Omit<LogEntry, "id">>;
      saved.forEach((s) => setLogs((prev) => [...prev, { ...s, id: ++idRef.current }]));
      if (saved.length > 0) console.info(`[gum-poc] โหลด log เดิมจาก localStorage กลับมา ${saved.length} รายการ`);
    } catch {
      /* ไม่มี log เก่า หรือ localStorage เสีย */
    }

    setIsSecure(window.isSecureContext);
    log(
      "INFO",
      "app",
      `โหลดหน้า POC แล้ว (secureContext: ${window.isSecureContext}) — ${window.location.href}`,
      navigator.userAgent
    );
    if (!window.isSecureContext) {
      log("WARN", "app", "⚠️ ไม่ใช่ HTTPS/localhost — getUserMedia จะโดน SecurityError เกือบทุกเบราว์เซอร์");
    }
    checkPermissions();
    refreshDevices();
    /* auto-rescan ทุกครั้งที่อุปกรณ์เสียบ/ถอด (devicechange) */
    const onDeviceChange = () => {
      log("INFO", "enumerateDevices", "ตรวจพบการเปลี่ยนแปลงของอุปกรณ์ (devicechange) — สแกนใหม่");
      refreshDevices();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------- เครื่องมือ log panel -------- */
  const copyLogs = useCallback(() => {
    const text = logs.map((l) => `[${l.time}] [${l.level}] [${l.category}] ${l.message}${l.detail ? ` :: ${l.detail}` : ""}`).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => log("SUCCESS", "log", `คัดลอก log ไป clipboard แล้ว (${logs.length} บรรทัด)`),
      () => log("WARN", "log", "คัดลอก log ไม่ได้ (clipboard ถูก block)")
    );
  }, [logs, log]);

  const copyDeviceId = useCallback(
    (deviceId: string) => {
      navigator.clipboard?.writeText(deviceId).then(
        () => log("SUCCESS", "deviceId", `คัดลอก deviceId แล้ว (${deviceId.slice(0, 12)}…)`),
        () => log("WARN", "deviceId", "คัดลอก deviceId ไม่ได้ (clipboard ถูก block)")
      );
    },
    [log]
  );

  const downloadLogs = useCallback(() => {
    const text = logs.map((l) => `[${l.time}] [${l.level}] [${l.category}] ${l.message}${l.detail ? ` :: ${l.detail}` : ""}`).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `getusermedia-poc-log-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    log("SUCCESS", "log", `ดาวน์โหลด log แล้ว (${logs.length} บรรทัด)`);
  }, [logs, log]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    idRef.current = 0;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  /* -------- render -------- */
  const permBadge = (state: PermissionState | "unsupported" | "unknown") =>
    state === "granted" ? "granted ✅" : state === "denied" ? "denied ❌" : state === "prompt" ? "prompt ⏳" : state === "unsupported" ? "ไม่รองรับ" : "unknown";

  const levelClass: Record<LogLevel, string> = { INFO: "lvl-info", SUCCESS: "lvl-success", WARN: "lvl-warn", ERROR: "lvl-error" };

  return (
    <main className="page">
      <header className="header">
        <h1>📷 POC: getUserMedia (สิทธิ์กล้อง/ไมค์)</h1>
        <p className="sub">
          ทดสอบการขอ permission กล้อง/ไมค์ทุกรูปแบบในหน้าเดียว — ทุก event ถูก log ไปที่ console, หน้าจอ และ <code>localStorage</code> (ดาวน์โหลดเป็นไฟล์ได้)
        </p>
        <p className="sub">
          Next.js {`${VARIANTS.length}`} รูปแบบการขอ + enumerateDevices + Permissions API + getDisplayMedia
        </p>
      </header>

      {!isSecure && (
        <div className="banner warn">
          ⚠️ หน้านี้ไม่ได้รันบน <b>HTTPS หรือ localhost</b> — getUserMedia จะถูก block ด้วย SecurityError เกือบทุกเบราว์เซอร์ วิธีแก้: รัน
          <code>npm run dev</code> แล้วเปิด <code>http://localhost:3000</code> หรือเปิดผ่าน GitHub Pages (HTTPS อัตโนมัติ)
        </div>
      )}

      {/* สถานะสิทธิ์ */}
      <section className="card">
        <h2>1) สถานะสิทธิ์ปัจจุบัน (Permissions API)</h2>
        <div className="badges">
          <span className="badge">กล้อง: <b>{permBadge(permCamera)}</b></span>
          <span className="badge">ไมค์: <b>{permBadge(permMic)}</b></span>
          <span className="badge">stream: <b>{streamState}</b></span>
          <button onClick={checkPermissions} className="btn ghost">รีเช็คสิทธิ์</button>
        </div>
        <p className="hint">
          💡 <b>granted</b> = อนุญาตแล้ว | <b>prompt</b> = ยังไม่เคยถาม (เบราว์เซอร์จะ popup เมื่อกดปุ่มขอสิทธิ์) | <b>denied</b> = ถูกปฏิเสธ ต้องไปรีเซ็ตที่ตั้งค่าเบราว์เซอร์/OS
        </p>
      </section>

      {/* ขอสิทธิ์แบบต่างๆ */}
      <section className="card">
        <h2>2) ขอสิทธิ์ (getUserMedia) — ทุกแบบ</h2>
        <div className="grid">
          {VARIANTS.map((v) => (
            <button key={v.id} className="btn primary" onClick={() => requestStream(v.label, v.constraints)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={requestSelectedDevice}>📌 ขอกล้องตัวที่เลือกด้านล่าง (deviceId exact)</button>
          <button className="btn primary" onClick={requestDisplay}>🖥️ แชร์หน้าจอ (getDisplayMedia)</button>
          <button className="btn danger" onClick={() => stopStream()}>⏹️ หยุด stream</button>
          <button className="btn ghost" onClick={refreshDevices}>🔍 สแกนอุปกรณ์ (enumerateDevices)</button>
        </div>
      </section>

      {/* อุปกรณ์ */}
      <section className="card">
        <h2>3) อุปกรณ์ที่ตรวจพบ (enumerateDevices)</h2>
        <p className="hint" style={{ marginTop: -6 }}>
          🖱️ คลิกที่ <code>deviceId</code> เพื่อคัดลอก · สแกนอัตโนมัติเมื่อเสียบ/ถอดอุปกรณ์ (<code>devicechange</code>) · label จะโผล่หลังขอสิทธิ์แล้ว
        </p>
        {devices.length === 0 ? (
          <p className="hint">ยังไม่มีข้อมูล — กดปุ่ม "สแกนอุปกรณ์" หรือขอสิทธิ์กล้องก่อน แล้ว label ของอุปกรณ์จะโผล่</p>
        ) : (
          <div className="device-list">
            {devices.map((d, i) => (
              <label key={i} className={`device ${d.kind === "videoinput" && d.deviceId === selectedDeviceId ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="device"
                  value={d.deviceId}
                  checked={d.deviceId === selectedDeviceId}
                  onChange={() => setSelectedDeviceId(d.deviceId)}
                  disabled={d.deviceId === ""}
                />
                <span className="device-kind">{d.kind}</span>
                <span className="device-label">{d.label}</span>
                <code
                  className="device-id"
                  title={`deviceId: ${d.deviceId}\ngroupId: ${d.groupId}\n(คลิกเพื่อคัดลอก deviceId)`}
                  onClick={(e) => {
                    e.preventDefault();
                    copyDeviceId(d.deviceId);
                  }}
                >
                  {d.deviceId.slice(0, 24)}…
                </code>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* พรีวิว + สถานะ stream */}
      <section className="card">
        <h2>4) พรีวิว + ข้อมูล stream</h2>
        <div className="preview-wrap">
          <video ref={videoRef} autoPlay playsInline muted className="preview" />
          {streamState !== "active" && <div className="preview-overlay">{streamState === "starting" ? "กำลังขอสิทธิ์..." : "รอสตรีมจากกล้อง..."}</div>}
        </div>
        {streamInfo && (
          <div className="stream-info">
            <p><b>Video settings:</b> {streamInfo.settings ? `${streamInfo.settings.width}×${streamInfo.settings.height} @ ${streamInfo.settings.frameRate ?? "?"}fps, facingMode: ${streamInfo.settings.facingMode ?? "-"}, deviceId: ${(streamInfo.settings.deviceId ?? "").slice(0, 16)}…` : "ไม่มี video track"}</p>
            <p><b>Tracks:</b> {streamInfo.tracks.map((t) => `${t.kind}(${t.label || "no-label"}${t.muted ? ", muted" : ""})`).join(", ")}</p>
          </div>
        )}
      </section>

      {/* Log panel */}
      <section className="card">
        <div className="log-header">
          <h2>5) Log (console + localStorage + ดาวน์โหลด)</h2>
          <div className="log-actions">
            <button className="btn ghost small" onClick={copyLogs}>📋 คัดลอก</button>
            <button className="btn ghost small" onClick={downloadLogs}>⬇️ ดาวน์โหลด</button>
            <button className="btn ghost small" onClick={clearLogs}>🗑️ ล้าง</button>
          </div>
        </div>
        <div className="log-panel">
          {logs.length === 0 ? (
            <div className="log-empty">ยังไม่มี log — กดปุ่มขอสิทธิ์ด้านบนเพื่อเริ่มทดสอบ</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className={`log-line ${levelClass[l.level]}`}>
                <span className="log-time">{l.time.slice(11, 23)}</span>
                <span className="log-level">{l.level}</span>
                <span className="log-cat">{l.category}</span>
                <span className="log-msg">{l.message}</span>
                {l.detail && <span className="log-detail">{l.detail}</span>}
              </div>
            ))
          )}
        </div>
      </section>

      <footer className="footer">
        <p>POC getUserMedia — รันด้วย <code>npm run dev</code> แล้วเปิด <code>http://localhost:3000</code> หรือดูเวอร์ชัน GitHub Pages</p>
      </footer>
    </main>
  );
}
