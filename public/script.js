// イベントリスナーの設定
document.getElementById('updateButton').addEventListener('click', async () => {
// 入力値の取得と初期化
    const characterId = document.getElementById('characterId').input_value.trim();
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = '';
    messageDiv.className = '';

// 入力チェック
    if (!characterId) {
        messageDiv.textContent = 'キャラクターIDを入力してください。';
        messageDiv.className = 'error';
        return;
    }

    // 処理中メッセージの表示
        messageDiv.textContent = '処理中...';
    
    // レスポンスの処理
        const result = await response.json();
        if (response.ok) {
            messageDiv.textContent = `処理完了: ${result.message}. NotionページID: ${result.pageId || 'N/A'}`;
            messageDiv.className = 'success';
        } else {
            messageDiv.textContent = `エラー: ${result.message}`;
            messageDiv.className = 'error';
        }

    } catch (error) {    // 通信エラー処理
        console.error('Fetch error:', error);
        messageDiv.textContent = '通信エラーが発生しました。コンソールを確認してください。';
        messageDiv.className = 'error';
    }
});
