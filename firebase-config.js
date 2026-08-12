// ==========================================================
// Firebase 設定ファイル
// ここに、あなた自身の Firebase プロジェクトの設定値を入力してください。
//
// 取得方法：
// 1. https://console.firebase.google.com/ でプロジェクトを作成（無料のSparkプランでOK）
// 2. 「Firestore Database」を作成（本番環境モードでOK。ルールは下記README参照）
// 3. 「プロジェクトの設定」→「マイアプリ」→ ウェブアプリを追加 → 表示される設定値を下にコピー
//
// 機種変をしても記録を残すため、このFirebaseプロジェクトがデータの保管場所になります。
// ==========================================================

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 他のアプリ（計画の要点帳など）と同じFirebaseプロジェクトを使い回す場合は、
// コレクション名が衝突しないよう app.js 側の COLLECTION_PREFIX で名前空間を分けています。
export const COLLECTION_PREFIX = "jinseiTecho_";
