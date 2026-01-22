# ZenClear
ZEN Studyのレポート進捗を表示し、ChatGPTのCSVスケジュールをGoogleカレンダーへ取り込む拡張です。

## 主な機能
- 月次レポート数/学習時間の表示
- 6〜12月のレポート時間の集計
- ChatGPTのCSVコードブロックをICSに変換してGCalへ

## 使い方
1. GitHubからzipをダウンロードして解凍
2. `chrome://extensions/` にアクセスして右上のデベロッパーモードをオン
3. 「パッケージ化されていない拡張機能を読み込む」から解凍したフォルダを選択

## 設定
`shared/config.js` を編集して動作を調整できます。
- `chatgpt.homeUrl`: 「GPTへ移動」ボタンのリンク先
- `chatgpt.matchPatterns`: ChatGPTタブ検出用のURLパターン
- `chatgpt.pathPrefix`: 特定のGPTだけでCSV変換ボタンを出す場合のパス (例: `/g/xxxx`)
- `zenStudy.siteOrigin` / `zenStudy.apiOrigin`: ZEN Studyのドメインを変更する場合に設定

`zenStudy.siteOrigin` または `zenStudy.apiOrigin` を変更する場合は、
`manifest.json` の `host_permissions` と `content_scripts.matches` も同じドメインに更新してください。

## License
MIT (see `LICENSE`).
