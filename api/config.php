<?php
// ヘッダーが送信されていない場合のみCORS設定を適用
if (!headers_sent()) {
    // CORS設定（強化版）
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 3600');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Expose-Headers: Content-Length, Content-Type');

    // キャッシュ無効化（リアルタイム更新のため）
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

// Content-Type は各エンドポイントで設定
// header('Content-Type: application/json; charset=utf-8');

// OPTIONSリクエスト（プリフライト）の処理は各エンドポイントで実施
// if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
//     http_response_code(200);
//     exit();
// }

// データベース接続情報
$host = 'mysql1026.onamae.ne.jp';
$dbname = '2b98y_shift_system';
$username = '2b98y_shift';
$password = 'Hitokiw@0053';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
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
