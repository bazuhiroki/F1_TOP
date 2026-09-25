// POST /api/update — アプリからNotionへ書き戻す（要 合言葉）
// 変更できるのは 推し / 観た / 観戦メモ / 既読 だけに限定
import { checkKey, dbIds, json, notion, plainId } from "../../lib/notion.js";

const RULES = {
  driver: { db: "drivers", fields: { oshi: ["推し", "checkbox"] } },
  race: { db: "races", fields: { watched: ["観た", "checkbox"], memo: ["観戦メモ", "text"] } },
  news: { db: "news", fields: { read: ["既読", "checkbox"] } },
};

export async function onRequestPost({ request, env }) {
  const denied = checkKey(request, env);
  if (denied) return denied;
  let body;
  try { body = await request.json(); } catch { return json({ error: "リクエストの形式が正しくありません。" }, 400); }
  const { type, pageId, field, value } = body || {};
  const rule = RULES[type];
  const target = rule?.fields[field];
  if (!rule || !target || !pageId) return json({ error: "この項目はアプリから変更できません。" }, 400);

  try {
    // 対象ページが本当にそのDBの行かを確認（他ページの書き換え防止）
    const page = await notion(env, `pages/${pageId}`);
    if (plainId(page.parent?.database_id) !== plainId(dbIds(env)[rule.db])) {
      return json({ error: "対象ページがF1 HQのデータベースにありません。" }, 403);
    }
    const [prop, kind] = target;
    const payload = kind === "checkbox"
      ? { checkbox: !!value }
      : { rich_text: [{ text: { content: String(value ?? "").slice(0, 2000) } }] };
    await notion(env, `pages/${pageId}`, "PATCH", { properties: { [prop]: payload } });
    return json({ ok: true });
  } catch (e) {
    return json({ error: `Notionへの保存に失敗しました（${e.message}）。` }, 502);
  }
}
