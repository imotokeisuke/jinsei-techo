# 人生手帳（jinsei-techo）

日々の日記と、人生で大事にしたい学びや思考を記録するための、あなた専用のiPhone向けPWAです。

- 📔 日記：毎日の記録（日付・タイトル・本文・#カテゴリー）
- 📖 人生手帳：大事な学びや思考を「大カテゴリー／小カテゴリー」で整理。同じ項目に追記していくことで、考えの変遷がタイムラインで見える
- 🕸 マイライフ：人生手帳の記録をもとにしたマインドマップ（自分→大カテゴリー→小カテゴリー）
- 🌳 育つ木：日記を書くたびに木が育つ（たね→ふたば→若木→花咲く木→オレンジが実る木）
- 🍃 足あとカレンダー：日記を書いた日にオレンジの葉っぱスタンプが押される

すべての記録はFirebase（Firestore）に保存されるので、機種変してもデータは消えません。ローカルキャッシュも併用しているので、起動は一瞬です。

---

## 1. Firebaseのセットアップ（データを機種変後も残すために必須）

1. [Firebase Console](https://console.firebase.google.com/) にアクセスし、新しいプロジェクトを作成（無料のSparkプランでOK）
2. 左メニューの「構築」→「Firestore Database」→「データベースの作成」
   - ロケーションはお好みで（例：`asia-northeast1` 東京）
   - 「本番環境モードで開始」を選択
3. 「プロジェクトの設定」（歯車アイコン）→「マイアプリ」→ 「</>」（ウェブアプリを追加）
   - アプリ名は何でもOK（例：人生手帳）
   - 表示された `firebaseConfig` の値をコピー
4. このリポジトリの `firebase-config.js` を開き、`YOUR_API_KEY` などのプレースホルダーを実際の値に書き換えて保存

5. Firestoreの「ルール」タブを開き、以下に置き換えてください（自分専用アプリのため、シンプルに全許可にしていますが、他人に推測されにくいプロジェクトIDやAPIキーの取り扱いにはご注意ください）：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ 上記ルールは「URLとFirebase設定を知っていれば誰でも読み書きできる」状態です。個人利用でリスクを抑えたい場合は、Firebase Authentication（匿名認証など）を追加し、ルールを `allow read, write: if request.auth != null;` に変更することをおすすめします。ご希望であれば認証付きの構成に変更するお手伝いもできます。

---

## 2. GitHubへのアップロード手順

### 方法A：GitHubのWeb画面からアップロード（コマンド操作なしでOK）

1. [github.com](https://github.com) にログインし、右上の「+」→「New repository」
2. Repository name に `jinsei-techo` と入力し、「Public」を選択して「Create repository」
3. 作成後の画面で「uploading an existing file」をクリック
4. このzip内のファイル・フォルダ（`index.html`, `style.css`, `app.js`, `firebase-config.js`, `manifest.json`, `sw.js`, `icons/`フォルダ一式）を全てドラッグ＆ドロップ
5. 「Commit changes」をクリック

### 方法B：ターミナルを使う場合

```bash
cd jinsei-techo
git init
git add .
git commit -m "人生手帳 初回コミット"
git branch -M main
git remote add origin https://github.com/【あなたのユーザー名】/jinsei-techo.git
git push -u origin main
```

---

## 3. GitHub Pagesで公開する

1. アップロードしたリポジトリの「Settings」タブを開く
2. 左メニューの「Pages」を選択
3. 「Build and deployment」の「Source」を **Deploy from a branch** に設定
4. 「Branch」を `main` / `/ (root)` にして「Save」
5. 数分待つと、`https://【あなたのユーザー名】.github.io/jinsei-techo/` でアクセスできるようになります

---

## 4. iPhoneでホーム画面に追加する

1. iPhoneのSafariで上記URLを開く
2. 共有ボタン（□に↑）をタップ
3. 「ホーム画面に追加」を選択

これでアイコンをタップするだけでアプリのように起動できます。

---

## 5. 他のアプリ（計画の要点帳など）と同じFirebaseプロジェクトを使い回す場合

`firebase-config.js` 内の `COLLECTION_PREFIX`（既定値: `jinseiTecho_`）により、Firestore内のコレクション名を分離しています。同じFirebaseプロジェクトを複数アプリで共有しても、データが混ざることはありません。

---

## ファイル構成

```
jinsei-techo/
├── index.html          # アプリ本体（3タブ構成のシェル）
├── style.css            # デザイン（柔らかいパステルオレンジ基調）
├── app.js                # ロジック（状態管理・Firebase同期・各タブ描画）
├── firebase-config.js    # ★ここに自分のFirebase設定を入力する
├── manifest.json         # PWAマニフェスト
├── sw.js                  # サービスワーカー（オフライン対応・起動高速化）
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
└── README.md
```

## 今後カスタマイズしたい場合

- 育つ木の成長段階のしきい値：`app.js` の `getTreeStage()` 関数
- マインドマップの配色・配置：`app.js` の `renderMyLifeTab()` 関数
- カラーやフォント：`style.css` 冒頭の `:root` 内のCSS変数

---

## 更新履歴（追加機能）

- 設定画面（右上の歯車アイコン）を追加
  - **Firebase接続**：`firebase-config.js` を直接編集しなくても、Firebaseコンソールからコピーした設定をアプリ内に貼り付けて保存できます（保存後、自動的に再読み込みされます）
  - **カテゴリー管理**：「人生手帳」と「エピソード」で共通の大カテゴリー／小カテゴリーを、追加・名前変更・削除できます
- 人生手帳：詳細画面に「編集」ボタンを追加（タイトル・カテゴリー・過去の記録内容や日付の修正、記録の削除ができます）。「今の思考を追記」とは別の機能です
- 新しいタブ「エピソード」を追加：人生の中で語りたい出来事を記録します。日付は「年月日」または「年のみ」（例：2006年のような昔の出来事向け）を選べます
- 詳細画面の表示幅の不具合を修正（画面右側に偏っていた問題を解消）
- Service Workerを更新（stale-while-revalidate方式）：ファイルを更新した際に、古いキャッシュが残り続けにくくなりました

## 更新履歴（2回目の追加機能）

- カテゴリー（大・小）を削除／名称変更した際に、マイライフのマインドマップにも即座に反映されるようになりました（開いたままの画面でも自動更新されます）
- 人生手帳に「言語化分類」を追加しました
  - 大カテゴリーとは別軸のタグで、1件の記録に複数設定できます（初期値：思考／性格。設定画面から追加・名前変更・削除が可能）
  - マインドマップには表示されず、人生手帳タブ内での絞り込み専用です。大カテゴリー・小カテゴリーと組み合わせて絞り込めます
  - 設定（歯車アイコン）→「言語化分類」タブで管理できます

## 更新履歴（接続用URL）

- 設定 →「Firebase接続」画面に「接続用URL」を追加しました
  - 1台目でFirebaseの設定（コンソールのfirebaseConfig）を貼り付けて接続すると、自動的に「接続用URL」（1行）が生成され、コピーできます
  - 2台目以降の端末では、この接続用URLを設定画面の入力欄に貼り付けるだけで、同じFirebaseプロジェクトに接続できます（コンソールのコード全体を貼る必要はありません）
  - 引き続き、firebaseConfigのコード全体を貼り付ける方法もそのまま使えます（自動で判別されます）

## 更新履歴（Realtime Databaseへ切り替え）

データの保存先を Cloud Firestore から **Firebase Realtime Database** に変更しました。

### セットアップの変更点

- Firestoreの「データベースの作成」は不要になりました
- 代わりに、Firebaseコンソール →「Realtime Database」→「データベースを作成」を行ってください
- ルールは以下のJSON形式に置き換えてください（同梱の `database.rules.json` の中身と同じです）：

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

- `firebase-config.js` に `databaseURL`（例：`https://jinsei-techo-default-rtdb.asia-southeast1.firebasedatabase.app`）が追加で必要です。Firebaseコンソールの設定画面、またはRealtime Databaseのトップ画面に表示されているURLをコピーしてください
- アプリ内の「設定 → Firebase接続」画面での貼り付け・接続用URLの仕組みも、databaseURLを含めて引き続き使えます

## 更新履歴（日記カテゴリーの編集・削除）

- 設定 →「カテゴリー管理」画面に「日記のカテゴリー」セクションを追加しました
  - 日記タブで使うカテゴリー（人生手帳・エピソードとは別）を、追加・名前変更・削除できます
  - 名前を変更／削除すると、既存の日記に付いているタグも自動的に追従します
