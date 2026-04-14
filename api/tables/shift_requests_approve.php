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
    
    $requestId = $input['id'] ?? '';
    $action = $input['action'] ?? 'approve'; // approve または unapprove
    
    if (!$requestId) {
        http_response_code(400);
        echo json_encode(['error' => 'Request ID is required']);
        exit();
    }
    
    // 既存データ取得
    $stmt = $pdo->prepare("SELECT * FROM shift_requests WHERE id = ? AND deleted = 0");
    $stmt->execute([$requestId]);
    $existing = $stmt->fetch();
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Shift request not found']);
        exit();
    }
    
    // ステータス更新
    $newStatus = ($action === 'approve') ? 'approved' : 'pending';
    $now = getCurrentTimestamp();
    
    $stmt = $pdo->prepare("
        UPDATE shift_requests 
        SET status = ?, updated_at = ?
        WHERE id = ? AND deleted = 0
    ");
    $stmt->execute([$newStatus, $now, $requestId]);
    
    if ($stmt->rowCount() > 0) {
        // 更新後のデータを返す（承認済み = 確定シフトなので、別テーブルへの作成は不要）
        echo json_encode([
            'id' => $requestId,
            'user_id' => $existing['user_id'],
            'user_name' => $existing['user_name'],
            'date' => $existing['date'],
            'time_slots' => json_decode($existing['time_slots'], true),
            'status' => $newStatus,
            'notes' => $existing['notes'],
            'updated_at' => $now,
            'message' => $action === 'approve' ? '承認しました' : '承認を取り消しました'
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Update failed']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
