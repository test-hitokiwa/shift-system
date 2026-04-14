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
    $shiftId = '';
    
    for ($i = 0; $i < count($pathSegments); $i++) {
        if ($pathSegments[$i] === 'shifts_update' && isset($pathSegments[$i + 1])) {
            $shiftId = $pathSegments[$i + 1];
            break;
        }
    }
    
    // パスにない場合は $_GET['path'] から取得
    if (!$shiftId && isset($_GET['path'])) {
        $pathParts = explode('/', $_GET['path']);
        $shiftId = $pathParts[0] ?? '';
    }
    
    // ボディにある場合はそちらを優先
    if (isset($input['id'])) {
        $shiftId = $input['id'];
    }
    
    if (!$shiftId) {
        http_response_code(400);
        echo json_encode(['error' => 'Shift ID is required']);
        exit();
    }
    
    // 削除処理の判定（URLに "delete" が含まれているか、またはactionが"delete"）
    $isDelete = (isset($input['action']) && $input['action'] === 'delete') || 
                (isset($_GET['path']) && strpos($_GET['path'], 'delete') !== false);
    
    if ($isDelete) {
        // 論理削除
        $stmt = $pdo->prepare("UPDATE shifts SET deleted = 1 WHERE id = ?");
        $stmt->execute([$shiftId]);
        
        if ($stmt->rowCount() > 0) {
            http_response_code(204);
            exit();
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Shift not found']);
            exit();
        }
    }
    
    // 既存データ取得
    $stmt = $pdo->prepare("SELECT * FROM shifts WHERE id = ? AND deleted = 0");
    $stmt->execute([$shiftId]);
    $existing = $stmt->fetch();
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Shift not found']);
        exit();
    }
    
    // 更新するフィールドのみ変更
    $user_id = $input['user_id'] ?? $existing['user_id'];
    $user_name = $input['user_name'] ?? $existing['user_name'];
    $date = $input['date'] ?? $existing['date'];
    $start_time = $input['start_time'] ?? $existing['start_time'];
    $end_time = $input['end_time'] ?? $existing['end_time'];
    $is_confirmed = isset($input['is_confirmed']) ? (int)$input['is_confirmed'] : (int)$existing['is_confirmed'];
    $notes = isset($input['notes']) ? $input['notes'] : $existing['notes'];
    $now = getCurrentTimestamp();
    
    $stmt = $pdo->prepare("
        UPDATE shifts 
        SET user_id = ?, user_name = ?, date = ?, start_time = ?, end_time = ?, is_confirmed = ?, notes = ?, updated_at = ?
        WHERE id = ? AND deleted = 0
    ");
    $stmt->execute([$user_id, $user_name, $date, $start_time, $end_time, $is_confirmed, $notes, $now, $shiftId]);
    
    if ($stmt->rowCount() > 0) {
        echo json_encode([
            'id' => $shiftId,
            'user_id' => $user_id,
            'user_name' => $user_name,
            'date' => $date,
            'start_time' => $start_time,
            'end_time' => $end_time,
            'is_confirmed' => (bool)$is_confirmed,
            'notes' => $notes,
            'updated_at' => $now,
            'message' => '更新しました'
        ]);
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Shift not found or no changes']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
