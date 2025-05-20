document.getElementById('updateButton').addEventListener('click', async () => {
    const characterId = document.getElementById('characterId').input_value.trim();
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = '';
    messageDiv.className = '';

    if (!characterId) {
        messageDiv.textContent = 'キャラクターIDを入力してください。';
        messageDiv.className = 'error';
        return;
    }

    messageDiv.textContent = '処理中...';

    try {
        const response = await fetch('/api/sync-character', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ characterId: characterId }),
        });

        const result = await response.json();

        if (response.ok) {
            messageDiv.textContent = `処理完了: ${result.message}. NotionページID: ${result.pageId || 'N/A'}`;
            messageDiv.className = 'success';
        } else {
            messageDiv.textContent = `エラー: ${result.message}`;
            messageDiv.className = 'error';
        }
    } catch (error) {
        console.error('Fetch error:', error);
        messageDiv.textContent = '通信エラーが発生しました。コンソールを確認してください。';
        messageDiv.className = 'error';
    }
});
