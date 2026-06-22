<?php
/**
 * 1度だけ実行するマイグレーションスクリプト。
 * shift_requests テーブルに is_absent カラムを追加する。
 *
 * 実行方法:
 *   ブラウザで https://hito-kiwa.co.jp/api/migrate_add_is_absent.php を開く。
 *   1度実行すれば以降は「既に存在します」と表示されるだけで安全。
 */
require_once __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');

try {
    $check = $pdo->query("SHOW COLUMNS FROM shift_requests LIKE 'is_absent'");
    if ($check && $check->rowCount() > 0) {
        echo "is_absent カラムは既に存在します。マイグレーション不要です。\n";
    } else {
        $pdo->exec("ALTER TABLE shift_requests ADD COLUMN is_absent TINYINT(1) NOT NULL DEFAULT 0");
        echo "is_absent カラムを追加しました。\n";
    }
    echo "完了\n";
} catch (Exception $e) {
    http_response_code(500);
    echo "エラー: " . $e->getMessage() . "\n";
}
