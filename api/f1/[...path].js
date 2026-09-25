// Vercel用: GET /api/f1/*（Jolpica-F1 の中継。VercelのCDNで5分キャッシュ）
import { onRequestGet } from "../../functions/api/f1/[[path]].js";
export async function GET(request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/f1\/?/, "").split("/").filter(Boolean);
  const res = await onRequestGet({ request, params: { path } });
  const headers = new Headers(res.headers);
  headers.set("cache-control", "public, s-maxage=300, stale-while-revalidate=600");
  return new Response(res.body, { status: res.status, headers });
}
