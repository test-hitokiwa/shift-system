<?php
require_once __DIR__ . '/../config.php';

// Content-Type ヘッダー設定
header('Content-Type: application/json; charset=utf-8');

// OPTIONSリクエストの処理（CORS プリフライト）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// メソッドオーバーライド対応（お名前.com対策）
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
}

$segments = getPathSegments();

// ID取得
$requestId = null;
if (isset($_GET['path']) && !empty($_GET['path'])) {
    $requestId = $_GET['path'];
} elseif (count($segments) >= 3 && $segments[1] === 'shift_requests') {
    $requestId = $segments[2];
}

try {
    // GET: 希望シフト一覧または単一取得
    if ($method === 'GET') {
        if ($requestId) {
            // 単一希望シフト取得
            $stmt = $pdo->prepare("SELECT * FROM shift_requests WHERE id = ? AND deleted = 0");
            $stmt->execute([$requestId]);
            $request = $stmt->fetch();
            
            if ($request) {
                // 数値型に変換、JSONデコード
                $request['created_at'] = (int)$request['created_at'];
                $request['updated_at'] = (int)$request['updated_at'];
                $request['time_slots'] = json_decode($request['time_slots'], true);
                echo json_encode($request);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Shift request not found']);
            }
        } else {
            // 希望シフト一覧取得
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $offset = ($page - 1) * $limit;
            
            $stmt = $pdo->prepare("SELECT * FROM shift_requests WHERE deleted = 0 ORDER BY date DESC, created_at DESC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $requests = $stmt->fetchAll();
            
            // 数値型に変換、JSONデコード
            foreach ($requests as &$request) {
                $request['created_at'] = (int)$request['created_at'];
                $request['updated_at'] = (int)$request['updated_at'];
                $request['time_slots'] = json_decode($request['time_slots'], true);
            }
            
            $countStmt = $pdo->query("SELECT COUNT(*) FROM shift_requests WHERE deleted = 0");
            $total = (int)$countStmt->fetchColumn();
            
            echo json_encode([
                'data' => $requests,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'table' => 'shift_requests'
            ]);
        }
    }
    
    // POST: 希望シフト作成
    elseif ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $id = generateUUID();
        $user_id = $input['user_id'] ?? '';
        $user_name = $input['user_name'] ?? '';
        $date = $input['date'] ?? '';
        $time_slots = isset($input['time_slots']) ? json_encode($input['time_slots']) : '[]';
        $status = $input['status'] ?? 'pending';
        $notes = $input['notes'] ?? '';
        $now = getCurrentTimestamp();
        
        $stmt = $pdo->prepare("
            INSERT INTO shift_requests (id, user_id, user_name, date, time_slots, status, notes, created_at, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ");
        $stmt->execute([$id, $user_id, $user_name, $date, $time_slots, $status, $notes, $now, $now]);
        
        http_response_code(201);
        echo json_encode([
            'id' => $id,
            'user_id' => $user_id,
            'user_name' => $user_name,
            'date' => $date,
            'time_slots' => json_decode($time_slots, true),
            'status' => $status,
            'notes' => $notes,
            'created_at' => $now,
            'updated_at' => $now,
            'deleted' => false
        ]);
    }
    
    // PUT: 希望シフト完全更新
    elseif ($method === 'PUT') {
        if (!$requestId) {
            http_response_code(400);
            echo json_encode(['error' => 'Request ID is required']);
            exit();
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $user_id = $input['user_id'] ?? '';
        $user_name = $input['user_name'] ?? '';
        $date = $input['date'] ?? '';
        $time_slots = isset($input['time_slots']) ? json_encode($input['time_slots']) : '[]';
        $status = $input['status'] ?? 'pending';
        $notes = $input['notes'] ?? '';
        $now = getCurrentTimestamp();
        
        $stmt = $pdo->prepare("
            UPDATE shift_requests 
            SET user_id = ?, user_name = ?, date = ?, time_slots = ?, status = ?, notes = ?, updated_at = ?
            WHERE id = ? AND deleted = 0
        ");
        $stmt->execute([$user_id, $user_name, $date, $time_slots, $status, $notes, $now, $requestId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'id' => $requestId,
                'user_id' => $user_id,
                'user_name' => $user_name,
                'date' => $date,
                'time_slots' => json_decode($time_slots, true),
                'status' => $status,
                'notes' => $notes,
                'updated_at' => $now
            ]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Shift request not found']);
        }
    }
    
    // PATCH: 希望シフト部分更新
    elseif ($method === 'PATCH') {
        if (!$requestId) {
            http_response_code(400);
            echo json_encode(['error' => 'Request ID is required']);
            exit();
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $now = getCurrentTimestamp();
        
        // 既存データ取得
        $stmt = $pdo->prepare("SELECT * FROM shift_requests WHERE id = ? AND deleted = 0");
        $stmt->execute([$requestId]);
        $existing = $stmt->fetch();
        
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Shift request not found']);
            exit();
        }
        
        // 更新するフィールドのみ変更
        $user_id = $input['user_id'] ?? $existing['user_id'];
        $user_name = $input['user_name'] ?? $existing['user_name'];
        $date = $input['date'] ?? $existing['date'];
        $time_slots = isset($input['time_slots']) ? json_encode($input['time_slots']) : $existing['time_slots'];
        $status = $input['status'] ?? $existing['status'];
        $notes = $input['notes'] ?? $existing['notes'];
        
        $stmt = $pdo->prepare("
            UPDATE shift_requests 
            SET user_id = ?, user_name = ?, date = ?, time_slots = ?, status = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ");
        $stmt->execute([$user_id, $user_name, $date, $time_slots, $status, $notes, $now, $requestId]);
        
        echo json_encode([
            'id' => $requestId,
            'user_id' => $user_id,
            'user_name' => $user_name,
            'date' => $date,
            'time_slots' => json_decode($time_slots, true),
            'status' => $status,
            'notes' => $notes,
            'updated_at' => $now
        ]);
    }
    
    // DELETE: 希望シフト削除（論理削除）
    elseif ($method === 'DELETE') {
        if (!$requestId) {
            http_response_code(400);
            echo json_encode(['error' => 'Request ID is required']);
            exit();
        }
        
        $stmt = $pdo->prepare("UPDATE shift_requests SET deleted = 1 WHERE id = ?");
        $stmt->execute([$requestId]);
        
        http_response_code(204);
    }
    
    else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
