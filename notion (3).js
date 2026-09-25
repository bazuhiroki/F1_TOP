// Notion API helper（Cloudflare Pages Functions から利用）
export const DEFAULT_DB = {
  drivers: "07a8306b1ba5461582ef7a2093afaa50",
  teams: "4a9417c7287d4b2d8c1d6a51b9d253f0",
  races: "da6af07ad275456ebb7274894ea4b81e",
  glossary: "528136d536df4778a31b8699969f8385",
  news: "f006cba5444b4087b4a18f1bcc875523",
};

export function dbIds(env) {
  return {
    drivers: env.DB_DRIVERS || DEFAULT_DB.drivers,
    teams: env.DB_TEAMS || DEFAULT_DB.teams,
    races: env.DB_RACES || DEFAULT_DB.races,
    glossary: env.DB_GLOSSARY || DEFAULT_DB.glossary,
    news: env.DB_NEWS || DEFAULT_DB.news,
  };
}

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

// アプリ用の合言葉（APP_KEY）チェック。未設定なら誰にも開放しない。
export function checkKey(request, env) {
  if (!env.NOTION_TOKEN) return json({ error: "サーバーに NOTION_TOKEN が設定されていません。" }, 500);
  if (!env.APP_KEY) return json({ error: "サーバーに APP_KEY が設定されていません。" }, 500);
  const key = request.headers.get("x-app-key") || "";
  if (key !== env.APP_KEY) return json({ error: "合言葉が違います。設定画面で入力し直してください。" }, 401);
  return null;
}

export async function notion(env, path, method = "GET", body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || res.statusText;
    throw new Error(`Notion API ${res.status}: ${msg}`);
  }
  return data;
}

export async function queryAll(env, dbId, body = {}, max = 300) {
  const rows = [];
  let cursor;
  do {
    const res = await notion(env, `databases/${dbId}/query`, "POST", {
      page_size: 100,
      ...body,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor && rows.length < max);
  return rows;
}

// Notionのプロパティを素の値に変換
export function val(page, name) {
  const p = page.properties?.[name];
  if (!p) return null;
  switch (p.type) {
    case "title":
    case "rich_text":
      return p[p.type].map((t) => t.plain_text).join("");
    case "number":
      return p.number;
    case "checkbox":
      return p.checkbox;
    case "select":
      return p.select?.name ?? null;
    case "multi_select":
      return p.multi_select.map((o) => o.name);
    case "url":
      return p.url;
    case "date":
      return p.date?.start ?? null;
    case "relation":
      return p.relation.map((r) => r.id);
    case "created_time":
      return p.created_time;
    default:
      return null;
  }
}

export const plainId = (id) => String(id || "").replace(/-/g, "").toLowerCase();
