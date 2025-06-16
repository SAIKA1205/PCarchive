// 必要なライブラリをインポートします
const express = require('express');
const { Client } = require('@notionhq/client');
const axios = require('axios');
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

  try {
    // 1. キャラクター保管所からデータを取得
    console.log(`キャラクター保管所からデータを取得中... (ID: ${characterId})`);
    const charaDataText = await getCharaSheetData(characterId);

    // 取得したJavaScriptコードからJSONオブジェクトを安全に抽出してパース
    const charaData = JSON.parse(charaDataText);
    console.log('データの取得と解析に成功しました。');

    // 2. Notionデータベースを検索して、該当キャラクターIDのページが既に存在するか確認
    console.log(`Notionデータベースを検索中... (DB ID: ${databaseId}, キャラクターID: ${numericCharacterId})`);
    const existingPage = await findNotionPageByCharacterId(notion, databaseId, numericCharacterId);

    // 3. 取得したデータをNotionの形式にマッピング（整形）
    console.log('データをNotionの形式にマッピング中...');
    const notionProperties = mapDataToNotionProperties(charaData, numericCharacterId);

    let resultPage;
    // 4. ページが存在すれば更新、存在しなければ新規作成
    if (existingPage) {
      console.log(`ページが見つかりました (Page ID: ${existingPage.id})。ページを更新します。`);
      resultPage = await notion.pages.update({
        page_id: existingPage.id,
        properties: notionProperties,
      });
      res.json({ message: `キャラクター「${charaData.pc_name}」のデータを更新しました。`, url: resultPage.url });
    } else {
      console.log('ページが見つかりません。新規作成します。');
      resultPage = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: notionProperties,
      });
      res.json({ message: `キャラクター「${charaData.pc_name}」のデータを新規作成しました。`, url: resultPage.url });
    }
    console.log('処理が正常に完了しました。');

  } catch (error) {
    console.error('エラーが発生しました:', error.response ? error.response.data : error.message);
    // Notion APIからのエラーを分かりやすく表示する
    if (error.code === 'unauthorized') {
        return res.status(401).json({ message: 'Notion APIキーが無効です。正しいキーを入力してください。' });
    }
    if (error.code === 'object_not_found') {
        return res.status(404).json({ message: '指定されたデータベースIDが見つかりません。IDが正しいか、インテグレーションがデータベースに招待されているか確認してください。'});
    }
    res.status(500).json({ message: `エラーが発生しました: ${error.message}` });
  }
});

// --- サーバーの起動 ---
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました。 http://localhost:${PORT}`);
});

async function getCharaSheetData(id) {
  const url = `https://charasheet.vampire-blood.net/${id}.js`;
  try {
    const response = await axios.get(url, { responseType: 'text' });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`キャラクター保管所でID ${id} のデータが見つかりませんでした。`);
    }
    throw new Error('キャラクター保管所からのデータ取得に失敗しました。');
  }
}

async function findNotionPageByCharacterId(notion, databaseId, characterId) {
  const response = await notion.databases.query({
    database_id: databaseId,
    filter: {
      property: 'ID',
      number: { equals: characterId },
    },
  });
  return response.results.length > 0 ? response.results[0] : null;
}

function mapDataToNotionProperties(data, characterId) {
  const chatPaletteContent = (data.ar2 && Array.isArray(data.ar2))
    ? data.ar2.map(skill => `CCB<=${skill[2]} 【${skill[0]}】`).join('\n')
    : '';

  // 各プロパティをNotionの形式に合わせて定義
  const properties = {
    '名前': { title: [{ text: { content: data.pc_name || '名称未設定' } }] },
    'ID': { number: characterId },
    '職業': { rich_text: [{ text: { content: data.shuzoku || '' } }] },
    '性別': data.sex ? { select: { name: data.sex } } : undefined,
    '年齢': data.age ? { number: parseInt(data.age, 10) || null } : undefined,
    '身長': data.height ? { number: parseInt(data.height, 10) || null } : undefined,
    '体重': data.weight ? { number: parseInt(data.weight, 10) || null } : undefined,
    '出身地': data.syussin ? { select: { name: data.syussin } } : undefined,
    '髪色': data.hair_color ? { select: { name: data.hair_color } } : undefined,
    '瞳色': data.eye_color ? { select: { name: data.eye_color } } : undefined,
    '肌色': data.skin_color ? { select: { name: data.skin_color } } : undefined,
    'STR': data.STR ? { select: { name: String(data.STR) } } : undefined,
    'CON': data.CON ? { select: { name: String(data.CON) } } : undefined,
    'POW': data.POW ? { select: { name: String(data.POW) } } : undefined,
    'DEX': data.DEX ? { select: { name: String(data.DEX) } } : undefined,
    'APP': data.APP ? { select: { name: String(data.APP) } } : undefined,
    'SIZ': data.SIZ ? { select: { name: String(data.SIZ) } } : undefined,
    'INT': data.INT ? { select: { name: String(data.INT) } } : undefined,
    'EDU': data.EDU ? { select: { name: String(data.EDU) } } : undefined,
    'SAN値': data.SAN ? { select: { name: String(data.SAN) } } : undefined,
    'アイデア': data.idea ? { select: { name: String(data.idea) } } : undefined,
    '幸運': data.kouun ? { select: { name: String(data.kouun) } } : undefined,
    '知識': data.chishiki ? { select: { name: String(data.chishiki) } } : undefined,
    'メモ欄': { rich_text: [{ text: { content: data.memo || '' } }] },
    'チャットパレット': { rich_text: [{ text: { content: chatPaletteContent } }] },
  };

  // 値がundefinedのプロパティを削除（空の値をAPIに送らないため）
  Object.keys(properties).forEach(key => {
    if (properties[key] === undefined) {
      delete properties[key];
    }
  });

  return properties;
}
