// 必要なライブラリをインポートします
const express = require('express');
const { Client } = require('@notionhq/client');
const axios = require('axios');
const vm = require('vm');
require('dotenv').config(); // .envファイルから環境変数を読み込む
const path = require('path');

// --- アプリケーションの基本設定 ---
const app = express();
const PORT = process.env.PORT || 3000; // Render.comが自動で設定するポートを使用

// --- ミドルウェアの設定 ---
app.use(express.json()); // JSON形式のリクエストを解析できるようにする
app.use(express.static(path.join(__dirname, 'public'))); // publicフォルダを静的ファイルの配信に使う

// --- APIエンドポイントの定義 ---
// フロントエンドからのリクエストを受け付ける窓口
app.post('/api/sync', async (req, res) => {
  // リクエストからAPIキー、データベースID、キャラクターIDを取得
  const { notionApiKey, databaseId, characterId } = req.body;

  // 必要な情報が揃っているかチェック
  if (!notionApiKey || !databaseId || !characterId) {
    return res.status(400).json({ message: 'APIキー、データベースID、キャラクターIDは必須です。' });
  }

  // Notionクライアントの初期化（リクエストごとにキーを設定）
  const notion = new Client({ auth: notionApiKey });
  const numericCharacterId = parseInt(characterId, 10);
  if (isNaN(numericCharacterId)) {
    return res.status(400).json({ message: 'キャラクターIDは数値で指定してください。' });
  }

  try {
    // キャラクター保管所からJSデータを取得
    const charaJsText = await getCharaSheetData(numericCharacterId);
    // 取得したJSデータをパースしてオブジェクトとして受け取る
    const pcData = parseCharaJsToJson(charaJsText);

    // ※ここから、pcDataをnotionAPIを活用してデータベースに整形・上書き保存する処理を実装してください。
    // 例:
    // await updateNotionDatabase(notion, databaseId, pcData);

    return res.status(200).json({ message: '同期が成功しました。' });
  } catch (error) {
    return res.status(500).json({ message: 'エラーが発生しました: ' + error.message });
  }
});

// --- キャラクターデータ取得用関数 ---
async function getCharaSheetData(id) {
  const url = `https://charasheet.vampire-blood.net/${id}.js`;
  try {
    const response = await axios.get(url, { responseType: 'text' });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`キャラクター保管所でID ${id} のデータが見つかりませんでした。`);
    }
    throw error;
  }
}

// --- JavaScript形式のデータをパースする関数 ---
// ※ 取得したデータが単なるオブジェクトリテラルの場合、評価用に "pc = " を付与しています
function parseCharaJsToJson(jsText) {
  const sandbox = {};
  vm.createContext(sandbox);

  try {
    // jsText がオブジェクトリテラルの場合にも対応するため、先頭に "pc = " を付与します
    const script = new vm.Script(`pc = ${jsText}`);
    script.runInContext(sandbox);
  } catch (e) {
    throw new Error('キャラクターJSのパース中にエラー: ' + e.message);
  }

  if (!sandbox.pc) {
    throw new Error('キャラクターJSファイルから "pc" オブジェクトが見つかりません。');
  }

  return sandbox.pc;
}

// --- Notionデータベース更新用関数（例）---
// function updateNotionDatabase(notion, databaseId, pcData) {
//   // ここでpcDataをNotionデータベースの項目に整形して上書き保存する処理を実装します
// }

// --- サーバー起動 ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
