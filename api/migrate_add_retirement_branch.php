<?php
/**
 * 1度だけ実行するマイグレーションスクリプト。
 * users テーブルに retirement_date と branch カラムを追加する。
 *
 *   retirement_date DATE NULL  : 退職日。設定するとその翌日以降のシフトは削除され、
 *                                 シフト未提出一覧にも上がらなくなる。
 *   branch VARCHAR(1) NULL     : 別営業区分 (A〜G)。NULL は通常営業。
 *
 * 実行方法:
 *   ブラウザで https://thriving-surprise-production-c740.up.railway.app/migrate_add_retirement_branch.php を開く。
 *   1度実行すれば以降は「既に存在します」と表示されるだけで安全。
 */
require_once __DIR__ . '/config.php';
header('Content-Type: text/plain; charset=utf-8');

try {
    // retirement_date
    $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'retirement_date'");
    if ($check && $check->rowCount() > 0) {
        echo "retirement_date カラムは既に存在します。\n";
    } else {
        $pdo->exec("ALTER TABLE users ADD COLUMN retirement_date DATE NULL");
        echo "retirement_date カラムを追加しました。\n";
    }

    // branch
    $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'branch'");
    if ($check && $check->rowCount() > 0) {
        echo "branch カラムは既に存在します。\n";
    } else {
        $pdo->exec("ALTER TABLE users ADD COLUMN branch VARCHAR(1) NULL");
        echo "branch カラムを追加しました。\n";
    }

    // hire_date
    $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'hire_date'");
    if ($check && $check->rowCount() > 0) {
        echo "hire_date カラムは既に存在します。\n";
    } else {
        $pdo->exec("ALTER TABLE users ADD COLUMN hire_date DATE NULL");
        echo "hire_date カラムを追加しました。\n";
    }

    echo "完了\n";
} catch (Exception $e) {
    http_response_code(500);
    echo "エラー: " . $e->getMessage() . "\n";
}
