"""F1 HQ 同期スクリプト: Jolpica-F1 API → Notion
- 標準ライブラリのみ（pip不要）
- 更新するもの: ドライバー/コンストラクターの順位・ポイント・勝利数、
  レースの優勝者・状況(終了/次戦/予定)・日本時間の日程、
  新しいドライバー/レースの自動追加
- 触らないもの: 推し・観た・観戦メモ・特徴メモ・チームのリレーション(既存ドライバー)
"""
import json, os, time, urllib.request
from datetime import datetime, timezone, timedelta

NOTION_TOKEN = os.environ["NOTION_TOKEN"]
SEASON = os.environ.get("F1_SEASON", "2026")
DB_DRIVERS = os.environ.get("DB_DRIVERS", "07a8306b1ba5461582ef7a2093afaa50")
DB_TEAMS = os.environ.get("DB_TEAMS", "4a9417c7287d4b2d8c1d6a51b9d253f0")
DB_RACES = os.environ.get("DB_RACES", "da6af07ad275456ebb7274894ea4b81e")
API = "https://api.jolpi.ca/ergast/f1"
UA = "F1HQ-NotionSync/1.0"


def http(url, method="GET", body=None, notion=False):
    headers = {"User-Agent": UA}
    if notion:
        headers.update({"Authorization": f"Bearer {NOTION_TOKEN}",
                        "Notion-Version": "2022-06-28",
                        "Content-Type": "application/json"})
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 3:
                time.sleep(2 ** attempt * 2)
                continue
            raise
    time.sleep(0.35)


def jolpica(path):
    time.sleep(0.5)  # Jolpicaのレート制限に配慮
    return http(f"{API}/{SEASON}/{path}?limit=100")["MRData"]


def query_all(db_id):
    rows, cursor = [], None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        res = http(f"https://api.notion.com/v1/databases/{db_id}/query", "POST", body, notion=True)
        rows += res["results"]
        if not res.get("has_more"):
            return rows
        cursor = res["next_cursor"]


def text_of(page, prop):
    p = page["properties"].get(prop, {})
    arr = p.get("rich_text") or p.get("title") or []
    return "".join(t["plain_text"] for t in arr)


def update(page_id, props):
    http(f"https://api.notion.com/v1/pages/{page_id}", "PATCH", {"properties": props}, notion=True)
    time.sleep(0.35)


num = lambda v: {"number": float(v)}


def main():
    teams = {text_of(p, "constructorId"): p["id"] for p in query_all(DB_TEAMS)}
    drivers = {text_of(p, "driverId"): p["id"] for p in query_all(DB_DRIVERS)}
    races = {text_of(p, "raceKey"): p["id"] for p in query_all(DB_RACES)}

    # --- コンストラクター順位
    cs = jolpica("constructorstandings")["StandingsTable"]["StandingsLists"]
    if cs:
        for s in cs[0]["ConstructorStandings"]:
            cid = s["Constructor"]["constructorId"]
            if cid in teams:
                update(teams[cid], {"順位": num(s["position"]), "ポイント": num(s["points"]), "勝利数": num(s["wins"])})
        print(f"constructors updated (round {cs[0]['round']})")

    # --- ドライバー順位（未登録ドライバーは新規作成）
    ds = jolpica("driverstandings")["StandingsTable"]["StandingsLists"]
    if ds:
        for s in ds[0]["DriverStandings"]:
            d = s["Driver"]
            props = {"順位": num(s["position"]), "ポイント": num(s["points"]), "勝利数": num(s["wins"])}
            if d["driverId"] in drivers:
                update(drivers[d["driverId"]], props)
            else:
                team_id = teams.get(s["Constructors"][-1]["constructorId"])
                props.update({
                    "ドライバー": {"title": [{"text": {"content": f"{d['givenName']} {d['familyName']}"}}]},
                    "driverId": {"rich_text": [{"text": {"content": d["driverId"]}}]},
                    "コード": {"rich_text": [{"text": {"content": d.get("code", "")}}]},
                    "国籍": {"rich_text": [{"text": {"content": d.get("nationality", "")}}]},
                    "役割": {"select": {"name": "リザーブ/代役"}},
                })
                if d.get("permanentNumber"):
                    props["No"] = num(d["permanentNumber"])
                if team_id:
                    props["チーム"] = {"relation": [{"id": team_id}]}
                http("https://api.notion.com/v1/pages", "POST",
                     {"parent": {"database_id": DB_DRIVERS}, "properties": props}, notion=True)
                drivers[d["driverId"]] = "new"
                print(f"new driver added: {d['driverId']}")
        print(f"drivers updated (round {ds[0]['round']})")
    drivers = {text_of(p, "driverId"): p["id"] for p in query_all(DB_DRIVERS)}

    # --- 優勝者
    for race in jolpica("results/1")["RaceTable"]["Races"]:
        key = f"{SEASON}-{race['round']}"
        winner = drivers.get(race["Results"][0]["Driver"]["driverId"])
        if key in races and winner:
            update(races[key], {"優勝": {"relation": [{"id": winner}]}})

    # --- カレンダー: 状況・日本時間の日程を更新（新レースは自動追加）
    now = datetime.now(timezone.utc)
    next_marked = False
    for race in sorted(jolpica("races")["RaceTable"]["Races"], key=lambda r: int(r["round"])):
        key = f"{SEASON}-{race['round']}"
        start = to_utc(race)
        if now > start + timedelta(hours=3):
            status = "終了"
        elif not next_marked:
            status, next_marked = "次戦", True
        else:
            status = "予定"
        props = {"状況": {"select": {"name": status}},
                 "決勝(JST)": jst(race), "スプリント開催": {"checkbox": "Sprint" in race}}
        for col, sess in (("予選(JST)", "Qualifying"), ("FP1(JST)", "FirstPractice"), ("スプリント(JST)", "Sprint")):
            if sess in race:
                props[col] = jst(race[sess])
        if key in races:
            update(races[key], props)
        else:
            props.update({
                "グランプリ": {"title": [{"text": {"content": f"R{int(race['round']):02d} {race['raceName']}"}}]},
                "Round": num(race["round"]),
                "raceKey": {"rich_text": [{"text": {"content": key}}]},
                "サーキット": {"rich_text": [{"text": {"content": race["Circuit"]["circuitName"]}}]},
                "国": {"rich_text": [{"text": {"content": race["Circuit"]["Location"]["country"]}}]},
                "Wikipedia": {"url": race.get("url")},
            })
            http("https://api.notion.com/v1/pages", "POST",
                 {"parent": {"database_id": DB_RACES}, "properties": props}, notion=True)
            print(f"new race added: {key}")
    print("races updated")


JST = timezone(timedelta(hours=9))


def to_utc(s):
    return datetime.fromisoformat(f"{s['date']}T{s.get('time', '12:00:00Z').replace('Z', '+00:00')}")


def jst(s):
    return {"date": {"start": to_utc(s).astimezone(JST).isoformat()}}


if __name__ == "__main__":
    main()
