// Vercel用: GET /api/notion（中身は functions/api/notion.js と共通）
import { onRequestGet } from "../functions/api/notion.js";
export async function GET(request) {
  return onRequestGet({ request, env: process.env });
}
