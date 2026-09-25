# F1データAPI リンク集

## メインで使っているもの
### Jolpica-F1（旧Ergast互換）— 無料・APIキー不要
- ベースURL: https://api.jolpi.ca/ergast/f1/
- エンドポイント一覧（APIルート）: https://api.jolpi.ca/ergast/
- ドキュメント: https://github.com/jolpica/jolpica-f1/blob/main/docs/README.md
- GitHub: https://github.com/jolpica/jolpica-f1
- 注意: 独自のUser-Agent設定が求められています。レート制限もあるので連打しないこと。

よく使うURL（2026年）
| 内容 | URL |
|---|---|
| レースカレンダー（全セッション時刻付き） | https://api.jolpi.ca/ergast/f1/2026/races/ |
| ドライバーズ順位 | https://api.jolpi.ca/ergast/f1/2026/driverstandings/ |
| コンストラクターズ順位 | https://api.jolpi.ca/ergast/f1/2026/constructorstandings/ |
| 全レースの優勝者 | https://api.jolpi.ca/ergast/f1/2026/results/1/ |
| 第N戦の決勝結果 | https://api.jolpi.ca/ergast/f1/2026/14/results/ |
| 第N戦の予選結果 | https://api.jolpi.ca/ergast/f1/2026/14/qualifying/ |
| スプリント結果 | https://api.jolpi.ca/ergast/f1/2026/sprint/ |
| ピットストップ | https://api.jolpi.ca/ergast/f1/2026/14/pitstops/ |
| ラップタイム | https://api.jolpi.ca/ergast/f1/2026/14/laps/ |
| 出走ドライバー一覧 | https://api.jolpi.ca/ergast/f1/2026/drivers/ |
| 1950年〜の全シーズン | https://api.jolpi.ca/ergast/f1/seasons/ |

※ 末尾に `?limit=100` を付けると1回で多く取れます（既定30件）。

## 発展用
### OpenF1 — テレメトリ・無線・位置情報など細かいデータ
- サイト/ドキュメント: https://openf1.org/
- 過去セッションのデータは無料。リアルタイム利用の条件は公式サイトで確認を。

### FastF1 — Python用ライブラリ（テレメトリ分析・グラフ化）
- ドキュメント: https://docs.fastf1.dev/
- 内部でJolpicaと公式ライブタイミングを使用

### 公式
- F1公式サイト（結果・順位）: https://www.formula1.com/
- FIA 公式文書（ペナルティ裁定・エントリーリスト）: https://www.fia.com/documents
