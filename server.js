// 必要なライブラリをインポートします
const express = require('express');
const { Client } = require('@notionhq/client');
const axios = require('axios');
const vm = require('vm');
require('dotenv').config();
const path = require('path');

// --- アプリケーションの基本設定 ---
const app = express();
const PORT = process.env.PORT || 3000;

// --- ミドルウェアの設定 ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- APIエンドポイントの定義 ---
app.post('/api/sync', async (req, res) => {
  const { notionApiKey, databaseId, characterId } = req.body;

  if (!notionApiKey || !databaseId || !characterId) {
    return res.status(400).json({ message: 'APIキー、データベースID、キャラクターIDは必須です。' });
  }

  const notion = new Client({ auth: notionApiKey });
  const numericCharacterId = parseInt(characterId, 10);
  if (isNaN(numericCharacterId)) {
    return res.status(400).json({ message: 'キャラクターIDは数値で指定してください。' });
  }

  try {
    const charaJsText = await getCharaSheetData(numericCharacterId);
    const pcData = parseCharaJsToJson(charaJsText);
    await updateNotionDatabase(notion, databaseId, pcData);
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
function parseCharaJsToJson(jsText) {
  const sandbox = {};
  vm.createContext(sandbox);
  try {
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

// --- Notionデータベース更新用関数 ---
async function updateNotionDatabase(notion, databaseId, pcData) {
  const existingPages = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'ID',
      number: {
        equals: pcData.id,
      },
    },
  });

  const properties = {
    'ID': { number: pcData.id },
    '職業': { rich_text: [{ text: { content: pcData.job || '' } }] },
    '性別': { select: { name: pcData.gender || '不明' } },
    '年齢': { number: parseInt(pcData.age) || 0 },
    '身長': { number: parseInt(pcData.height) || 0 },
    '体重': { number: parseInt(pcData.weight) || 0 },
    '出身地': { select: { name: pcData.birthplace || '不明' } },
    '髪色': { select: { name: pcData.hair_color || '不明' } },
    '瞳色': { select: { name: pcData.eye_color || '不明' } },
    '肌色': { select: { name: pcData.skin_color || '不明' } },
    'STR': { select: { name: String(pcData.st) } },
    'CON': { select: { name: String(pcData.co) } },
    'POW': { select: { name: String(pcData.po) } },
    'DEX': { select: { name: String(pcData.dx) } },
    'APP': { select: { name: String(pcData.ap) } },
    'SIZ': { select: { name: String(pcData.si) } },
    'INT': { select: { name: String(pcData.in) } },
    'EDU': { select: { name: String(pcData.ed) } },
    'SAN値': { select: { name: String(pcData.san) } },
    'アイデア': { select: { name: String(pcData.idea) } },
    '幸運': { select: { name: String(pcData.luck) } },
    '知識': { select: { name: String(pcData.know) } },
    'メモ欄': { rich_text: [{ text: { content: pcData.memo || '' } }] },
    'チャットパレット': { rich_text: [{ text: { content: pcData.chat_palette || '' } }] },
  };

  if (existingPages.results.length > 0) {
    const pageId = existingPages.results[0].id;
    await notion.pages.update({
      page_id: pageId,
      properties,
    });
  } else {
    await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        '名前': { title: [{ text: { content: pcData.name || '未設定' } }] },
        ...properties,
      },
    });
  }
}

// --- サーバー起動 ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
