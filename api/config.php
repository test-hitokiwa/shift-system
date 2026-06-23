<?php
// CORS / Cache-Control ヘッダーは Caddyfile (Railway) または .htaccess (お名前.com) 側で設定する。
// PHP 側で重複設定すると Allow-Origin が複数並んでブラウザに拒否されるため、ここでは何もしない。

// Content-Type は各エンドポイントで設定
// header('Content-Type: application/json; charset=utf-8');

// OPTIONSリクエスト（プリフライト）の処理は各エンドポイントで実施
// if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
//     http_response_code(200);
//     exit();
// }

// データベース接続情報
// 環境変数があれば優先 (Railway 用)、なければ お名前.com の旧設定にフォールバック
$host     = getenv('MYSQLHOST')     ?: 'mysql1026.onamae.ne.jp';
$port     = getenv('MYSQLPORT')     ?: '3306';
$dbname   = getenv('MYSQLDATABASE') ?: '2b98y_shift_system';
$username = getenv('MYSQLUSER')     ?: '2b98y_shift';
$password = getenv('MYSQLPASSWORD') ?: 'Hitokiw@0053';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

function generateUUID() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

function getPathSegments() {
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    return array_values(array_filter(explode('/', $path)));
}

function getCurrentTimestamp() {
    return round(microtime(true) * 1000);
}
?>
