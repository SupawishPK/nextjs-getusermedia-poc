import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

/* ============================================================
   API route สำหรับรับ log จากฝั่ง client แล้วเขียนลงไฟล์
   logs/client.log (รูปแบบ JSON 1 บรรทัดต่อ 1 event)
   ============================================================ */

interface LogBody {
  level?: string;
  category?: string;
  message?: string;
  detail?: string;
  url?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LogBody;

    const logDir = path.join(process.cwd(), "logs");
    await fs.mkdir(logDir, { recursive: true });

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level: body.level ?? "INFO",
      category: body.category ?? "unknown",
      message: body.message ?? "",
      detail: body.detail ?? "",
      url: body.url ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "",
    });

    await fs.appendFile(path.join(logDir, "client.log"), line + "\n", "utf8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
