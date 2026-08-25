import type { NextConfig } from "next";

/*
 * DEPLOY_TARGET=gh-pages ใช้เฉพาะตอน build ขึ้น GitHub Pages (static export):
 *   - output: "export"  → สร้างไฟล์ static ลงโฟลเดอร์ out/
 *   - basePath: "/nextjs-getusermedia-poc" → ตรงกับชื่อ repo (project site)
 *
 * รันแบบ dev / local ปกติจะไม่ตั้งค่าเหล่านี้ (ไม่มี basePath, build เป็น SPA/SSR ตามปกติ)
 */
const isGhPages = process.env.DEPLOY_TARGET === "gh-pages";

const nextConfig: NextConfig = isGhPages
  ? {
      output: "export",
      basePath: "/nextjs-getusermedia-poc",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
