///// キャラクターデータの取得 /////
///// キャラクターIDの取得 /////
const updateButton = document.getElementById('updateButton');
const characterIdsInput = document.getElementById('characterIds');
const statusDiv = document.getElementById('status');

updateButton.addEventListener('click', async () => {
    const idsString = characterIdsInput.value;
    const characterIds = idsString.split(',');
    statusDiv.textContent = '更新処理を開始します...';

    for (const id of characterIds) {
        const trimmedId = id.trim();
        if (trimmedId) {
            await fetchCharacterData(trimmedId);
        }
    }
    statusDiv.textContent = '更新処理が完了しました。';
});

///// URLの構築 /////
const baseUrl = 'http://charasheet.vampire-blood.net/';

function constructUrl(characterId) {
    return `${baseUrl}${characterId}.js`;
}


/////  fetch APIの使用 /////
async function fetchCharacterData(characterId) {
    const url = constructUrl(characterId);
    statusDiv.textContent = `キャラクターID: ${characterId} のデータを取得中...`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        await updateNotionDatabase(characterId, jsonData);
    } catch (error) {
        console.error(`キャラクターID: ${characterId} のデータ取得エラー:`, error);
        statusDiv.textContent = `キャラクターID: ${characterId} のデータ取得に失敗しました。エラー: ${error.message}`;
    }
}

///// Notion APIとの連携 /////
npm install @notionhq/client

const { Client } = require('@notionhq/client');
const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

const databaseId = 'YOUR_NOTION_DATABASE_ID'; // NotionデータベースのIDを設定


///// Notionへのデータ送信 /////
sync function updateNotionDatabase(characterId, jsonData) {
    statusDiv.textContent = `キャラクターID: ${characterId} のデータをNotionに保存中...`;
    try {
        const existingEntry = await findNotionEntry(characterId);
        const properties = {
            'Character ID': { title: [{ text: { content: characterId } }] },
            'STR': { rich_text: },
            'CON': { rich_text: },
            'DEX': { rich_text: },
            'APP': { rich_text: },
            'SIZ': { rich_text: },
            'INT': { rich_text: },
            'EDU': { rich_text: },
            'HP': { rich_text: },
            'MP': { rich_text: },
            'アイデア': { rich_text: },
            '幸運': { rich_text: },
            '知識': { rich_text: },
            '現在SAN値': { rich_text: },
            '戦闘技能': { rich_text: },
            '探索技能': { rich_text: },
            '行動技能': { rich_text: },
            '交渉技能': { rich_text: },
            '知識技能': { rich_text: },
            'Combat Data': { rich_text: },
            'Weapon Data': { rich_text: },
            'Armor Data': { rich_text: },
            'Possessions': { rich_text: },
            '所持金': { rich_text: },
            'その他メモ': { rich_text: },
        };

        if (existingEntry) {
            await notion.pages.update({
                page_id: existingEntry.id,
                properties: properties,
            });
            statusDiv.textContent = `キャラクターID: ${characterId} のデータを更新しました。`;
        } else {
            await notion.pages.create({
                parent: { database_id: databaseId },
                properties: properties,
            });
            statusDiv.textContent = `キャラクターID: ${characterId} のデータを新規登録しました。`;
        }
    } catch (error) {
        console.error(`キャラクターID: ${characterId} のNotion更新エラー:`, error);
        statusDiv.textContent = `キャラクターID: ${characterId} のNotion更新に失敗しました。エラー: ${error.message}`;
    }
}

async function findNotionEntry(characterId) {
    const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
            property: 'Character ID',
            title: {
                equals: characterId,
            },
        },
    });
    return response.results;
}


