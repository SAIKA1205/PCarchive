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

    //pcDataをnotionAPIを活用してデータベースに整形・上書き保存する
	await updateNotionDatabase(notion, databaseId, pcData, characterId);


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

async function updateNotionDatabase(notion, databaseId, pcData, characterId) {
  // Notion上でIDが一致するページを探す
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'ID',
      number: {
        equals: parseInt(characterId, 10),
      },
    },
  });

  const pageId = response.results[0]?.id;

  // チャットパレット生成
  const chatPalette = Object.entries(pcData.status || {})
    .map(([key, val]) => {
      if (typeof val === 'number') {
        return `CCB<=${val} 【${key}】`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n');

function extractNumber(str) {
  if (!str) return null;
  const match = String(str).match(/\d+/); // 連続する数字だけ抽出
  return match ? Number(match[0]) : null;
}

function filterSpoiler(text) {
  const spoilerKeyword = '※※※　以下、ネタバレ有　※※※';
  const index = text.indexOf(spoilerKeyword);
  if (index !== -1) {
    return text.slice(0, index).trim(); // ネタバレ部分を削除
  }
  return text; // キーワードがなければそのまま返す
}

  const properties = {
    職業: { rich_text: [{ text: { content: pcData.shuzoku || '' } }] },
    性別: { select: pcData.sex? { name: pcData.sex } : null },
    年齢: { number: extractNumber(pcData.age) },
    身長: { number: extractNumber(pcData.pc_height) },
    体重: { number: extractNumber(pcData.pc_weight) },
    出身地: { select: pcData.pc_kigen? { name: pcData.pc_kigen } : null },
    髪色: { select: pcData.color_hair? { name: pcData.color_hair } : null },
    瞳色: { select: pcData.color_eye? { name: pcData.color_eye } : null },
    肌色: { select: pcData.color_skin? { name: pcData.color_skin } : null },
    STR: { select: pcData.NP1? { name: String(pcData.NP1) } : null },
    CON: { select: pcData.NP2? { name: String(pcData.NP2) } : null },
    POW: { select: pcData.NP3? { name: String(pcData.NP3) } : null },
    DEX: { select: pcData.NP4? { name: String(pcData.NP4) } : null },
    APP: { select: pcData.NP5? { name: String(pcData.NP5) } : null },
    SIZ: { select: pcData.NP6? { name: String(pcData.NP6) } : null },
    INT: { select: pcData.NP7? { name: String(pcData.NP7) } : null },
    EDU: { select: pcData.NP8? { name: String(pcData.NP8) } : null },
    SAN値: { number: Number(pcData.SAN_Left) || null },
    アイデア: { number: Number(pcData.NP12) || null },
    幸運: { number: Number(pcData.NP13) || null },
    知識: { number: Number(pcData.NP14) || null },
    メモ欄: { rich_text: [{ text: { content: filterSpoiler(pcData.memo || ''),},}],},
    チャットパレット: { rich_text: [{ text: { content: chatPalette } }] },
    ID: { number: parseInt(characterId, 10) },
  };
  console.log('📝 Notionに送信するデータ:');
  console.dir(properties, { depth: null });

  if (pageId) {
    // 上書き
    await notion.pages.update({
      page_id: pageId,
      properties,
    });
  } else {
    // 新規作成
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        名前: { title: [{ text: { content: pcData.name || `キャラID: ${characterId}` } }] },
        ...properties,
      },
    });
  }
}
