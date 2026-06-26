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

// ID取得（URL末尾から）
$userId = null;
if (isset($_GET['path']) && !empty($_GET['path'])) {
    $userId = $_GET['path'];
} elseif (count($segments) >= 3 && $segments[1] === 'users') {
    $userId = $segments[2];
}

try {
    // GET: ユーザー一覧または単一取得
    if ($method === 'GET') {
        if ($userId) {
            // 単一ユーザー取得
            $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND deleted = 0");
            $stmt->execute([$userId]);
            $user = $stmt->fetch();
            
            if ($user) {
                // 数値型に変換
                $user['created_at'] = (int)$user['created_at'];
                $user['updated_at'] = (int)$user['updated_at'];
                echo json_encode($user);
            } else {
                http_response_code(404);
                echo json_encode(['error' => 'User not found']);
            }
        } else {
            // ユーザー一覧取得
            $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $offset = ($page - 1) * $limit;
            
            $stmt = $pdo->prepare("SELECT * FROM users WHERE deleted = 0 ORDER BY created_at DESC LIMIT :limit OFFSET :offset");
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();
            $users = $stmt->fetchAll();
            
            // 数値型に変換
            foreach ($users as &$user) {
                $user['created_at'] = (int)$user['created_at'];
                $user['updated_at'] = (int)$user['updated_at'];
            }
            
            $countStmt = $pdo->query("SELECT COUNT(*) FROM users WHERE deleted = 0");
            $total = (int)$countStmt->fetchColumn();
            
            echo json_encode([
                'data' => $users,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
                'table' => 'users'
            ]);
        }
    }
    
    // POST: ユーザー作成
    elseif ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input'), true);

        $id = generateUUID();
        $name = $input['name'] ?? '';
        $role = $input['role'] ?? 'staff';
        $phone = $input['phone'] ?? '';
        $password = $input['password'] ?? '';
        $hireDate = array_key_exists('hire_date', $input) ? ($input['hire_date'] ?: null) : null;
        $now = getCurrentTimestamp();

        // hire_date カラムを必要時に動的追加
        $insertHireDate = false;
        if ($hireDate !== null) {
            $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'hire_date'");
            if (!$check || $check->rowCount() === 0) {
                $pdo->exec("ALTER TABLE users ADD COLUMN hire_date DATE NULL");
            }
            $insertHireDate = true;
        }

        if ($insertHireDate) {
            $stmt = $pdo->prepare("
                INSERT INTO users (id, name, role, phone, password, hire_date, created_at, updated_at, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            ");
            $stmt->execute([$id, $name, $role, $phone, $password, $hireDate, $now, $now]);
        } else {
            $stmt = $pdo->prepare("
                INSERT INTO users (id, name, role, phone, password, created_at, updated_at, deleted)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            ");
            $stmt->execute([$id, $name, $role, $phone, $password, $now, $now]);
        }

        http_response_code(201);
        echo json_encode([
            'id' => $id,
            'name' => $name,
            'role' => $role,
            'phone' => $phone,
            'password' => $password,
            'hire_date' => $hireDate,
            'created_at' => $now,
            'updated_at' => $now,
            'deleted' => false
        ]);
    }
    
    // PUT: ユーザー完全更新
    elseif ($method === 'PUT') {
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID is required']);
            exit();
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        $name = $input['name'] ?? '';
        $role = $input['role'] ?? '';
        $phone = $input['phone'] ?? '';
        $password = $input['password'] ?? '';
        $now = getCurrentTimestamp();
        
        $stmt = $pdo->prepare("
            UPDATE users 
            SET name = ?, role = ?, phone = ?, password = ?, updated_at = ?
            WHERE id = ? AND deleted = 0
        ");
        $stmt->execute([$name, $role, $phone, $password, $now, $userId]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode([
                'id' => $userId,
                'name' => $name,
                'role' => $role,
                'phone' => $phone,
                'password' => $password,
                'updated_at' => $now
            ]);
        } else {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
        }
    }
    
    // PATCH: ユーザー部分更新
    elseif ($method === 'PATCH') {
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID is required']);
            exit();
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $now = getCurrentTimestamp();

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
        $phone = $input['phone'] ?? $existing['phone'];
        $password = $input['password'] ?? $existing['password'];

        // SET 句を動的に組み立てる
        // (retirement_date / branch カラムが未マイグレーションでも基本フィールド更新は壊さない)
        $sets   = ['name = ?', 'role = ?', 'phone = ?', 'password = ?', 'updated_at = ?'];
        $params = [$name, $role, $phone, $password, $now];

        $retirementDate = null;
        if (array_key_exists('retirement_date', $input)) {
            $retirementDate = $input['retirement_date'] ?: null;
            $sets[] = 'retirement_date = ?';
            $params[] = $retirementDate;
        }
        $branch = null;
        if (array_key_exists('branch', $input)) {
            $branch = $input['branch'] ?: null;
            $sets[] = 'branch = ?';
            $params[] = $branch;
        }
        $hireDate = null;
        if (array_key_exists('hire_date', $input)) {
            $hireDate = $input['hire_date'] ?: null;
            $sets[] = 'hire_date = ?';
            $params[] = $hireDate;
        }

        $params[] = $userId;
        $sql = "UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?";
        $stmt = $pdo->prepare($sql);

        try {
            $stmt->execute($params);
        } catch (PDOException $e) {
            // retirement_date / branch / hire_date カラム不在による失敗なら、
            // 自動的に ALTER TABLE で追加してリトライ (= マイグレーション内蔵)
            $msg = $e->getMessage();
            $isMissingColumn = strpos($msg, 'retirement_date') !== false
                            || strpos($msg, 'branch') !== false
                            || strpos($msg, 'hire_date') !== false
                            || strpos($msg, 'Unknown column') !== false;
            if ($isMissingColumn) {
                $altered = false;
                $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'retirement_date'");
                if (!$check || $check->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN retirement_date DATE NULL");
                    $altered = true;
                }
                $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'branch'");
                if (!$check || $check->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN branch VARCHAR(1) NULL");
                    $altered = true;
                }
                $check = $pdo->query("SHOW COLUMNS FROM users LIKE 'hire_date'");
                if (!$check || $check->rowCount() === 0) {
                    $pdo->exec("ALTER TABLE users ADD COLUMN hire_date DATE NULL");
                    $altered = true;
                }
                if ($altered) {
                    // カラム追加後、prepare し直してリトライ
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                } else {
                    throw $e;
                }
            } else {
                throw $e;
            }
        }

        echo json_encode([
            'id' => $userId,
            'name' => $name,
            'role' => $role,
            'phone' => $phone,
            'password' => $password,
            'retirement_date' => $retirementDate,
            'branch' => $branch,
            'hire_date' => $hireDate,
            'updated_at' => $now
        ]);
    }
    
    // DELETE: ユーザー削除（論理削除）
    elseif ($method === 'DELETE') {
        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'User ID is required']);
            exit();
        }
        
        // 関連するシフトと希望シフトも削除
        $pdo->prepare("UPDATE shifts SET deleted = 1 WHERE user_id = ?")->execute([$userId]);
        $pdo->prepare("UPDATE shift_requests SET deleted = 1 WHERE user_id = ?")->execute([$userId]);
        $pdo->prepare("UPDATE users SET deleted = 1 WHERE id = ?")->execute([$userId]);
        
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
