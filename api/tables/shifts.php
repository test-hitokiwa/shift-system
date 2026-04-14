<?php
require_once __DIR__ . '/../config.php';

// Content-Type ヘッダー設定
header('Content-Type: application/json; charset=utf-8');

// OPTIONSリクエストの処理（CORS プリフライト）
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$method = $_SERVER['REQUEST_METHOD'];
$segments = getPathSegments();

// ID取得
$shiftId = null;
if (isset($_GET['path']) && !empty($_GET['path'])) {
    $shiftId = $_GET['path'];
} elseif (count($segments) >= 3 && $segments[1] === 'shifts') {
    $shiftId = $segments[2];
}

try {
    // GET: シフト一覧または単一取得
    if ($method === 'GET') {
        if ($shiftId) {
            // 単一シフト取得
            $stmt = $pdo->prepare("SELECT * FROM shifts WHERE id = ? AND deleted = 0");
            $stmt->execute([$shiftId]);
            $shift = $stmt->fetch();
            
            if ($shift) {
                // 数値・真偽値型に変換
                $shift['created_at'] = (int)$shift['created_at'];
                $shift['updated_at'] = (int)$shift['updated_at'];
                $shift['is_confirmed'] = (bool)$shift['is_confirmed'];
                echo json_encode($shift);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'Shift not found']);
            }
        } else {
            // シフト一覧取得
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $offset = ($page - 1) * $limit;
            
            $stmt = $pdo->prepare("SELECT * FROM shifts WHERE deleted = 0 ORDER BY date DESC, start_time ASC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $shifts = $stmt->fetchAll();
            
            // 数値・真偽値型に変換
            foreach ($shifts as &$shift) {
                $shift['created_at'] = (int)$shift['created_at'];
                $shift['updated_at'] = (int)$shift['updated_at'];
                $shift['is_confirmed'] = (bool)$shift['is_confirmed'];
            }
            
            $countStmt = $pdo->query("SELECT COUNT(*) FROM shifts WHERE deleted = 0");
            $total = (int)$countStmt->fetchColumn();
            
            echo json_encode([
                'data' => $shifts,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'table' => 'shifts'
            ]);
        }
    }
    
    // POST: シフト作成
    elseif ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);
        
        $id = generateUUID();
        $user_id = $input['user_id'] ?? '';
        $user_name = $input['user_name'] ?? '';
        $date = $input['date'] ?? '';
        $start_time = $input['start_time'] ?? '';
        $end_time = $input['end_time'] ?? '';
        $is_confirmed = isset($input['is_confirmed']) ? (int)$input['is_confirmed'] : 1;
        $notes = $input['notes'] ?? '';
        $now = getCurrentTimestamp();
        
        $stmt = $pdo->prepare("
            INSERT INTO shifts (id, user_id, user_name, date, start_time, end_time, is_confirmed, notes, created_at, updated_at, deleted)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ");
        $stmt->execute([$id, $user_id, $user_name, $date, $start_time, $end_time, $is_confirmed, $notes, $now, $now]);
        
        http_response_code(201);
        echo json_encode([
            'id' => $id,
            'user_id' => $user_id,
            'user_name' => $user_name,
            'date' => $date,
            'start_time' => $start_time,
            'end_time' => $end_time,
            'is_confirmed' => (bool)$is_confirmed,
            'notes' => $notes,
            'created_at' => $now,
            'updated_at' => $now,
            'deleted' => false
        ]);
    }
    
    // PUT: シフト完全更新
    elseif ($method === 'PUT') {
        if (!$shiftId) {
            http_response_code(400);
            echo json_encode(['error' => 'Shift ID is required']);
            exit();
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $user_id = $input['user_id'] ?? '';
        $user_name = $input['user_name'] ?? '';
        $date = $input['date'] ?? '';
        $start_time = $input['start_time'] ?? '';
        $end_time = $input['end_time'] ?? '';
        $is_confirmed = isset($input['is_confirmed']) ? (int)$input['is_confirmed'] : 1;
        $notes = $input['notes'] ?? '';
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
                'updated_at' => $now
            ]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'Shift not found']);
        }
    }
    
    // PATCH: シフト部分更新
    elseif ($method === 'PATCH') {
        if (!$shiftId) {
            http_response_code(400);
            echo json_encode(['error' => 'Shift ID is required']);
            exit();
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $now = getCurrentTimestamp();
        
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
        $is_confirmed = isset($input['is_confirmed']) ? (int)$input['is_confirmed'] : $existing['is_confirmed'];
        $notes = $input['notes'] ?? $existing['notes'];
        
        $stmt = $pdo->prepare("
            UPDATE shifts 
            SET user_id = ?, user_name = ?, date = ?, start_time = ?, end_time = ?, is_confirmed = ?, notes = ?, updated_at = ?
            WHERE id = ?
        ");
        $stmt->execute([$user_id, $user_name, $date, $start_time, $end_time, $is_confirmed, $notes, $now, $shiftId]);
        
        echo json_encode([
            'id' => $shiftId,
            'user_id' => $user_id,
            'user_name' => $user_name,
            'date' => $date,
            'start_time' => $start_time,
            'end_time' => $end_time,
            'is_confirmed' => (bool)$is_confirmed,
            'notes' => $notes,
            'updated_at' => $now
        ]);
    }
    
    // DELETE: シフト削除（論理削除）
    elseif ($method === 'DELETE') {
        if (!$shiftId) {
            http_response_code(400);
            echo json_encode(['error' => 'Shift ID is required']);
            exit();
        }
        
        $stmt = $pdo->prepare("UPDATE shifts SET deleted = 1 WHERE id = ?");
        $stmt->execute([$shiftId]);
        
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
