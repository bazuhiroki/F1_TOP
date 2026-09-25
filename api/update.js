// Vercel用: POST /api/update（中身は functions/api/update.js と共通）
import { onRequestPost } from "../functions/api/update.js";
export async function POST(request) {
  return onRequestPost({ request, env: process.env });
}
