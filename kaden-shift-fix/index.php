<?php
/**
 * シフト調整システム - エントリーポイント
 * 
 * このファイルは index.html を読み込んで表示します。
 * お名前.comのサーバーで DirectoryIndex が正しく動作しない場合の対処用です。
 */

// index.html が存在するか確認
$indexFile = __DIR__ . '/index.html';

if (file_exists($indexFile)) {
    // index.html の内容を読み込んで表示
    $content = file_get_contents($indexFile);
    
    // Content-Type を HTML に設定
    header('Content-Type: text/html; charset=UTF-8');
    
    // 出力
    echo $content;
} else {
    // index.html が見つからない場合
    http_response_code(404);
    echo '<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>エラー</title>
</head>
<body>
    <h1>ファイルが見つかりません</h1>
    <p>index.html が見つかりません。ファイルをアップロードしてください。</p>
</body>
</html>';
}
?>
