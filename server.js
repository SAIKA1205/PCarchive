require('dotenv').config(); // .envファイルから環境変数を読み込む
const express = require('express');
const fetch = require('node-fetch');
const { Client } = require('@notionhq/client');

const app = express();
const port = process.env.PORT || 3000; // render.comがPORT環境変数を設定してくれる

// Notionクライアントの初期化
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CHARACTER_API_BASE_URL = process.env.CHARACTER_API_BASE_URL || 'https://example.com/api/char/'; // 末尾にスラッシュ

// ミドルウェア
app.use(express.json()); // JSONリクエストボディをパースする
app.use(express.static('public')); // 静的ファイル(HTML, JS, CSS)を提供

// --- Notionヘルパー関数 ---

// Notionデータベースのプロパティとキャラクターデータのマッピングを定義
// 注意: Notionのプロパティ名と型に合わせてください。
//       キャラクター保管所からのJSONデータの構造に合わせて調整が必要です。
function mapDataToNotionProperties(charData) {
    // キャラクター保管所から取得したJSONデータの構造を仮定しています。
    // 実際のデータ構造に合わせて、以下のアクセス方法を調整してください。
    const status = charData.status || {};
    const skills = charData.skills || {};
    const combatGear = charData.combat_gear || {};
    const inventory = charData.inventory || {};

    // テキスト型プロパティに格納する整形済み文字列の作成例
    const formatSkills = (skillCategory) => {
        if (!skills[skillCategory] || !Array.isArray(skills[skillCategory])) return "";
        return skills[skillCategory].map(s => `${s.name}: ${s.value}`).join('\n');
    };

    const formatCombatGear = () => {
        let text = "武器:\n";
        if (combatGear.weapons && Array.isArray(combatGear.weapons)) {
            text += combatGear.weapons.map(w => `- ${w.name} (${w.damage || ''})`).join('\n');
        } else {
            text += "なし\n";
        }
        text += "\n防具:\n";
        if (combatGear.armors && Array.isArray(combatGear.armors)) {
            text += combatGear.armors.map(a => `- ${a.name} (防御点: ${a.points || ''})`).join('\n');
        } else {
            text += "なし\n";
        }
        return text;
    };

    const formatInventory = () => {
        let text = "所持品:\n";
        if (inventory.items && Array.isArray(inventory.items)) {
            text += inventory.items.map(item => `- ${item}`).join('\n');
        } else {
            text += "なし\n";
        }
        text += `\n所持金: ${inventory.money || '不明'}`;
        return text;
    };

    return {
        'CharacterID': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: String(charData.id) } }] },
        'キャラクター名': { type: 'title', title: [{ type: 'text', text: { content: charData.name || '無名' } }] },
        'STR': { type: 'number', number: status.STR || null },
        'CON': { type: 'number', number: status.CON || null },
        'DEX': { type: 'number', number: status.DEX || null },
        'APP': { type: 'number', number: status.APP || null },
        'SIZ': { type: 'number', number: status.SIZ || null },
        'INT': { type: 'number', number: status.INT || null },
        'EDU': { type: 'number', number: status.EDU || null },
        'HP': { type: 'number', number: status.HP || null },
        'MP': { type: 'number', number: status.MP || null },
        'アイデア': { type: 'number', number: status.Idea || status.idea || null }, // プロパティ名の揺れに対応 (例)
        '幸運': { type: 'number', number: status.Luck || status.luck || null },
        '知識': { type: 'number', number: status.Knowledge || status.knowledge || null },
        '現在SAN値': { type: 'number', number: status.SAN_current || status.san_current || null },
        '戦闘技能': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatSkills('combat') } }] },
        '探索技能': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatSkills('search') } }] },
        '行動技能': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatSkills('action') } }] },
        '交渉技能': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatSkills('negotiation') } }] },
        '知識技能': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatSkills('knowledge_skills') } }] }, // JSON内のキーと合わせる
        '戦闘・武器・防具': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatCombatGear() } }] },
        '所持品・所持金': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: formatInventory() } }] },
        'その他メモ': { type: 'rich_text', rich_text: [{ type: 'text', text: { content: charData.memo || '' } }] },
    };
}

// CharacterIDでNotionデータベースを検索し、ページIDを返す
async function findNotionPageByCharacterId(characterId) {
    try {
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                property: 'CharacterID', // Notionデータベースのプロパティ名
                rich_text: {
                    equals: String(characterId),
                },
            },
        });
        if (response.results.length > 0) {
            return response.results[0].id; // 既存ページのID
        }
        return null; // ページが見つからない
    } catch (error) {
        console.error('Error querying Notion database:', error);
        throw new Error('Notionデータベースの検索に失敗しました。');
    }
}

// --- APIエンドポイント ---
app.post('/api/sync-character', async (req, res) => {
    const { characterId } = req.body;

    if (!characterId) {
        return res.status(400).json({ message: 'キャラクターIDが必要です。' });
    }

    if (!DATABASE_ID || !process.env.NOTION_API_KEY) {
        console.error('Notion APIキーまたはデータベースIDが設定されていません。');
        return res.status(500).json({ message: 'サーバー設定エラーです。管理者に連絡してください。' });
    }

    try {
        // 1. キャラクター保管所からJSONデータを取得
        //    実際のAPIエンドポイントURLに置き換えてください。
        const charApiUrl = `${CHARACTER_API_BASE_URL}${characterId}.json`; // .json 拡張子が必要な場合など、適宜調整
        console.log(`Workspaceing data from: ${charApiUrl}`);
        const charResponse = await fetch(charApiUrl);

        if (!charResponse.ok) {
            if (charResponse.status === 404) {
                throw new Error(`キャラクター保管所でID '${characterId}' のデータが見つかりませんでした。`);
            }
            throw new Error(`キャラクター保管所からのデータ取得に失敗しました。ステータス: ${charResponse.status}`);
        }
        const charData = await charResponse.json();

        // 取得データ例 (デバッグ用)
        // console.log('Character Data:', JSON.stringify(charData, null, 2));

        if (!charData || !charData.id) { // charData.id はJSON内のキャラクターIDを示すキーと仮定
             throw new Error('キャラクター保管所から取得したデータの形式が正しくありません (IDが含まれていません)。');
        }


        // 2. Notionデータベースで既存データを検索
        const pageId = await findNotionPageByCharacterId(charData.id); // charData.id を使う

        const notionProperties = mapDataToNotionProperties(charData);

        if (pageId) {
            // 3a. 既存データがあれば更新
            await notion.pages.update({
                page_id: pageId,
                properties: notionProperties,
            });
            res.json({ message: 'キャラクターデータをNotionで更新しました。', pageId: pageId });
        } else {
            // 3b. 既存データがなければ新規作成
            const newPage = await notion.pages.create({
                parent: { database_id: DATABASE_ID },
                properties: notionProperties,
            });
            res.json({ message: 'キャラクターデータをNotionに新規登録しました。', pageId: newPage.id });
        }
    } catch (error) {
        console.error('Error in /api/sync-character:', error);
        res.status(500).json({ message: error.message || 'サーバー内部エラーが発生しました。' });
    }
});

// ルートパスへのGETリクエストでindex.htmlを返す
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});



/**
 * Notionデータベースからすべてのキャラクター一覧を取得します。
 * ページネーションを処理し、すべての結果を収集します。
 */
async function getAllCharactersFromNotion() {
    let allCharacters =;
    let hasMore = true;
    let nextCursor = undefined;

    try {
        while (hasMore) {
            const response = await notion.databases.query({
                database_id: databaseId,
                start_cursor: nextCursor, // 次のページから結果を取得するために使用
            });

            allCharacters = allCharacters.concat(response.results); // 現在のページの結果を追加
            hasMore = response.has_more; // 次のページがあるか確認
            nextCursor = response.next_cursor; // 次のページの開始カーソルを取得

            // Notion APIのレート制限に配慮し、短い遅延を入れることを検討してください（例: 100ms）。
            // await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`Notionデータベースから ${allCharacters.length} 件のキャラクターを取得しました。`);
        return allCharacters;
    } catch (error) {
        console.error('Notionデータベースからのキャラクター取得エラー:', error);
        throw error;
    }
}

// 関数を実行してキャラクター一覧を取得します。
getAllCharactersFromNotion()
   .then(characters => {
        // 取得したキャラクターデータを処理します。
        // 例: 各キャラクターのタイトル（名前）を表示
        characters.forEach(character => {
            const characterName = character.properties?.title?.plain_text;
            console.log(`キャラクター名: ${characterName |
| '不明'}`);
            // 必要に応じて他のプロパティも表示できます。
            // console.log(character.properties);
        });
    })
   .catch(error => {
        console.error('キャラクター一覧の取得中にエラーが発生しました:', error);
    });
