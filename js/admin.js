// 管理者ページの処理

// APIベースURL
const API_BASE_URL = 'https://hito-kiwa.co.jp/api';

// トースト通知を表示
function showToast(message, type = 'success') {
    // 既存のトーストを削除
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 新しいトーストを作成
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // アニメーション表示
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // 3秒後に自動削除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

let currentUser = null;
let allUsers = [];
let allRequests = [];
let allShifts = [];

// データキャッシュ（無効化してリアルタイム更新）
let usersCache = null;
let shiftsCache = null;
let requestsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 0; // キャッシュを無効化（即座に反映）

// ページ読み込み時
document.addEventListener('DOMContentLoaded', async () => {
    // ログイン確認
    const userInfo = localStorage.getItem('currentUser');
    if (!userInfo) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = JSON.parse(userInfo);
    
    // 管理者以外はスタッフページへリダイレクト
    if (currentUser.role !== 'admin') {
        window.location.href = 'staff.html';
        return;
    }
    
    // ユーザー名を表示
    document.getElementById('userName').textContent = currentUser.name;
    
    // 今月を設定
    const thisMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('shiftFilterMonth').value = thisMonth;
    document.getElementById('calendarMonth').value = thisMonth;
    document.getElementById('mgmtMonth').value = thisMonth;
    
    // 今日の日付を設定
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('shiftDate').value = today;
    
    // 時間・分の選択肢を生成
    generateHourMinOptions();
    
    // 初期データ読み込み
    await loadUsers();
    await loadShiftRequests();
    await loadShifts();
    await loadUsersList();
    await loadCalendar();
    
    // シフト管理タブの初期化
    const mgmtStaffSelect = document.getElementById('mgmtStaff');
    allUsers.filter(u => u.role === 'staff').forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name;
        mgmtStaffSelect.appendChild(option);
    });
});

// 時間・分の選択肢を生成（9～18時、0・15・30・45分）
function generateHourMinOptions() {
    // シフト作成用
    const shiftStartHour = document.getElementById('shiftStartHour');
    const shiftStartMin = document.getElementById('shiftStartMin');
    const shiftEndHour = document.getElementById('shiftEndHour');
    const shiftEndMin = document.getElementById('shiftEndMin');
    
    // シフト管理用
    const mgmtStartHour = document.getElementById('mgmtStartHour');
    const mgmtStartMin = document.getElementById('mgmtStartMin');
    const mgmtEndHour = document.getElementById('mgmtEndHour');
    const mgmtEndMin = document.getElementById('mgmtEndMin');
    
    // 時間の選択肢（9～18）
    const hours = [];
    for (let h = 9; h <= 18; h++) {
        hours.push(h);
    }
    
    // 分の選択肢（0, 15, 30, 45）
    const minutes = ['00', '15', '30', '45'];
    
    // シフト作成用：時間
    [shiftStartHour, shiftEndHour].forEach(select => {
        select.innerHTML = '<option value="">時</option>';
        hours.forEach(h => {
            const option = document.createElement('option');
            option.value = h.toString().padStart(2, '0');
            option.textContent = h + '時';
            select.appendChild(option);
        });
    });
    
    // シフト作成用：分
    [shiftStartMin, shiftEndMin].forEach(select => {
        select.innerHTML = '<option value="">分</option>';
        minutes.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m + '分';
            select.appendChild(option);
        });
    });
    
    // シフト管理用：時間
    [mgmtStartHour, mgmtEndHour].forEach(select => {
        select.innerHTML = '<option value="">時</option>';
        hours.forEach(h => {
            const option = document.createElement('option');
            option.value = h.toString().padStart(2, '0');
            option.textContent = h + '時';
            select.appendChild(option);
        });
    });
    
    // シフト管理用：分
    [mgmtStartMin, mgmtEndMin].forEach(select => {
        select.innerHTML = '<option value="">分</option>';
        minutes.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m + '分';
            select.appendChild(option);
        });
    });
}

// 時・分から時刻文字列を生成
function getTimeString(hour, min) {
    if (!hour || !min) return '';
    return `${hour}:${min}`;
}

// 時刻文字列から時・分を設定
function setHourMin(timeStr, hourSelectId, minSelectId) {
    if (!timeStr) return;
    const [hour, min] = timeStr.split(':');
    document.getElementById(hourSelectId).value = hour;
    document.getElementById(minSelectId).value = min;
}

// 時間選択ボックスを生成（9:30-18:00、15分刻み）- 旧関数（削除予定）
function generateTimeOptions() {
    const editStartSelect = document.getElementById('editStartTime');
    const editEndSelect = document.getElementById('editEndTime');
    
    const times = [];
    for (let hour = 9; hour <= 18; hour++) {
        for (let min = 0; min < 60; min += 15) {
            // 9:00, 9:15 は除外（9:30から）
            if (hour === 9 && min < 30) continue;
            // 18:00 より後は除外
            if (hour === 18 && min > 0) break;
            
            const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            times.push(timeStr);
        }
    }
    
    editStartSelect.innerHTML = '<option value="">選択してください</option>';
    editEndSelect.innerHTML = '<option value="">選択してください</option>';
    
    times.forEach(time => {
        const option1 = document.createElement('option');
        option1.value = time;
        option1.textContent = time;
        editStartSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = time;
        option2.textContent = time;
        editEndSelect.appendChild(option2);
    });
}

// キャッシュされたデータを取得
async function getCachedData() {
    const now = Date.now();
    
    // キャッシュが有効な場合は再利用
    if (usersCache && shiftsCache && requestsCache && 
        (now - cacheTimestamp < CACHE_DURATION)) {
        return { 
            users: usersCache, 
            shifts: shiftsCache, 
            requests: requestsCache 
        };
    }
    
    // キャッシュが無効な場合は新規取得
    const [usersResponse, shiftsResponse, requestsResponse] = await Promise.all([
        fetch(API_BASE_URL + '/tables/users'),
        fetch(API_BASE_URL + '/tables/shifts?limit=100'),
        fetch(API_BASE_URL + '/tables/shift_requests?limit=100')
    ]);
    
    const [usersResult, shiftsResult, requestsResult] = await Promise.all([
        usersResponse.json(),
        shiftsResponse.json(),
        requestsResponse.json()
    ]);
    
    // キャッシュに保存
    usersCache = usersResult.data;
    shiftsCache = shiftsResult.data;
    requestsCache = requestsResult.data;
    cacheTimestamp = now;
    
    return { 
        users: usersCache, 
        shifts: shiftsCache, 
        requests: requestsCache 
    };
}

// キャッシュをクリア（データ更新時に使用）
function clearCache() {
    usersCache = null;
    shiftsCache = null;
    requestsCache = null;
    cacheTimestamp = 0;
}

// ユーザー一覧を読み込む
async function loadUsers() {
    try {
        const { users: usersData } = await getCachedData();
        
        allUsers = usersData;
        
        // スタッフのみをセレクトボックスに追加
        const staffUsers = allUsers.filter(user => user.role === 'staff');
        const select = document.getElementById('shiftUser');
        select.innerHTML = '<option value="">選択してください</option>';
        
        staffUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            option.dataset.name = user.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('ユーザー読み込みエラー:', error);
    }
}

// 希望シフト一覧を読み込む
async function loadShiftRequests() {
    try {
        const { requests: requestsData } = await getCachedData();
        
        allRequests = requestsData;
        
        // フィルター適用
        let filteredRequests = [...allRequests];
        
        const filterDate = document.getElementById('filterDate').value;
        if (filterDate) {
            filteredRequests = filteredRequests.filter(req => req.date === filterDate);
        }
        
        const filterStatus = document.getElementById('filterStatus').value;
        if (filterStatus !== 'all') {
            filteredRequests = filteredRequests.filter(req => req.status === filterStatus);
        }
        
        // 日付順にソート（新しい順）
        filteredRequests.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        displayRequests(filteredRequests);
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('requestsList').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// 希望シフトを表示
function displayRequests(requests) {
    const container = document.getElementById('requestsList');
    
    if (requests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">-</div>
                <h3>希望シフトがありません</h3>
                <p>条件に合う希望シフトは見つかりませんでした</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = requests.map(req => `
        <div class="request-card">
            <div class="request-header">
                <span class="request-user">${req.user_name}</span>
                <span class="request-date">${formatDate(req.date)}</span>
            </div>
            <div class="request-time-slots">
                ${req.time_slots.map(slot => `<span class="time-slot-tag">${slot}</span>`).join('')}
            </div>
            ${req.notes ? `<div class="shift-notes">${req.notes}</div>` : ''}
            <div class="request-actions">
                ${req.status === 'pending' ? `
                    <button class="btn btn-success btn-small" onclick="approveRequest('${req.id}')">承認</button>
                    <button class="btn btn-primary btn-small" onclick="openEditModal('${req.id}')">調整</button>
                    <button class="btn btn-danger btn-small" onclick="deleteRequest('${req.id}')">削除</button>
                ` : `
                    <span class="shift-status status-approved">承認済み</span>
                    <button class="btn btn-secondary btn-small" onclick="unapproveRequest('${req.id}')">承認取消</button>
                    <button class="btn btn-danger btn-small" onclick="deleteRequest('${req.id}')">削除</button>
                `}
            </div>
        </div>
    `).join('');
}

// 希望シフトを承認
async function approveRequest(requestId) {
    try {
        // POST で承認処理（PUT/PATCH が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_approve.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: requestId,
                action: 'approve'
            })
        });
        
        if (response.ok) {
            showToast('希望シフトを承認しました', 'success');
            clearCache();
            loadShiftRequests();
        } else {
            const error = await response.json();
            throw new Error(error.error || '承認に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('承認に失敗しました: ' + error.message, 'error');
    }
}

// 承認を取り消す
async function unapproveRequest(requestId) {
    try {
        // POST で承認取り消し処理（PUT/PATCH が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_approve.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: requestId,
                action: 'unapprove'
            })
        });
        
        if (response.ok) {
            showToast('承認を取り消しました', 'success');
            clearCache();
            loadShiftRequests();
        } else {
            const error = await response.json();
            throw new Error(error.error || '承認取り消しに失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('承認取り消しに失敗しました', 'error');
    }
}

// 希望シフトを削除
async function deleteRequest(requestId) {
    if (!confirm('この希望シフトを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        // POST で削除処理（DELETE が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_update/delete/${requestId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: requestId,
                action: 'delete'
            })
        });
        
        if (response.ok || response.status === 204) {
            showToast('希望シフトを削除しました', 'success');
            clearCache();
            loadShiftRequests();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('削除に失敗しました: ' + error.message, 'error');
    }
}

// シフト調整モーダルを開く
function openEditModal(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    document.getElementById('editRequestId').value = requestId;
    
    // 時間帯を分解
    if (request.time_slots && request.time_slots.length > 0) {
        const [start, end] = request.time_slots[0].split('-');
        document.getElementById('editStartTime').value = start;
        document.getElementById('editEndTime').value = end;
    }
    
    document.getElementById('editNotes').value = request.notes || '';
    document.getElementById('editModal').style.display = 'flex';
}

// モーダルを閉じる
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 調整を保存してシフト作成
async function saveRequestEdit() {
    const requestId = document.getElementById('editRequestId').value;
    const startTime = document.getElementById('editStartTime').value;
    const endTime = document.getElementById('editEndTime').value;
    const notes = document.getElementById('editNotes').value;
    
    if (!startTime || !endTime) {
        showToast('時間を選択してください', 'error');
        return;
    }
    
    if (startTime >= endTime) {
        showToast('終了時刻は開始時刻より後にしてください', 'error');
        return;
    }
    
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    try {
        // シフトを作成
        const shiftData = {
            user_id: request.user_id,
            user_name: request.user_name,
            date: request.date,
            start_time: startTime,
            end_time: endTime,
            is_confirmed: true,
            notes: notes
        };
        
        const response = await fetch(API_BASE_URL + '/tables/shifts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(shiftData)
        });
        
        if (response.ok) {
            // 希望シフトを承認済みに更新（POST で）
            await fetch(`${API_BASE_URL}/tables/shift_requests_approve.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: requestId,
                    action: 'approve'
                })
            });
            
            showToast('シフトを作成しました！', 'success');
            clearCache();
            closeEditModal();
            loadShiftRequests();
            loadShifts();
        } else {
            throw new Error('作成に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの作成に失敗しました', 'error');
    }
}

// シフトを作成（承認済みの希望シフトとして保存）
async function createShift() {
    const userSelect = document.getElementById('shiftUser');
    const userId = userSelect.value;
    const userName = userSelect.options[userSelect.selectedIndex].dataset.name;
    const date = document.getElementById('shiftDate').value;
    const status = document.getElementById('shiftStatus').value; // 追加
    
    // 時・分から時刻を取得
    const startHour = document.getElementById('shiftStartHour').value;
    const startMin = document.getElementById('shiftStartMin').value;
    const endHour = document.getElementById('shiftEndHour').value;
    const endMin = document.getElementById('shiftEndMin').value;
    const startTime = getTimeString(startHour, startMin);
    const endTime = getTimeString(endHour, endMin);
    const notes = document.getElementById('shiftNotes').value;
    
    if (!userId || !date || !startTime || !endTime) {
        showToast('すべての必須項目を入力してください', 'error');
        return;
    }
    
    try {
        const shiftData = {
            user_id: userId,
            user_name: userName,
            date: date,
            time_slots: [`${startTime}-${endTime}`],
            status: status, // 変更: 選択されたステータスを使用
            notes: notes
        };
        
        const response = await fetch(API_BASE_URL + '/tables/shift_requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(shiftData)
        });
        
        if (response.ok) {
            showToast('シフトを作成しました！', 'success');
            clearCache();
            
            // フォームをリセット
            document.getElementById('shiftUser').value = '';
            document.getElementById('shiftDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('shiftStartHour').value = '';
            document.getElementById('shiftStartMin').value = '';
            document.getElementById('shiftEndHour').value = '';
            document.getElementById('shiftEndMin').value = '';
            document.getElementById('shiftStatus').value = 'approved'; // 追加: デフォルトに戻す
            document.getElementById('shiftNotes').value = '';
            
            // シフト一覧を更新
            loadShifts();
        } else {
            throw new Error('作成に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの作成に失敗しました', 'error');
    }
}

// シフト一覧を読み込む
async function loadShifts() {
    try {
        const { shifts: shiftsData } = await getCachedData();
        
        allShifts = shiftsData;
        
        // 選択された月でフィルター
        const filterMonth = document.getElementById('shiftFilterMonth').value;
        const filteredShifts = allShifts.filter(shift => 
            shift.date.startsWith(filterMonth) && shift.is_confirmed
        );
        
        displayShifts(filteredShifts);
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('shiftsList').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// シフト一覧を表示
function displayShifts(shifts) {
    const container = document.getElementById('shiftsList');
    
    if (shifts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">-</div>
                <h3>確定シフトがありません</h3>
                <p>選択された月の確定シフトはまだありません</p>
            </div>
        `;
        return;
    }
    
    // 日付順にソート
    shifts.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 日付ごとにグループ化
    const groupedByDate = {};
    shifts.forEach(shift => {
        if (!groupedByDate[shift.date]) {
            groupedByDate[shift.date] = [];
        }
        groupedByDate[shift.date].push(shift);
    });
    
    container.innerHTML = Object.entries(groupedByDate).map(([date, dateShifts]) => `
        <div style="margin-bottom: 30px;">
            <h3 style="color: #667eea; margin-bottom: 16px;">${formatDate(date)}</h3>
            ${dateShifts.map(shift => `
                <div class="shift-card">
                    <div class="shift-card-header">
                        <span class="shift-date">${shift.user_name}</span>
                        <button class="btn btn-danger btn-small" onclick="deleteShift('${shift.id}')">削除</button>
                    </div>
                    <div class="shift-time">${shift.start_time} - ${shift.end_time}</div>
                    ${shift.notes ? `<div class="shift-notes">${shift.notes}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

// シフトを削除
async function deleteShift(shiftId) {
    if (!confirm('このシフトを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        // POST で削除処理（DELETE が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shifts_update/delete/${shiftId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: shiftId,
                action: 'delete'
            })
        });
        
        if (response.ok || response.status === 204) {
            showToast('シフトを削除しました', 'success');
            clearCache();
            loadShifts();
            loadCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの削除に失敗しました: ' + error.message, 'error');
    }
}

// ユーザー一覧を読み込む
async function loadUsersList() {
    try {
        const { users: usersData } = await getCachedData();
        const result = { data: usersData };
        
        const users = result.data;
        const container = document.getElementById('usersList');
        
        container.innerHTML = '<h3 style="margin: 20px 0;">登録ユーザー一覧</h3>' + users.map(user => `
            <div class="request-card">
                <div class="request-header">
                    <span class="request-user">${user.name}</span>
                    <span>${user.role === 'admin' ? '管理者' : 'スタッフ'}</span>
                </div>
                <div style="margin: 8px 0;">パスワード: ${user.password}</div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-small" onclick="window.editUser('${user.id}')">編集</button>
                    <button class="btn btn-danger btn-small" onclick="window.deleteUser('${user.id}')">削除</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('エラー:', error);
    }
}



// 新規ユーザー追加モーダルを開く
function openAddUserModal() {
    document.getElementById('userModalTitle').textContent = '新しいユーザーを追加';
    document.getElementById('modalUserId').value = '';
    document.getElementById('modalUserName').value = '';
    document.getElementById('modalUserRole').value = 'staff';
    document.getElementById('modalUserPassword').value = '';
    document.getElementById('userEditModal').style.display = 'flex';
}

// ユーザー編集モーダルを開く
window.editUser = async function(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tables/users/${userId}`);
        const user = await response.json();
        
        document.getElementById('userModalTitle').textContent = 'ユーザー編集';
        document.getElementById('modalUserId').value = user.id;
        document.getElementById('modalUserName').value = user.name;
        document.getElementById('modalUserRole').value = user.role;
        document.getElementById('modalUserPassword').value = user.password;
        
        document.getElementById('userEditModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        showToast('ユーザー情報の読み込みに失敗しました', 'error');
    }
}

// ユーザー編集モーダルを閉じる
function closeUserEditModal() {
    document.getElementById('userEditModal').style.display = 'none';
}

// モーダルからユーザーを保存
async function saveUserFromModal() {
    const userId = document.getElementById('modalUserId').value;
    const name = document.getElementById('modalUserName').value;
    const role = document.getElementById('modalUserRole').value;
    const password = document.getElementById('modalUserPassword').value;
    
    if (!name || !password) {
        showToast('すべての項目を入力してください', 'error');
        return;
    }
    
    try {
        const userData = {
            name: name,
            role: role,
            password: password
        };
        
        let response;
        if (userId) {
            // 更新（POST で）
            response = await fetch(`${API_BASE_URL}/tables/users_update.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: userId,
                    name: name,
                    role: role,
                    password: password
                })
            });
            
            // ユーザー名が変更された場合、関連するシフトと希望シフトも更新
            if (response.ok) {
                await updateUserNameInShifts(userId, name);
            }
        } else {
            // 新規作成
            response = await fetch(API_BASE_URL + '/tables/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
        }
        
        if (response.ok) {
            showToast('ユーザーを保存しました', 'success');
            clearCache();
            closeUserEditModal();
            loadUsersList();
            loadUsers();
            loadShifts();
            loadShiftRequests();
            loadCalendar();
        } else {
            throw new Error('保存に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('ユーザーの保存に失敗しました', 'error');
    }
}

// シフトと希望シフトのユーザー名を更新
async function updateUserNameInShifts(userId, newName) {
    try {
        const [shiftsResponse, requestsResponse] = await Promise.all([
            fetch(API_BASE_URL + '/tables/shifts?limit=1000'),
            fetch(API_BASE_URL + '/tables/shift_requests?limit=1000')
        ]);
        
        const shiftsResult = await shiftsResponse.json();
        const requestsResult = await requestsResponse.json();
        
        const updatePromises = [];
        
        // シフトのユーザー名を更新（POST で）
        shiftsResult.data.forEach(shift => {
            if (shift.user_id === userId) {
                updatePromises.push(
                    fetch(`${API_BASE_URL}/tables/shifts_update.php`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: shift.id,
                            user_name: newName
                        })
                    })
                );
            }
        });
        
        // 希望シフトのユーザー名を更新（POST で）
        requestsResult.data.forEach(request => {
            if (request.user_id === userId) {
                updatePromises.push(
                    fetch(`${API_BASE_URL}/tables/shift_requests_update.php`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: request.id,
                            user_name: newName
                        })
                    })
                );
            }
        });
        
        await Promise.all(updatePromises);
    } catch (error) {
        console.error('シフトのユーザー名更新エラー:', error);
    }
}

// ユーザー削除
window.deleteUser = async function(userId) {
    if (!confirm('このユーザーを削除してもよろしいですか？\n関連するシフトと希望シフトもすべて削除されます。')) {
        return;
    }
    
    try {
        // ユーザーに関連するシフトを取得
        const [shiftsResponse, requestsResponse] = await Promise.all([
            fetch(API_BASE_URL + '/tables/shifts?limit=1000'),
            fetch(API_BASE_URL + '/tables/shift_requests?limit=1000')
        ]);
        
        const shiftsResult = await shiftsResponse.json();
        const requestsResult = await requestsResponse.json();
        
        // ユーザーに関連するシフトと希望シフトを削除
        const userShifts = shiftsResult.data.filter(s => s.user_id === userId);
        const userRequests = requestsResult.data.filter(r => r.user_id === userId);
        
        const deletePromises = [];
        
        // POST で削除処理（DELETE が使えないため）
        userShifts.forEach(shift => {
            deletePromises.push(
                fetch(`${API_BASE_URL}/tables/shifts_update/delete/${shift.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: shift.id, action: 'delete' })
                })
            );
        });
        
        userRequests.forEach(request => {
            deletePromises.push(
                fetch(`${API_BASE_URL}/tables/shift_requests_update/delete/${request.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: request.id, action: 'delete' })
                })
            );
        });
        
        await Promise.all(deletePromises);
        
        // ユーザーを削除（POST で）
        const response = await fetch(`${API_BASE_URL}/tables/users_update/delete/${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: userId, action: 'delete' })
        });
        
        if (response.ok || response.status === 204) {
            showToast('ユーザーと関連データを削除しました', 'success');
            clearCache();
            loadUsersList();
            loadUsers();
            loadShifts();
            loadShiftRequests();
            loadCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('ユーザーの削除に失敗しました', 'error');
    }
}

// カレンダーを読み込む
async function loadCalendar() {
    try {
        const calendarMonth = document.getElementById('calendarMonth').value;
        const [year, month] = calendarMonth.split('-').map(Number);
        
        // キャッシュからデータを取得
        const { requests: requestsData, shifts: shiftsData } = await getCachedData();
        
        // 未承認の希望シフトをフィルター
        const pendingRequests = requestsData.filter(req => 
            req.status === 'pending' &&
            req.date.startsWith(calendarMonth)
        );
        
        // 承認済みの希望シフトと確定シフトを結合
        const approvedRequests = requestsData.filter(req => 
            req.status === 'approved' &&
            req.date.startsWith(calendarMonth)
        );
        
        const confirmedShifts = shiftsData.filter(shift => 
            shift.is_confirmed &&
            shift.date.startsWith(calendarMonth)
        );
        
        // 未承認カレンダーを生成
        const pendingContainer = document.getElementById('pendingCalendarView');
        pendingContainer.innerHTML = generateRequestCalendar(year, month, pendingRequests);
        
        // 承認済みカレンダーを生成（希望シフトと確定シフトを統合）
        const approvedContainer = document.getElementById('approvedCalendarView');
        approvedContainer.innerHTML = generateApprovedCalendar(year, month, approvedRequests, confirmedShifts);
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('pendingCalendarView').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
        document.getElementById('approvedCalendarView').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// 未承認希望シフトのカレンダー生成
function generateRequestCalendar(year, month, requests) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    let html = `<div class="calendar-header">${year}年${month}月</div>`;
    html += '<div class="calendar-grid">';
    
    // 曜日ヘッダー
    dayNames.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // 空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // 日付セル
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const cellDate = new Date(year, month - 1, day);
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6; // 土日判定
        const dayRequests = requests.filter(r => r.date === dateStr);
        
        const classNames = ['calendar-day'];
        if (isWeekend) {
            classNames.push('weekend');
        } else if (dayRequests.length > 0) {
            classNames.push('has-shift');
        }
        
        html += `<div class="${classNames.join(' ')}">`;
        html += `<div class="day-number">${day}</div>`;
        
        if (dayRequests.length > 0) {
            dayRequests.forEach(req => {
                const timeSlot = req.time_slots && req.time_slots.length > 0 ? req.time_slots[0] : '';
                // 未承認シフトは黄色で表示
                html += `<div class="shift-info request-pending" style="cursor: pointer;" onclick="openRequestDetail('${req.id}')">${req.user_name} ${timeSlot}</div>`;
            });
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// 承認済み・確定シフトのカレンダー生成
function generateApprovedCalendar(year, month, approvedRequests, confirmedShifts) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    let html = `<div class="calendar-header">${year}年${month}月</div>`;
    html += '<div class="calendar-grid">';
    
    // 曜日ヘッダー
    dayNames.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // 空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // 日付セル
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const cellDate = new Date(year, month - 1, day);
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6; // 土日判定
        
        // 承認済み希望シフト
        const dayApprovedRequests = approvedRequests.filter(r => r.date === dateStr);
        
        // 確定シフト
        const dayConfirmedShifts = confirmedShifts.filter(s => s.date === dateStr);
        
        const hasData = dayApprovedRequests.length > 0 || dayConfirmedShifts.length > 0;
        
        const classNames = ['calendar-day'];
        if (isWeekend) {
            classNames.push('weekend');
        } else if (hasData) {
            classNames.push('has-shift');
        } else {
            classNames.push('clickable-empty');
        }
        
        html += `<div class="${classNames.join(' ')}" onclick="${!hasData && !isWeekend ? `openGeneralQuickCreate('${dateStr}')` : ''}" style="${!hasData && !isWeekend ? 'cursor: pointer;' : ''}">`;
        html += `<div class="day-number">${day}</div>`;
        
        // 承認済み希望シフトを表示（緑色）
        if (dayApprovedRequests.length > 0) {
            dayApprovedRequests.forEach(req => {
                const timeSlot = req.time_slots && req.time_slots.length > 0 ? req.time_slots[0] : '';
                html += `<div class="shift-info shift-confirmed" style="cursor: pointer;" onclick="event.stopPropagation(); openRequestDetail('${req.id}')">${req.user_name} ${timeSlot}</div>`;
            });
        }
        
        // 確定シフトを表示（緑色）
        if (dayConfirmedShifts.length > 0) {
            dayConfirmedShifts.forEach(shift => {
                html += `<div class="shift-info shift-confirmed" style="cursor: pointer;" onclick="event.stopPropagation(); window.openShiftEdit('${shift.id}')">${shift.user_name} ${shift.start_time}-${shift.end_time}</div>`;
            });
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// シフト管理カレンダーを読み込む
async function loadManagementCalendar() {
    try {
        const month = document.getElementById('mgmtMonth').value;
        const staffId = document.getElementById('mgmtStaff').value;
        
        if (!month || !staffId) {
            document.getElementById('managementCalendarView').innerHTML = '<p style="text-align: center; color: #6c757d; padding: 40px;">月とスタッフを選択してください</p>';
            document.getElementById('weeklyTotals').innerHTML = '';
            return;
        }
        
        const [year, monthNum] = month.split('-').map(Number);
        
        // キャッシュからデータ取得
        const { requests: requestsData, shifts: shiftsData } = await getCachedData();
        
        // フィルター
        const staffRequests = requestsData.filter(r => 
            r.user_id === staffId && r.date.startsWith(month)
        );
        const staffShifts = shiftsData.filter(s => 
            s.user_id === staffId && s.is_confirmed && s.date.startsWith(month)
        );
        
        // カレンダー生成
        const calendarHTML = generateManagementCalendar(year, monthNum, staffRequests, staffShifts);
        document.getElementById('managementCalendarView').innerHTML = calendarHTML;
        
        // 週ごとの合計計算
        calculateWeeklyTotals(year, monthNum, staffRequests, staffShifts);
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('managementCalendarView').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// シフト管理カレンダー生成
function generateManagementCalendar(year, month, requests, shifts) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    let html = `<div class="calendar-header">${year}年${month}月</div>`;
    html += '<div class="calendar-grid">';
    
    // 曜日ヘッダー
    dayNames.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // 空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // 日付セル
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const cellDate = new Date(year, month - 1, day);
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6; // 土日判定
        const dayRequests = requests.filter(r => r.date === dateStr);
        const dayShifts = shifts.filter(s => s.date === dateStr);
        
        const hasData = dayRequests.length > 0 || dayShifts.length > 0;
        
        const classNames = ['calendar-day'];
        if (isWeekend) {
            classNames.push('weekend');
        } else if (hasData) {
            classNames.push('has-shift');
        } else {
            classNames.push('clickable-empty');
        }
        
        html += `<div class="${classNames.join(' ')}" onclick="${!hasData && !isWeekend ? `openQuickCreateForDate('${dateStr}')` : ''}" style="${!hasData && !isWeekend ? 'cursor: pointer;' : ''}">`;
        html += `<div class="day-number">${day}</div>`;
        
        // 未承認シフト（黄色）を先に表示
        dayRequests.filter(req => req.status === 'pending').forEach(req => {
            const timeSlot = req.time_slots && req.time_slots.length > 0 ? req.time_slots[0] : '';
            html += `<div class="shift-info request-pending" style="cursor: pointer;" onclick="event.stopPropagation(); openMgmtModal('request', '${req.id}')">${timeSlot} (未)</div>`;
        });
        
        // 承認済みシフト（緑）
        dayRequests.filter(req => req.status === 'approved').forEach(req => {
            const timeSlot = req.time_slots && req.time_slots.length > 0 ? req.time_slots[0] : '';
            html += `<div class="shift-info shift-confirmed" style="cursor: pointer;" onclick="event.stopPropagation(); openMgmtModal('request', '${req.id}')">${timeSlot} (承認)</div>`;
        });
        
        // 確定シフト（赤→緑に変更済み）
        dayShifts.forEach(shift => {
            html += `<div class="shift-info shift-confirmed" style="cursor: pointer;" onclick="event.stopPropagation(); openMgmtModal('shift', '${shift.id}')">${shift.start_time}-${shift.end_time}</div>`;
        });
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// 週ごとの合計時間を計算（日曜始まり）
function calculateWeeklyTotals(year, month, requests, shifts) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    
    const weeks = [];
    let currentWeek = { start: null, end: null, requestHours: 0, confirmedHours: 0 };
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const dayOfWeek = date.getDay();
        
        // 日曜日（週の始まり）または最初の日
        if (dayOfWeek === 0 || day === 1) {
            if (currentWeek.start !== null) {
                // 前の週を保存
                currentWeek.end = day - 1;
                weeks.push({ ...currentWeek });
            }
            currentWeek = { start: day, end: null, requestHours: 0, confirmedHours: 0 };
        }
        
        // その日の希望シフト（未承認）の時間を計算
        requests.filter(r => r.date === dateStr && r.status === 'pending').forEach(req => {
            if (req.time_slots && req.time_slots.length > 0) {
                const [start, end] = req.time_slots[0].split('-');
                currentWeek.requestHours += calculateHours(start, end);
            }
        });
        
        // その日の確定シフト（承認済み）の時間を計算
        requests.filter(r => r.date === dateStr && r.status === 'approved').forEach(req => {
            if (req.time_slots && req.time_slots.length > 0) {
                const [start, end] = req.time_slots[0].split('-');
                currentWeek.confirmedHours += calculateHours(start, end);
            }
        });
        
        // shifts テーブルのシフトもカウント（もしあれば）
        shifts.filter(s => s.date === dateStr).forEach(shift => {
            currentWeek.confirmedHours += calculateHours(shift.start_time, shift.end_time);
        });
        
        // 土曜日または月末で週を終了
        if (dayOfWeek === 6 || day === daysInMonth) {
            currentWeek.end = day;
            weeks.push({ ...currentWeek });
            currentWeek = { start: null, end: null, requestHours: 0, confirmedHours: 0 };
        }
    }
    
    // 週ごとの合計表示（コンパクト版）
    let html = '<div class="weekly-totals">';
    weeks.forEach((week, index) => {
        html += `
            <div class="week-total-card">
                <h4>第${index + 1}週 ${week.start}日-${week.end}日</h4>
                <div class="week-total-item">
                    <span class="week-total-label">未承認</span>
                    <span class="week-total-value request">${week.requestHours.toFixed(1)}h</span>
                </div>
                <div class="week-total-item">
                    <span class="week-total-label">承認済み</span>
                    <span class="week-total-value confirmed">${week.confirmedHours.toFixed(1)}h</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    
    document.getElementById('weeklyTotals').innerHTML = html;
}

// 時間計算
function calculateHours(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    return (endMinutes - startMinutes) / 60;
}

// シフト管理モーダルを開く
async function openMgmtModal(type, id) {
    try {
        let data;
        if (type === 'request') {
            const response = await fetch(`${API_BASE_URL}/tables/shift_requests/${id}`);
            data = await response.json();
            
            document.getElementById('mgmtModalTitle').textContent = '希望シフト管理';
            document.getElementById('mgmtItemType').value = 'request';
            document.getElementById('mgmtItemId').value = data.id;
            
            const timeSlot = data.time_slots && data.time_slots.length > 0 ? data.time_slots[0] : '';
            const [start, end] = timeSlot.split('-');
            setHourMin(start || '', 'mgmtStartHour', 'mgmtStartMin');
            setHourMin(end || '', 'mgmtEndHour', 'mgmtEndMin');
            document.getElementById('mgmtNotes').value = data.notes || '';
            
            document.getElementById('mgmtShiftInfo').innerHTML = `
                <p><strong>日付:</strong> ${data.date}</p>
                <p><strong>ステータス:</strong> ${data.status === 'approved' ? '承認済み' : '未承認'}</p>
            `;
            
            if (data.status === 'pending') {
                document.getElementById('mgmtApproveBtn').style.display = 'inline-block';
                document.getElementById('mgmtUnapproveBtn').style.display = 'none';
            } else {
                document.getElementById('mgmtApproveBtn').style.display = 'none';
                document.getElementById('mgmtUnapproveBtn').style.display = 'inline-block';
            }
            
            document.getElementById('mgmtDeleteBtn').style.display = 'inline-block';
        } else {
            const response = await fetch(`${API_BASE_URL}/tables/shifts/${id}`);
            data = await response.json();
            
            document.getElementById('mgmtModalTitle').textContent = '確定シフト管理';
            document.getElementById('mgmtItemType').value = 'shift';
            document.getElementById('mgmtItemId').value = data.id;
            
            setHourMin(data.start_time || '', 'mgmtStartHour', 'mgmtStartMin');
            setHourMin(data.end_time || '', 'mgmtEndHour', 'mgmtEndMin');
            document.getElementById('mgmtNotes').value = data.notes || '';
            
            document.getElementById('mgmtShiftInfo').innerHTML = `
                <p><strong>日付:</strong> ${data.date}</p>
                <p><strong>ステータス:</strong> 確定済み</p>
            `;
            
            document.getElementById('mgmtApproveBtn').style.display = 'none';
            document.getElementById('mgmtUnapproveBtn').style.display = 'none';
            
            document.getElementById('mgmtDeleteBtn').style.display = 'inline-block';
        }
        
        document.getElementById('mgmtModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        showToast('データの読み込みに失敗しました', 'error');
    }
}

// シフト管理モーダルを閉じる
function closeMgmtModal() {
    document.getElementById('mgmtModal').style.display = 'none';
}

// 空白日クリックでクイック作成モーダルを開く
function openQuickCreateForDate(dateStr) {
    const staffId = document.getElementById('mgmtStaff').value;
    
    if (!staffId) {
        showToast('スタッフを選択してください', 'error');
        return;
    }
    
    const staffName = document.getElementById('mgmtStaff').options[document.getElementById('mgmtStaff').selectedIndex].text;
    
    document.getElementById('quickCreateDate').value = dateStr;
    document.getElementById('quickCreateUserId').value = staffId;
    document.getElementById('quickCreateDateDisplay').textContent = dateStr;
    document.getElementById('quickCreateUserDisplay').textContent = staffName;
    document.getElementById('quickNotes').value = '';
    document.getElementById('quickCreateType').value = 'approved';
    
    // 時・分のオプションを生成
    generateHourMinOptions('quickStartHour', 'quickStartMin');
    generateHourMinOptions('quickEndHour', 'quickEndMin');
    
    document.getElementById('quickCreateModal').style.display = 'flex';
}

// クイック作成モーダルを閉じる
function closeQuickCreateModal() {
    document.getElementById('quickCreateModal').style.display = 'none';
}

// クイック作成を保存
async function saveQuickCreate() {
    const date = document.getElementById('quickCreateDate').value;
    const userId = document.getElementById('quickCreateUserId').value;
    const userName = document.getElementById('quickCreateUserDisplay').textContent;
    const type = document.getElementById('quickCreateType').value;
    
    // 時・分から時刻を取得
    const startHour = document.getElementById('quickStartHour').value;
    const startMin = document.getElementById('quickStartMin').value;
    const endHour = document.getElementById('quickEndHour').value;
    const endMin = document.getElementById('quickEndMin').value;
    const startTime = getTimeString(startHour, startMin);
    const endTime = getTimeString(endHour, endMin);
    const notes = document.getElementById('quickNotes').value;
    
    if (!startTime || !endTime) {
        showToast('時間を入力してください', 'error');
        return;
    }
    
    try {
        // すべて shift_requests テーブルに保存（承認済み or 未承認）
        const requestData = {
            user_id: userId,
            user_name: userName,
            date: date,
            time_slots: [`${startTime}-${endTime}`],
            status: type, // 'approved' or 'pending'
            notes: notes
        };
        
        await fetch(API_BASE_URL + '/tables/shift_requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        showToast('作成しました', 'success');
        closeQuickCreateModal();
        loadManagementCalendar();
    } catch (error) {
        console.error('エラー:', error);
        showToast('作成に失敗しました', 'error');
    }
}

// シフトを保存
async function saveMgmtShift() {
    const type = document.getElementById('mgmtItemType').value;
    const id = document.getElementById('mgmtItemId').value;
    
    // 時・分から時刻を取得
    const startHour = document.getElementById('mgmtStartHour').value;
    const startMin = document.getElementById('mgmtStartMin').value;
    const endHour = document.getElementById('mgmtEndHour').value;
    const endMin = document.getElementById('mgmtEndMin').value;
    const startTime = getTimeString(startHour, startMin);
    const endTime = getTimeString(endHour, endMin);
    const notes = document.getElementById('mgmtNotes').value;
    
    if (!startTime || !endTime) {
        showToast('時間を入力してください', 'error');
        return;
    }
    
    try {
        if (type === 'request') {
            // 希望シフトの更新（POST で）
            await fetch(`${API_BASE_URL}/tables/shift_requests_update.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    time_slots: [`${startTime}-${endTime}`],
                    notes: notes
                })
            });
        } else {
            // シフトの更新（POST で）
            await fetch(`${API_BASE_URL}/tables/shifts_update.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id,
                    start_time: startTime,
                    end_time: endTime,
                    notes: notes
                })
            });
        }
        
        showToast('保存しました', 'success');
        closeMgmtModal();
        loadManagementCalendar();
    } catch (error) {
        console.error('エラー:', error);
        showToast('保存に失敗しました', 'error');
    }
}

// 承認
async function approveMgmtRequest() {
    const id = document.getElementById('mgmtItemId').value;
    
    try {
        // POST で承認処理
        await fetch(`${API_BASE_URL}/tables/shift_requests_approve.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: id,
                action: 'approve'
            })
        });
        
        showToast('承認しました', 'success');
        clearCache();
        closeMgmtModal();
        loadManagementCalendar();
        loadShiftRequests();
    } catch (error) {
        console.error('エラー:', error);
        showToast('承認に失敗しました', 'error');
    }
}

// 承認取消
async function unapproveMgmtRequest() {
    const id = document.getElementById('mgmtItemId').value;
    
    try {
        // POST で承認取り消し処理（PUT/PATCH が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_update/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: id,
                status: 'pending' 
            })
        });
        
        if (response.ok) {
            showToast('承認を取り消しました', 'success');
            clearCache();
            closeMgmtModal();
            loadManagementCalendar();
            loadShiftRequests();
        } else {
            throw new Error('承認取り消しに失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('承認取消に失敗しました: ' + error.message, 'error');
    }
}

// 削除
async function deleteMgmtItem() {
    const type = document.getElementById('mgmtItemType').value;
    const id = document.getElementById('mgmtItemId').value;
    
    if (!confirm('削除してもよろしいですか？')) {
        return;
    }
    
    try {
        // POST で削除処理（DELETE が使えないため）
        const endpoint = type === 'request' ? 'shift_requests_update' : 'shifts_update';
        const response = await fetch(`${API_BASE_URL}/tables/${endpoint}/delete/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                id: id,
                action: 'delete'
            })
        });
        
        if (response.ok || response.status === 204) {
            showToast('削除しました', 'success');
            clearCache();
            closeMgmtModal();
            loadManagementCalendar();
            loadShiftRequests();
            loadShifts();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('削除に失敗しました: ' + error.message, 'error');
    }
}

// タブ切り替え
function switchTab(tabName) {
    // タブボタンのアクティブ状態を切り替え
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // クリックされたタブをアクティブにする
    const tabs = document.querySelectorAll('.tab');
    const tabMap = {
        'management': 0,
        'requests': 1,
        'shifts': 2,
        'users': 3,
        'calendar': 4
    };
    tabs[tabMap[tabName]].classList.add('active');
    
    // タブコンテンツの表示を切り替え
    document.getElementById('managementTab').style.display = tabName === 'management' ? 'block' : 'none';
    document.getElementById('requestsTab').style.display = tabName === 'requests' ? 'block' : 'none';
    document.getElementById('shiftsTab').style.display = tabName === 'shifts' ? 'block' : 'none';
    document.getElementById('usersTab').style.display = tabName === 'users' ? 'block' : 'none';
    document.getElementById('calendarTab').style.display = tabName === 'calendar' ? 'block' : 'none';
}

// 日付フォーマット
function formatDate(dateString) {
    const date = new Date(dateString);
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const dayOfWeek = days[date.getDay()];
    
    return `${month}月${day}日（${dayOfWeek}）`;
}

// シフト編集モーダルを開く
window.openShiftEdit = async function(shiftId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shifts/${shiftId}`);
        const shift = await response.json();
        
        document.getElementById('editShiftId').value = shift.id;
        document.getElementById('editShiftDate').value = shift.date;
        document.getElementById('editShiftStartTime').value = shift.start_time;
        document.getElementById('editShiftEndTime').value = shift.end_time;
        document.getElementById('editShiftNotes').value = shift.notes || '';
        
        // スタッフ一覧をセット
        const select = document.getElementById('editShiftUser');
        select.innerHTML = '<option value="">選択してください</option>';
        allUsers.filter(u => u.role === 'staff').forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name;
            option.dataset.name = user.name;
            if (user.id === shift.user_id) {
                option.selected = true;
            }
            select.appendChild(option);
        });
        
        document.getElementById('shiftEditModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフト情報の読み込みに失敗しました', 'error');
    }
}

// シフト編集モーダルを閉じる
function closeShiftEditModal() {
    document.getElementById('shiftEditModal').style.display = 'none';
}

// シフト編集を保存
async function saveShiftEdit() {
    const shiftId = document.getElementById('editShiftId').value;
    const userSelect = document.getElementById('editShiftUser');
    const userId = userSelect.value;
    const userName = userSelect.options[userSelect.selectedIndex].dataset.name;
    const date = document.getElementById('editShiftDate').value;
    const startTime = document.getElementById('editShiftStartTime').value;
    const endTime = document.getElementById('editShiftEndTime').value;
    const notes = document.getElementById('editShiftNotes').value;
    
    if (!userId || !date || !startTime || !endTime) {
        showToast('すべての必須項目を入力してください', 'error');
        return;
    }
    
    try {
        const shiftData = {
            user_id: userId,
            user_name: userName,
            date: date,
            start_time: startTime,
            end_time: endTime,
            is_confirmed: true,
            notes: notes
        };
        
        // POST で更新（PUT が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shifts_update.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: shiftId,
                user_id: userId,
                user_name: userName,
                date: date,
                start_time: startTime,
                end_time: endTime,
                is_confirmed: true,
                notes: notes
            })
        });
        
        if (response.ok) {
            showToast('シフトを更新しました', 'success');
            closeShiftEditModal();
            loadShifts();
            loadCalendar();
        } else {
            const error = await response.json();
            throw new Error(error.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの更新に失敗しました', 'error');
    }
}

// モーダルからシフトを削除
async function deleteShiftFromModal() {
    const shiftId = document.getElementById('editShiftId').value;
    
    if (!confirm('このシフトを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        // POST で削除処理（DELETE が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shifts_update/delete/${shiftId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: shiftId,
                action: 'delete'
            })
        });
        
        if (response.ok || response.status === 204) {
            showToast('シフトを削除しました', 'success');
            closeShiftEditModal();
            loadShifts();
            loadCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの削除に失敗しました', 'error');
    }
}

// 希望シフト詳細を開く（未承認・承認済み両方）
function openRequestDetail(requestId) {
    const request = allRequests.find(r => r.id === requestId);
    if (!request) return;
    
    alert(`希望シフト詳細\n\nスタッフ: ${request.user_name}\n日付: ${request.date}\n時間: ${request.time_slots.join(', ')}\nステータス: ${request.status === 'approved' ? '承認済み' : '未承認'}\n備考: ${request.notes || 'なし'}`);
}

// カレンダータブから空白日クリック
function openGeneralQuickCreate(dateStr) {
    document.getElementById('generalQuickDate').value = dateStr;
    document.getElementById('generalQuickDateDisplay').textContent = dateStr;
    
    // スタッフ一覧をセット
    const select = document.getElementById('generalQuickStaff');
    select.innerHTML = '<option value="">選択してください</option>';
    allUsers.filter(u => u.role === 'staff').forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name;
        option.dataset.name = user.name;
        select.appendChild(option);
    });
    
    // 時・分のオプションを生成
    generateHourMinOptions('generalQuickStartHour', 'generalQuickStartMin');
    generateHourMinOptions('generalQuickEndHour', 'generalQuickEndMin');
    
    document.getElementById('generalQuickNotes').value = '';
    document.getElementById('generalQuickType').value = 'approved';
    
    document.getElementById('generalQuickCreateModal').style.display = 'flex';
}

// カレンダータブ用モーダルを閉じる
function closeGeneralQuickCreateModal() {
    document.getElementById('generalQuickCreateModal').style.display = 'none';
}

// カレンダータブ用クイック作成を保存
async function saveGeneralQuickCreate() {
    const date = document.getElementById('generalQuickDate').value;
    const userSelect = document.getElementById('generalQuickStaff');
    const userId = userSelect.value;
    const userName = userSelect.options[userSelect.selectedIndex].dataset.name;
    const type = document.getElementById('generalQuickType').value;
    
    // 時・分から時刻を取得
    const startHour = document.getElementById('generalQuickStartHour').value;
    const startMin = document.getElementById('generalQuickStartMin').value;
    const endHour = document.getElementById('generalQuickEndHour').value;
    const endMin = document.getElementById('generalQuickEndMin').value;
    const startTime = getTimeString(startHour, startMin);
    const endTime = getTimeString(endHour, endMin);
    const notes = document.getElementById('generalQuickNotes').value;
    
    if (!userId) {
        showToast('スタッフを選択してください', 'error');
        return;
    }
    
    if (!startTime || !endTime) {
        showToast('時間を入力してください', 'error');
        return;
    }
    
    try {
        // すべて shift_requests テーブルに保存（承認済み or 未承認）
        const requestData = {
            user_id: userId,
            user_name: userName,
            date: date,
            time_slots: [`${startTime}-${endTime}`],
            status: type, // 'approved' or 'pending'
            notes: notes
        };
        
        await fetch(API_BASE_URL + '/tables/shift_requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        
        showToast('作成しました', 'success');
        closeGeneralQuickCreateModal();
        loadCalendar();
    } catch (error) {
        console.error('エラー:', error);
        showToast('作成に失敗しました', 'error');
    }
}

// ログアウト
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}
