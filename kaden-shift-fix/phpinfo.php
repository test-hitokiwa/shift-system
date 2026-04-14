<?php
/**
 * PHP環境情報の確認
 * 
 * このファイルをアップロード後、以下のURLにアクセス:
 * https://kaden-shift.hito-kiwa.co.jp/phpinfo.php
 * 
 * 確認後は必ず削除してください（セキュリティのため）
 */

// 基本情報の表示
echo "<h1>PHP環境情報</h1>";
echo "<h2>基本設定</h2>";
echo "<ul>";
echo "<li>PHPバージョン: " . phpversion() . "</li>";
echo "<li>ドキュメントルート: " . $_SERVER['DOCUMENT_ROOT'] . "</li>";
echo "<li>現在のディレクトリ: " . __DIR__ . "</li>";
echo "<li>スクリプトファイル名: " . $_SERVER['SCRIPT_FILENAME'] . "</li>";
echo "<li>サーバーソフトウェア: " . $_SERVER['SERVER_SOFTWARE'] . "</li>";
echo "<li>サーバーホスト: " . $_SERVER['HTTP_HOST'] . "</li>";
echo "</ul>";

// index.html の存在確認
echo "<h2>ファイル確認</h2>";
$files = ['index.html', 'staff.html', 'admin.html', 'css/style.css', 'js/login.js'];
echo "<ul>";
foreach ($files as $file) {
    $fullPath = __DIR__ . '/' . $file;
    $exists = file_exists($fullPath);
    $status = $exists ? '✅ 存在' : '❌ 見つからない';
    echo "<li>{$file}: {$status}</li>";
}
echo "</ul>";

// .htaccess の確認
echo "<h2>.htaccess 確認</h2>";
$htaccessPath = __DIR__ . '/.htaccess';
if (file_exists($htaccessPath)) {
    echo "<p>✅ .htaccess が存在します</p>";
    echo "<p>ファイルサイズ: " . filesize($htaccessPath) . " bytes</p>";
} else {
    echo "<p>❌ .htaccess が見つかりません</p>";
}

echo "<hr>";
echo "<h2>詳細情報</h2>";
echo "<p><a href='?full=1'>詳細な PHP 情報を表示</a></p>";

// フルの phpinfo() を表示
if (isset($_GET['full'])) {
    echo "<hr>";
    phpinfo();
}
?>
