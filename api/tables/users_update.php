<?php
require_once __DIR__ . '/../config.php';

// Content-Type ヘッダー設定
header('Content-Type: application/json; charset=utf-8');

// OPTIONSリクエストの処理（CORS プリフライト）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// POSTメソッドのみ許可
$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit();
}

try {
    // リクエストボディから情報取得
    $input = json_decode(file_get_contents('php://input'), true);
    
    // URLパスからIDを取得
    $pathSegments = getPathSegments();
    $userId = '';
    
    for ($i = 0; $i < count($pathSegments); $i++) {
        if ($pathSegments[$i] === 'users_update' && isset($pathSegments[$i + 1])) {
            $userId = $pathSegments[$i + 1];
            break;
        }
    }
    
    // パスにない場合は $_GET['path'] から取得
    if (!$userId && isset($_GET['path'])) {
        $pathParts = explode('/', $_GET['path']);
        $userId = $pathParts[0] ?? '';
    }
    
    // ボディにある場合はそちらを優先
    if (isset($input['id'])) {
        $userId = $input['id'];
    }
    
    if (!$userId) {
        http_response_code(400);
        echo json_encode(['error' => 'User ID is required']);
        exit();
    }
    
    // 削除処理の判定（URLに "delete" が含まれているか、またはactionが"delete"）
    $isDelete = (isset($input['action']) && $input['action'] === 'delete') || 
                (isset($_GET['path']) && strpos($_GET['path'], 'delete') !== false);
    
    if ($isDelete) {
        // 論理削除
        $stmt = $pdo->prepare("UPDATE users SET deleted = 1 WHERE id = ?");
        $stmt->execute([$userId]);
        
        if ($stmt->rowCount() > 0) {
            http_response_code(204);
            exit();
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit();
        }
    }
    
    // 既存データ取得
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND deleted = 0");
    $stmt->execute([$userId]);
    $existing = $stmt->fetch();
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit();
    }
    
    // 更新するフィールドのみ変更
    $name = $input['name'] ?? $existing['name'];
    $role = $input['role'] ?? $existing['role'];
    $password = $input['password'] ?? $existing['password'];
    $now = getCurrentTimestamp();
    
    $stmt = $pdo->prepare("
        UPDATE users 
        SET name = ?, role = ?, password = ?, updated_at = ?
        WHERE id = ? AND deleted = 0
    ");
    $stmt->execute([$name, $role, $password, $now, $userId]);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode([
            'id' => $userId,
            'name' => $name,
            'role' => $role,
            'updated_at' => $now,
            'message' => '更新しました'
        ]);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'User not found or no changes']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
