# シフト調整システム

バイトスタッフのシフト希望提出と、管理者によるシフト調整・確定を行う Web アプリケーションです。スマートフォンとPCの両方で操作できます。

- 本番URL: https://kaden-shift.hito-kiwa.co.jp/
- API URL: https://hito-kiwa.co.jp/api/
- リポジトリ: https://github.com/test-hitokiwa/shift-system

---

## システム構成

### フロントエンド
**Vercel** にホスト。`kaden-shift/` 配下の静的ファイル(HTML/CSS/JS)を配信します。
GitHub の `main` ブランチに push すると自動でデプロイされます。

### バックエンド API
**お名前.com レンタルサーバー** にホスト。`api/` 配下の PHP ファイルが対応。
こちらは **GitHub と自動連携していません**。修正するときは、お名前.com のファイルマネージャーから直接編集 or アップロードする必要があります。

### データベース
お名前.com の MySQL (`mysql1026.onamae.ne.jp` 上の `2b98y_shift_system` データベース)。
DB 接続情報は `api/config.php` にハードコードされています。

```
[ブラウザ] ──HTTPS──→ [Vercel: HTML/CSS/JS] 
                            │
                            └──fetch──→ [お名前.com: PHP API] ──→ [MySQL]
```

---

## タブ構成（管理者画面）

| タブ | 機能 |
|------|------|
| シフト管理 | 月+スタッフを選んで個人のシフトをカレンダー表示。直接編集/承認/削除可能。週次の合計時間も表示 |
| 希望シフト一覧 | 全スタッフの希望シフトをリスト形式で表示。日付・ステータスでフィルター |
| シフト未提出者 | 指定期間内にシフト(pending または approved)を1件も出していないスタッフを抽出 |
| ユーザー管理 | スタッフ・管理者ユーザーの追加/編集/削除/パスワード変更 |
| 稼働時間集計 | 任意期間 × スタッフ単位で稼働時間を集計 |
| カレンダー | 月全体のカレンダー。「未承認の希望シフト」と「承認済み・確定シフト」を別ビューで表示。シフトをクリックして編集/削除も可能 |

---

## データ構造

**重要**: 実運用では `shift_requests` テーブル**だけ**を使っています。`shifts` テーブルはレガシーで現在は空(`total: 0`)。シフトの「種類」はステータスで区別します:
- `status = 'pending'` → 未承認（カレンダーで黄色）
- `status = 'approved'` → 承認済み（カレンダーで緑）

### users
| カラム | 説明 |
|--------|------|
| id | UUID |
| name | 表示名 |
| role | `staff` または `admin` |
| phone | 電話番号 |
| password | パスワード（平文保存） |
| created_at / updated_at | UNIX タイムスタンプ(ms) |
| deleted | 論理削除フラグ |

### shift_requests
| カラム | 説明 |
|--------|------|
| id | UUID |
| user_id, user_name | 提出者 |
| date | 勤務日 `YYYY-MM-DD` |
| time_slots | 時間帯の配列（実質1要素、`"HH:MM-HH:MM"` の形式） |
| status | `pending` / `approved` |
| notes | 備考 |
| created_at / updated_at | UNIX タイムスタンプ(ms) |
| deleted | 論理削除フラグ |

### shifts（**未使用 / 触らないこと**）
過去のデータモデルの名残。新規データは入れない方針。

---

## ファイル構成

```
シフト調整システム/
├── README.md                       # このファイル
├── kaden-shift/                    # ★ Vercel にデプロイされる
│   ├── index.html                  # ログイン画面
│   ├── staff.html                  # スタッフ画面
│   ├── admin.html                  # 管理者画面
│   ├── css/style.css
│   └── js/
│       ├── login.js
│       ├── staff.js
│       └── admin.js
└── api/                            # ★ お名前.com に手動配置
    ├── .htaccess                   # CORS + URL リライト
    ├── config.php                  # DB 接続
    └── tables/
        ├── users.php / users_update.php
        ├── shifts.php / shifts_update.php           # 互換用、現状は未使用
        ├── shift_requests.php
        ├── shift_requests_update.php
        └── shift_requests_approve.php
```

---

## デプロイ方法

### フロントエンド（kaden-shift/ 配下）
```bash
git add <変更ファイル>
git commit -m "コミットメッセージ"
git push origin main
```
push 後、数分で Vercel が自動デプロイ。ブラウザでは `Ctrl+F5` で強制リロードして確認。

### API（api/ 配下）
GitHub と自動連携していないので **手動アップロード** が必要:

1. お名前.com の **ファイルマネージャー** にログイン
2. `public_html/api/` 配下に該当ファイルをアップロード（または編集ボタンから直接編集）
3. パーミッション: ファイルは `644`、ディレクトリは `755`

`.htaccess` を編集するときは、まず `.htaccess.backup` を別名で残しておくと安全です。

---

## 運用上の注意点（トラブル時のチェックリスト）

過去に発生した障害ベースの注意点です。

### 「データが読み込めない」「CORS エラー」「500/403 Internal Server Error」
- 8〜9割は **お名前.com 側の `api/.htaccess` が原因**。リポジトリの `api/.htaccess` と本番が一致しているか確認
- 特に **リライトルールに `RewriteCond %{REQUEST_FILENAME} !-f / !-d` が無いと PHP がループして 500** になる
- HTTP Referer ベースの制限を入れると、ブラウザの `fetch()` の Referer 送信ポリシー次第でブロックされる。Origin (CORS) ベースで制御すること

### 「古い月のデータが見えない」
- フロントの fetch URL に `?limit=10000` が付いているか確認(`admin.js`, `staff.js`)
- `limit` が小さいとデータ件数を超えた古いデータが切り捨てられる(ORDER BY date DESC)

### 「カレンダーから編集できない」
- 承認済みシフトのクリック先は `openMgmtModal('request', id)` を呼ぶこと(`openRequestDetail`)
- 単なる alert 表示にしてはいけない

### PHP の 500 エラー
- お名前.com のコントロールパネルで PHP バージョンを確認
- `api/config.php` の DB 接続情報が正しいか確認
- エラーログ: お名前.com Navi → サーバー設定 → エラーログ閲覧

---

## API エンドポイント

| メソッド | URL | 用途 |
|---------|-----|------|
| GET | `/api/tables/users?limit=10000` | ユーザー一覧 |
| GET | `/api/tables/users/{id}` | 単一ユーザー |
| POST | `/api/tables/users` | ユーザー作成 |
| POST | `/api/tables/users_update.php` | ユーザー更新 (id を body に含める) |
| POST | `/api/tables/users_update/delete/{id}` | ユーザー削除 |
| GET | `/api/tables/shift_requests?limit=10000` | 希望シフト一覧 |
| GET | `/api/tables/shift_requests/{id}` | 単一希望シフト |
| POST | `/api/tables/shift_requests` | 希望シフト作成 |
| POST | `/api/tables/shift_requests_update.php` | 希望シフト更新 |
| POST | `/api/tables/shift_requests_update/delete/{id}` | 希望シフト削除 |
| POST | `/api/tables/shift_requests_approve.php` | 承認/承認取消 |

> お名前.com サーバーの仕様で PUT/PATCH/DELETE が使えないため、すべて POST + 専用エンドポイントで処理しています。

---

## 既知の制約

- **パスワードは平文保存**。社内利用前提なので許容しているが、運用上注意
- **リアルタイム更新なし**。データが更新されたらユーザーが「更新」ボタンを押すか F5
- **シフト時間は 9:00〜18:00 の 15 分刻み**（営業時間に合わせている）
- **土日は休業日**として表示・選択不可
- データ件数が 10000 を超えると古いデータが見えなくなる(現在 ~500 件なので当面問題なし)

---

## 開発の進め方（他の管理者向け）

1. このリポジトリを git clone
2. ブラウザで `kaden-shift/admin.html` などをローカルで開いて確認(API は本番を叩く)
3. 修正したら commit & push
4. API 側を直すなら、お名前.com のファイルマネージャーで該当ファイルを直接編集
5. 動作確認は本番 URL で(ローカルからは CORS 設定上 OK)

### コーディング規約
- フレームワークなし(素の HTML/CSS/JS)。ライブラリも追加していない
- 状態管理は admin.js / staff.js 内のグローバル変数 + キャッシュ機構
- スタイルは `kaden-shift/css/style.css` に集約

---

## 連絡

不明点や本番障害があれば、リポジトリ管理者(`test-hitokiwa`)に連絡してください。
