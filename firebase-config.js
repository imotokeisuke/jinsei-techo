// ==========================================================
// Firebase 設定ファイル
// jinsei-techo プロジェクトの設定値を反映済みです（Realtime Database使用）。
// ==========================================================

export const firebaseConfig = {
  apiKey: "AIzaSyDuHyxIGG8W_vYwHKgOi9AYkoNb_VBXIqA",
  authDomain: "jinsei-techo.firebaseapp.com",
  databaseURL: "https://jinsei-techo-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jinsei-techo",
  storageBucket: "jinsei-techo.firebasestorage.app",
  messagingSenderId: "132833688976",
  appId: "1:132833688976:web:462c0bc46fea4ed9adc715"
};

// 他のアプリ（計画の要点帳など）と同じFirebaseプロジェクトを使い回す場合は、
// パス名が衝突しないよう app.js 側の COLLECTION_PREFIX で名前空間を分けています。
export const COLLECTION_PREFIX = "jinseiTecho_";
