// GET /api/notion — NotionのF1 HQデータをまとめて返す（要 合言葉）
import { checkKey, dbIds, json, queryAll, val } from "../../lib/notion.js";

export async function onRequestGet({ request, env }) {
  const denied = checkKey(request, env);
  if (denied) return denied;
  const db = dbIds(env);
  try {
    const [drivers, teams, races, glossary, news] = await Promise.all([
      queryAll(env, db.drivers),
      queryAll(env, db.teams),
      queryAll(env, db.races),
      queryAll(env, db.glossary),
      queryAll(env, db.news, { sorts: [{ property: "日付", direction: "descending" }] }, 100),
    ]);
    return json({
      drivers: drivers.map((p) => ({
        pageId: p.id, driverId: val(p, "driverId"), name: val(p, "ドライバー"),
        jpName: val(p, "日本語名"), oshi: !!val(p, "推し"), role: val(p, "役割"),
      })),
      teams: teams.map((p) => ({
        pageId: p.id, constructorId: val(p, "constructorId"), name: val(p, "チーム"),
        fullName: val(p, "正式名称"), pu: val(p, "PU"), chassis: val(p, "シャシー"), note: val(p, "特徴メモ"),
      })),
      races: races.map((p) => ({
        pageId: p.id, key: val(p, "raceKey"), round: val(p, "Round"), title: val(p, "グランプリ"),
        circuit: val(p, "サーキット"), watched: !!val(p, "観た"), memo: val(p, "観戦メモ") || "",
      })),
      glossary: glossary.map((p) => ({
        term: val(p, "用語"), en: val(p, "英語/略語"), cat: val(p, "カテゴリ"),
        desc: val(p, "ひとこと説明"), tip: val(p, "観戦で効くポイント"), level: val(p, "レベル"),
      })),
      news: news.map((p) => ({
        pageId: p.id, title: val(p, "見出し"), date: val(p, "日付"), summary: val(p, "要約"),
        link: val(p, "リンク"), importance: val(p, "重要度"), category: val(p, "カテゴリ"),
        related: val(p, "関連") || [], media: val(p, "メディア"), read: !!val(p, "既読"),
      })),
    }, 200, { "cache-control": "private, max-age=30" });
  } catch (e) {
    return json({ error: `Notionの読み込みに失敗しました（${e.message}）。インテグレーションがF1 HQページに接続されているか確認してください。` }, 502);
  }
}
