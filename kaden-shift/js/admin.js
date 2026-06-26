// 管理者ページの処理

// APIベースURL
const API_BASE_URL = 'https://thriving-surprise-production-c740.up.railway.app';

// 日本の祝日 (2025-2027)。振替休日・国民の休日も含む。
// 必要に応じて毎年追記。
const JP_HOLIDAYS = new Set([
    // 2025
    '2025-01-01', '2025-01-13', '2025-02-11', '2025-02-23', '2025-02-24',
    '2025-03-20', '2025-04-29', '2025-05-03', '2025-05-04', '2025-05-05', '2025-05-06',
    '2025-07-21', '2025-08-11', '2025-09-15', '2025-09-23', '2025-10-13',
    '2025-11-03', '2025-11-23', '2025-11-24',
    // 2026
    '2026-01-01', '2026-01-12', '2026-02-11', '2026-02-23', '2026-03-20',
    '2026-04-29', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
    '2026-07-20', '2026-08-11', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-10-12', '2026-11-03', '2026-11-23',
    // 2027
    '2027-01-01', '2027-01-11', '2027-02-11', '2027-02-23', '2027-03-21', '2027-03-22',
    '2027-04-29', '2027-05-03', '2027-05-04', '2027-05-05',
    '2027-07-19', '2027-08-11', '2027-09-20', '2027-09-23',
    '2027-10-11', '2027-11-03', '2027-11-23',
]);

function isJapaneseHoliday(dateStr) {
    return JP_HOLIDAYS.has(dateStr);
}

function isOffDay(cellDate, dateStr) {
    const dow = cellDate.getDay();
    return dow === 0 || dow === 6 || isJapaneseHoliday(dateStr);
}

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
    const shiftFilterMonthEl = document.getElementById('shiftFilterMonth');
    if (shiftFilterMonthEl) shiftFilterMonthEl.value = thisMonth;
    document.getElementById('calendarMonth').value = thisMonth;
    document.getElementById('mgmtMonth').value = thisMonth;

    // シフト未提出者タブ: デフォルト期間（今月前半）
    setUnsubmittedPreset('this-first', false);
    
    // 時間・分の選択肢を生成
    initializeAllHourMinOptions();
    
    // 初期データ読み込み（並列化）
    await loadUsers();
    await Promise.all([
        loadShiftRequests(),
        loadShifts(),
        loadUsersList(),
        loadCalendar()
    ]);
    
    // シフト管理タブの初期化
    const mgmtStaffSelect = document.getElementById('mgmtStaff');
    const periodStaffSelect = document.getElementById('periodStaff');
    allUsers.filter(u => u.role === 'staff').forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.name;
        mgmtStaffSelect.appendChild(option);

        const option2 = document.createElement('option');
        option2.value = user.id;
        option2.textContent = user.name;
        periodStaffSelect.appendChild(option2);
    });

    // 期間集計のデフォルト: 今月1日〜末日
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.getElementById('periodStart').value = firstDay.toISOString().split('T')[0];
    document.getElementById('periodEnd').value = lastDay.toISOString().split('T')[0];
});

// 時間・分の選択肢を生成（9～18時、0・15・30・45分）
// 時・分のオプションを生成する汎用関数
function generateHourMinOptions(hourSelectId, minSelectId) {
    const hourSelect = document.getElementById(hourSelectId);
    const minSelect = document.getElementById(minSelectId);
    
    if (!hourSelect || !minSelect) return;
    
    // 時間の選択肢（9～18）
    const hours = [];
    for (let h = 9; h <= 18; h++) {
        hours.push(h);
    }
    
    // 分の選択肢（0, 15, 30, 45）
    const minutes = ['00', '15', '30', '45'];
    
    // 時間のオプションを生成
    hourSelect.innerHTML = '<option value="">時</option>';
    hours.forEach(h => {
        const option = document.createElement('option');
        option.value = h.toString().padStart(2, '0');
        option.textContent = h + '時';
        hourSelect.appendChild(option);
    });
    
    // 分のオプションを生成
    minSelect.innerHTML = '<option value="">分</option>';
    minutes.forEach(m => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m + '分';
        minSelect.appendChild(option);
    });
}

// 初期化時にすべての時・分選択を生成
function initializeAllHourMinOptions() {
    // シフト作成用
    generateHourMinOptions('shiftStartHour', 'shiftStartMin');
    generateHourMinOptions('shiftEndHour', 'shiftEndMin');
    
    // シフト管理用
    generateHourMinOptions('mgmtStartHour', 'mgmtStartMin');
    generateHourMinOptions('mgmtEndHour', 'mgmtEndMin');
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
        fetch(API_BASE_URL + '/tables/shifts?limit=10000'),
        fetch(API_BASE_URL + '/tables/shift_requests?limit=10000')
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
        
        // スタッフのみをセレクトボックスに追加（シフト作成タブが残っている場合のみ）
        const staffUsers = allUsers.filter(user => user.role === 'staff');
        const select = document.getElementById('shiftUser');
        if (select) {
            select.innerHTML = '<option value="">選択してください</option>';
            staffUsers.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.name;
                option.dataset.name = user.name;
                select.appendChild(option);
            });
        }
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

// シフト一覧を読み込む（UI 要素が無ければデータ更新のみ）
async function loadShifts() {
    try {
        const { shifts: shiftsData } = await getCachedData();

        allShifts = shiftsData;

        // 表示UI が無い場合はキャッシュ更新だけで終了
        const filterMonthEl = document.getElementById('shiftFilterMonth');
        const listEl = document.getElementById('shiftsList');
        if (!filterMonthEl || !listEl) return;

        // 選択された月でフィルター
        const filterMonth = filterMonthEl.value;
        const filteredShifts = allShifts.filter(shift =>
            shift.date.startsWith(filterMonth) && shift.is_confirmed
        );

        displayShifts(filteredShifts);
    } catch (error) {
        console.error('エラー:', error);
        const listEl = document.getElementById('shiftsList');
        if (listEl) listEl.innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
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
        
        container.innerHTML = '<h3 style="margin: 20px 0;">登録ユーザー一覧</h3>' + users.map(user => {
            const isRetired = !!user.retirement_date;
            const retiredBadge = isRetired
                ? `<span style="background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 999px; font-size: 12px; margin-left: 8px;">退職 (${user.retirement_date})</span>`
                : '';
            return `
            <div class="request-card" ${isRetired ? 'style="opacity: 0.7;"' : ''}>
                <div class="request-header">
                    <span class="request-user">${user.name}${retiredBadge}</span>
                    <span>${user.role === 'admin' ? '管理者' : 'スタッフ'}</span>
                </div>
                <div style="margin: 8px 0; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center;">
                    <span>パスワード: ${user.password}</span>
                    <span style="color: #6c757d; font-size: 13px;">
                        入社日: ${user.hire_date ? user.hire_date : '<span style="color: #adb5bd;">未設定</span>'}
                    </span>
                </div>
                <div class="request-actions">
                    <button class="btn btn-primary btn-small" onclick="window.editUser('${user.id}')">編集</button>
                    <button class="btn btn-danger btn-small" onclick="window.openRetirementModal('${user.id}', '${(user.name || '').replace(/'/g, "\\'")}', '${user.retirement_date || ''}')">${isRetired ? '退職日変更' : '退職'}</button>
                    <button class="btn btn-secondary btn-small" onclick="window.deleteUser('${user.id}')">削除</button>
                </div>
            </div>
            `;
        }).join('');
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
    document.getElementById('modalUserHireDate').value = '';
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
        document.getElementById('modalUserHireDate').value = user.hire_date || '';

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
    const hireDate = document.getElementById('modalUserHireDate').value || null;

    if (!name || !password) {
        showToast('すべての項目を入力してください', 'error');
        return;
    }

    try {
        const userData = {
            name: name,
            role: role,
            password: password,
            hire_date: hireDate
        };

        let response;
        if (userId) {
            // 更新 (PATCH 使用 — hire_date 含む任意フィールドが渡せる)
            response = await fetch(`${API_BASE_URL}/tables/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name,
                    role: role,
                    password: password,
                    hire_date: hireDate
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

// ===== 退職処理 =====
window.openRetirementModal = function(userId, userName, currentDate) {
    document.getElementById('retirementUserId').value = userId;
    document.getElementById('retirementUserName').textContent = userName;
    // 既に退職日が入っていればその値、なければ今日
    const today = new Date();
    const defaultDate = currentDate || today.toISOString().slice(0, 10);
    document.getElementById('retirementDate').value = defaultDate;
    document.getElementById('retirementModal').style.display = 'flex';
};

function closeRetirementModal() {
    document.getElementById('retirementModal').style.display = 'none';
}

async function confirmRetirement() {
    const userId = document.getElementById('retirementUserId').value;
    const retirementDate = document.getElementById('retirementDate').value;
    const userName = document.getElementById('retirementUserName').textContent;

    if (!retirementDate) {
        showToast('退職日を入力してください', 'error');
        return;
    }
    if (!confirm(`${userName} さんを ${retirementDate} で退職処理します。\n${retirementDate} の翌日以降のシフトはすべて削除されます。よろしいですか？`)) {
        return;
    }

    try {
        // 1) ユーザーに退職日をセット
        const patchRes = await fetch(`${API_BASE_URL}/tables/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retirement_date: retirementDate })
        });
        if (!patchRes.ok) throw new Error('ユーザーの更新に失敗しました');

        // 2) 退職日の翌日以降のシフトを削除
        const { requests: requestsData, shifts: shiftsData } = await getCachedData();
        const cutoff = retirementDate; // YYYY-MM-DD 文字列比較で OK
        const futureRequests = requestsData.filter(r => r.user_id === userId && r.date > cutoff);
        const futureShifts = shiftsData.filter(s => s.user_id === userId && s.date > cutoff);

        const deletePromises = [];
        futureRequests.forEach(r => {
            deletePromises.push(fetch(`${API_BASE_URL}/tables/shift_requests_update/delete/${r.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: r.id, action: 'delete' })
            }));
        });
        futureShifts.forEach(s => {
            deletePromises.push(fetch(`${API_BASE_URL}/tables/shifts_update/delete/${s.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: s.id, action: 'delete' })
            }));
        });
        await Promise.all(deletePromises);

        showToast(`${userName} さんの退職処理が完了しました (削除シフト ${deletePromises.length} 件)`, 'success');
        closeRetirementModal();
        clearCache();
        loadUsersList();
        loadUsers();
        loadCalendar();
    } catch (error) {
        console.error('退職処理エラー:', error);
        showToast('退職処理に失敗しました: ' + error.message, 'error');
    }
}

async function cancelRetirement() {
    const userId = document.getElementById('retirementUserId').value;
    const userName = document.getElementById('retirementUserName').textContent;
    if (!confirm(`${userName} さんの退職を取り消しますか？\n(削除されたシフトは復元されません)`)) return;

    try {
        const res = await fetch(`${API_BASE_URL}/tables/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retirement_date: null })
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        showToast('退職を取り消しました', 'success');
        closeRetirementModal();
        clearCache();
        loadUsersList();
        loadUsers();
    } catch (error) {
        showToast('取消に失敗しました: ' + error.message, 'error');
    }
}

// ===== 別営業 (branch) 設定 =====
window.openBranchModal = function(userId, userName) {
    document.getElementById('branchUserId').value = userId;
    document.getElementById('branchUserName').textContent = userName;
    document.getElementById('branchModal').style.display = 'flex';
};

function closeBranchModal() {
    document.getElementById('branchModal').style.display = 'none';
}

async function setBranch(branchValue) {
    const userId = document.getElementById('branchUserId').value;
    try {
        const res = await fetch(`${API_BASE_URL}/tables/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch: branchValue || null })
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        showToast(branchValue ? `別営業 ${branchValue} に設定しました` : '別営業を解除しました', 'success');
        closeBranchModal();
        clearCache();
        calculatePeriodTotals();
    } catch (error) {
        showToast('設定に失敗しました: ' + error.message, 'error');
    }
}

// 別営業ボタンクリックの委譲ハンドラ
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('branchOptions')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-branch-option');
        if (!btn) return;
        setBranch(btn.dataset.branch);
    });
});

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

// 同じユーザーの複数シフト（中抜けなど）を 1 行にまとめるためのヘルパー
// items: シフト配列、getStart: 開始時刻を取り出す関数
function groupShiftsByUser(items, getStart) {
    const groups = new Map();
    items.forEach(item => {
        const key = item.user_id || item.user_name || 'unknown';
        if (!groups.has(key)) {
            groups.set(key, { user_id: item.user_id, user_name: item.user_name || '', items: [] });
        }
        groups.get(key).items.push(item);
    });
    groups.forEach(g => g.items.sort((a, b) => (getStart(a) || '').localeCompare(getStart(b) || '')));
    return Array.from(groups.values());
}

// time_slots[0] から開始時刻 (HH:MM) を取り出す
function getRequestStart(req) {
    if (!req.time_slots || req.time_slots.length === 0) return '';
    const slot = req.time_slots[0];
    return slot.split('-')[0] || '';
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
        const offDay = isOffDay(cellDate, dateStr);
        const dayRequests = requests.filter(r => r.date === dateStr);

        const classNames = ['calendar-day'];
        if (offDay) {
            classNames.push('weekend');
        } else if (dayRequests.length > 0) {
            classNames.push('has-shift');
        }

        // 平日のみ希望提出ユーザー数を集計
        let countHtml = '';
        if (!offDay) {
            const uniqueUsers = new Set();
            dayRequests.forEach(r => { if (r.user_id) uniqueUsers.add(r.user_id); });
            if (uniqueUsers.size > 0) {
                countHtml = `<span class="day-count">${uniqueUsers.size}名</span>`;
            }
        }

        html += `<div class="${classNames.join(' ')}">`;
        html += `<div class="day-number"><span class="day-num">${day}</span>${countHtml}</div>`;
        
        if (dayRequests.length > 0) {
            // 同じユーザーの中抜けシフトを 1 ブロック (名前 + 時刻チップ列) にまとめる
            const userGroups = groupShiftsByUser(dayRequests, getRequestStart);
            userGroups.forEach(group => {
                let chips = '';
                group.items.forEach(req => {
                    const timeSlot = formatTimeSlotsDisplay(req);
                    chips += `<button type="button" class="shift-time-chip" onclick="event.stopPropagation(); openRequestDetail('${req.id}')">${timeSlot}</button>`;
                });
                html += `<div class="shift-info request-pending shift-grouped"><span class="shift-name">${group.user_name}</span>${chips}</div>`;
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
        const offDay = isOffDay(cellDate, dateStr);

        // 承認済み希望シフト
        const dayApprovedRequests = approvedRequests.filter(r => r.date === dateStr);

        // 確定シフト
        const dayConfirmedShifts = confirmedShifts.filter(s => s.date === dateStr);

        const hasData = dayApprovedRequests.length > 0 || dayConfirmedShifts.length > 0;

        const classNames = ['calendar-day'];
        if (offDay) {
            classNames.push('weekend');
        } else if (hasData) {
            classNames.push('has-shift');
        } else {
            classNames.push('clickable-empty');
        }

        // 平日のみ出勤者数を集計（承認済み + 確定の重複しないユーザー数）
        let countHtml = '';
        if (!offDay) {
            const uniqueUsers = new Set();
            dayApprovedRequests.forEach(r => { if (!r.is_absent && r.user_id) uniqueUsers.add(r.user_id); });
            dayConfirmedShifts.forEach(s => { if (s.user_id) uniqueUsers.add(s.user_id); });
            if (uniqueUsers.size > 0) {
                countHtml = `<span class="day-count">${uniqueUsers.size}名</span>`;
            }
        }

        html += `<div class="${classNames.join(' ')}" onclick="${!hasData && !offDay ? `openGeneralQuickCreate('${dateStr}')` : ''}" style="${!hasData && !offDay ? 'cursor: pointer;' : ''}">`;
        html += `<div class="day-number"><span class="day-num">${day}</span>${countHtml}</div>`;
        
        // 承認済み希望シフトを表示（緑色、欠勤は取消線）- 同じユーザーは 1 ブロックにまとめる
        if (dayApprovedRequests.length > 0) {
            const userGroups = groupShiftsByUser(dayApprovedRequests, getRequestStart);
            userGroups.forEach(group => {
                const allAbsent = group.items.every(it => it.is_absent);
                const rowAbsentClass = allAbsent ? ' shift-absent' : '';
                let chips = '';
                group.items.forEach(req => {
                    const timeSlot = formatTimeSlotsDisplay(req);
                    const chipAbsent = (!allAbsent && req.is_absent) ? ' shift-time-chip-absent' : '';
                    chips += `<button type="button" class="shift-time-chip${chipAbsent}" onclick="event.stopPropagation(); openRequestDetail('${req.id}')">${timeSlot}</button>`;
                });
                html += `<div class="shift-info shift-confirmed${rowAbsentClass} shift-grouped"><span class="shift-name">${group.user_name}</span>${chips}</div>`;
            });
        }

        // 確定シフトを表示（緑色）- 同じユーザーは 1 ブロックにまとめる
        if (dayConfirmedShifts.length > 0) {
            const userGroups = groupShiftsByUser(dayConfirmedShifts, s => s.start_time || '');
            userGroups.forEach(group => {
                let chips = '';
                group.items.forEach(shift => {
                    chips += `<button type="button" class="shift-time-chip" onclick="event.stopPropagation(); window.openShiftEdit('${shift.id}')">${shift.start_time}-${shift.end_time}</button>`;
                });
                html += `<div class="shift-info shift-confirmed shift-grouped"><span class="shift-name">${group.user_name}</span>${chips}</div>`;
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
        const offDay = isOffDay(cellDate, dateStr);
        const dayRequests = requests.filter(r => r.date === dateStr);
        const dayShifts = shifts.filter(s => s.date === dateStr);

        const hasData = dayRequests.length > 0 || dayShifts.length > 0;

        const classNames = ['calendar-day'];
        if (offDay) {
            classNames.push('weekend');
        } else if (hasData) {
            classNames.push('has-shift');
        } else {
            classNames.push('clickable-empty');
        }

        html += `<div class="${classNames.join(' ')}" onclick="${!hasData && !offDay ? `openQuickCreateForDate('${dateStr}')` : ''}" style="${!hasData && !offDay ? 'cursor: pointer;' : ''}">`;
        html += `<div class="day-number"><span class="day-num">${day}</span></div>`;
        
        // 未承認シフト（黄色）- 1日分まとめて
        const pendingItems = dayRequests
            .filter(req => req.status === 'pending')
            .slice()
            .sort((a, b) => (getRequestStart(a) || '').localeCompare(getRequestStart(b) || ''));
        if (pendingItems.length > 0) {
            let chips = '';
            pendingItems.forEach(req => {
                const timeSlot = formatTimeSlotsDisplay(req);
                chips += `<button type="button" class="shift-time-chip" onclick="event.stopPropagation(); openMgmtModal('request', '${req.id}')">${timeSlot}</button>`;
            });
            html += `<div class="shift-info request-pending shift-grouped shift-grouped-no-name"><span class="shift-status-label">未承認</span>${chips}</div>`;
        }

        // 承認済みシフト（緑、欠勤は取消線）- 1日分まとめて
        const approvedItems = dayRequests
            .filter(req => req.status === 'approved')
            .slice()
            .sort((a, b) => (getRequestStart(a) || '').localeCompare(getRequestStart(b) || ''));
        if (approvedItems.length > 0) {
            const allAbsent = approvedItems.every(it => it.is_absent);
            const rowAbsentClass = allAbsent ? ' shift-absent' : '';
            const label = allAbsent ? '欠勤' : (approvedItems.some(it => it.is_absent) ? '承認/一部欠勤' : '承認');
            let chips = '';
            approvedItems.forEach(req => {
                const timeSlot = formatTimeSlotsDisplay(req);
                const chipAbsent = (!allAbsent && req.is_absent) ? ' shift-time-chip-absent' : '';
                chips += `<button type="button" class="shift-time-chip${chipAbsent}" onclick="event.stopPropagation(); openMgmtModal('request', '${req.id}')">${timeSlot}</button>`;
            });
            html += `<div class="shift-info shift-confirmed${rowAbsentClass} shift-grouped shift-grouped-no-name"><span class="shift-status-label">${label}</span>${chips}</div>`;
        }

        // 確定シフト（緑）- 1日分まとめて
        const confirmedItems = dayShifts
            .slice()
            .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
        if (confirmedItems.length > 0) {
            let chips = '';
            confirmedItems.forEach(shift => {
                chips += `<button type="button" class="shift-time-chip" onclick="event.stopPropagation(); openMgmtModal('shift', '${shift.id}')">${shift.start_time}-${shift.end_time}</button>`;
            });
            html += `<div class="shift-info shift-confirmed shift-grouped shift-grouped-no-name"><span class="shift-status-label">確定</span>${chips}</div>`;
        }
        
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

// 任意期間の稼働時間集計
async function calculatePeriodTotals() {
    const startDate = document.getElementById('periodStart').value;
    const endDate = document.getElementById('periodEnd').value;
    const staffFilter = document.getElementById('periodStaff').value;

    if (!startDate || !endDate) {
        showToast('開始日と終了日を入力してください', 'error');
        return;
    }
    if (startDate > endDate) {
        showToast('終了日は開始日以降にしてください', 'error');
        return;
    }

    try {
        const { requests: requestsData, shifts: shiftsData, users: usersData } = await getCachedData();

        // user_id -> { name, branch } マップ
        const userMap = {};
        usersData.forEach(u => { userMap[u.id] = { name: u.name, branch: u.branch || null }; });

        // 期間内のデータをフィルター
        const filteredRequests = requestsData.filter(r =>
            r.date >= startDate && r.date <= endDate &&
            (staffFilter === 'all' || r.user_id === staffFilter)
        );
        const filteredShifts = shiftsData.filter(s =>
            s.date >= startDate && s.date <= endDate &&
            s.is_confirmed &&
            (staffFilter === 'all' || s.user_id === staffFilter)
        );

        // user_id ごとに集計 (名前ベースだと同名の人を分離できないため id ベース)
        const totals = {};
        const ensure = (userId, name) => {
            if (!totals[userId]) {
                totals[userId] = {
                    user_id: userId,
                    name: name,
                    branch: (userMap[userId] && userMap[userId].branch) || null,
                    pending: 0, approved: 0, absent: 0,
                    workDates: new Set()   // 稼働した日付の集合 (重複なし)
                };
            }
            return totals[userId];
        };

        filteredRequests.forEach(req => {
            const t = ensure(req.user_id, req.user_name);
            if (req.time_slots && req.time_slots.length > 0) {
                const [start, end] = req.time_slots[0].split('-');
                if (start && end) {
                    const hours = calculateHours(start, end);
                    if (req.status === 'approved') {
                        t.approved += hours;
                        if (req.is_absent) t.absent += hours;
                        // 欠勤でない承認シフトのみ稼働日にカウント
                        if (!req.is_absent) t.workDates.add(req.date);
                    } else {
                        t.pending += hours;
                    }
                }
            }
        });

        filteredShifts.forEach(shift => {
            const t = ensure(shift.user_id, shift.user_name);
            if (shift.start_time && shift.end_time) {
                t.approved += calculateHours(shift.start_time, shift.end_time);
            }
            t.workDates.add(shift.date);
        });

        const container = document.getElementById('periodTotalsResult');
        const entries = Object.values(totals);

        if (entries.length === 0) {
            container.innerHTML = '<p style="color: #6c757d; text-align: center;">該当期間のシフトデータがありません</p>';
            return;
        }

        // branch ごとにグループ分け (null = 通常営業)
        const groups = new Map();
        entries.forEach(e => {
            const key = e.branch || '__main__';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(e);
        });
        // ソート: 通常営業を先に、その後 A→G 順
        const groupOrder = ['__main__', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];

        // 1 グループ分のテーブル HTML を組み立てる
        const buildTable = (groupKey, items) => {
            items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
            let totalPending = 0, totalApproved = 0, totalAbsent = 0, totalDays = 0;
            items.forEach(v => {
                totalPending += v.pending;
                totalApproved += v.approved;
                totalAbsent += v.absent || 0;
                totalDays += v.workDates ? v.workDates.size : 0;
            });

            const heading = groupKey === '__main__'
                ? '<h4 style="margin: 16px 0 8px;">通常営業</h4>'
                : `<h4 style="margin: 24px 0 8px; color: var(--indigo-700);">別営業 ${groupKey}</h4>`;

            let table = heading + '<table class="period-totals-table">';
            table += '<thead><tr><th>別営業</th><th>スタッフ</th><th>未承認</th><th>承認済み</th><th>合計</th><th>実出勤</th></tr></thead><tbody>';
            items.forEach(v => {
                const absent = v.absent || 0;
                const actual = v.approved - absent;
                const safeName = (v.name || '').replace(/'/g, "\\'");
                const btnLabel = v.branch || '—';
                const btnClass = v.branch ? 'btn-branch-toggle assigned' : 'btn-branch-toggle';
                const days = v.workDates ? v.workDates.size : 0;
                const daysBadge = days > 0 ? `<span class="work-days-badge">${days}日</span>` : '';
                table += `<tr>
                    <td><button type="button" class="btn ${btnClass}" onclick="window.openBranchModal('${v.user_id}', '${safeName}')" title="別営業を設定">${btnLabel}</button></td>
                    <td>${v.name}${daysBadge}</td>
                    <td>${v.pending.toFixed(1)}h</td>
                    <td>${v.approved.toFixed(1)}h</td>
                    <td><strong>${(v.pending + v.approved).toFixed(1)}h</strong></td>
                    <td><strong>${actual.toFixed(1)}h</strong>${absent > 0 ? ` <span style="color: #dc3545; font-size: 11px;">(-${absent.toFixed(1)}h)</span>` : ''}</td>
                </tr>`;
            });
            if (items.length > 1) {
                const totalActual = totalApproved - totalAbsent;
                const totalDaysBadge = totalDays > 0 ? `<span class="work-days-badge">延べ${totalDays}日</span>` : '';
                table += `<tr class="period-totals-total">
                    <td></td>
                    <td><strong>合計</strong>${totalDaysBadge}</td>
                    <td><strong>${totalPending.toFixed(1)}h</strong></td>
                    <td><strong>${totalApproved.toFixed(1)}h</strong></td>
                    <td><strong>${(totalPending + totalApproved).toFixed(1)}h</strong></td>
                    <td><strong>${totalActual.toFixed(1)}h</strong>${totalAbsent > 0 ? ` <span style="color: #dc3545; font-size: 11px;">(-${totalAbsent.toFixed(1)}h)</span>` : ''}</td>
                </tr>`;
            }
            table += '</tbody></table>';
            return table;
        };

        let html = '';
        for (const key of groupOrder) {
            if (groups.has(key)) html += buildTable(key, groups.get(key));
        }
        container.innerHTML = html;
    } catch (error) {
        console.error('エラー:', error);
        showToast('集計に失敗しました', 'error');
    }
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
            // 中抜け（2件目以降の time_slots）を行として復元
            clearNakanukeRows('mgmtNakanukeContainer');
            if (data.time_slots && data.time_slots.length > 1) {
                for (let si = 1; si < data.time_slots.length; si++) {
                    const parts = (data.time_slots[si] || '').split('-');
                    addNakanukeRow('mgmtNakanukeContainer', parts[0] || '', parts[1] || '');
                }
            }
            document.getElementById('mgmtNotes').value = data.notes || '';
            
            const isAbsent = !!data.is_absent;
            document.getElementById('mgmtShiftInfo').innerHTML = `
                <p><strong>スタッフ:</strong> ${data.user_name || '（不明）'}</p>
                <p><strong>日付:</strong> ${data.date}</p>
                <p><strong>ステータス:</strong> ${data.status === 'approved' ? '承認済み' : '未承認'}${isAbsent ? ' <span style="color: #dc3545; font-weight: 700;">（欠勤）</span>' : ''}</p>
            `;

            if (data.status === 'pending') {
                document.getElementById('mgmtApproveBtn').style.display = 'inline-block';
                document.getElementById('mgmtUnapproveBtn').style.display = 'none';
            } else {
                document.getElementById('mgmtApproveBtn').style.display = 'none';
                document.getElementById('mgmtUnapproveBtn').style.display = 'inline-block';
            }

            // 欠勤ボタン: 承認済みシフトのみ表示。状態に応じて欠勤/欠勤取消を切り替え
            const absentBtn = document.getElementById('mgmtAbsentBtn');
            const unabsentBtn = document.getElementById('mgmtUnabsentBtn');
            if (data.status === 'approved') {
                absentBtn.style.display = isAbsent ? 'none' : 'inline-block';
                unabsentBtn.style.display = isAbsent ? 'inline-block' : 'none';
            } else {
                absentBtn.style.display = 'none';
                unabsentBtn.style.display = 'none';
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
                <p><strong>スタッフ:</strong> ${data.user_name || '（不明）'}</p>
                <p><strong>日付:</strong> ${data.date}</p>
                <p><strong>ステータス:</strong> 確定済み</p>
            `;
            
            document.getElementById('mgmtApproveBtn').style.display = 'none';
            document.getElementById('mgmtUnapproveBtn').style.display = 'none';
            document.getElementById('mgmtAbsentBtn').style.display = 'none';
            document.getElementById('mgmtUnabsentBtn').style.display = 'none';

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
    clearNakanukeRows('mgmtNakanukeContainer');
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
// 中抜け（休憩・分割シフト）の行を管理
let nakanukeRowCount = 0;

// 中抜けの時刻入力行を1行追加する（containerId を省略すると新規作成モーダル用）
function addNakanukeRow(containerId, startVal, endVal) {
    containerId = containerId || 'nakanukeContainer';
    const container = document.getElementById(containerId);
    if (!container) return;
    nakanukeRowCount++;
    const n = nakanukeRowCount;
    const rowId = containerId + '_row_' + n;
    const startHourId = containerId + '_startHour_' + n;
    const startMinId = containerId + '_startMin_' + n;
    const endHourId = containerId + '_endHour_' + n;
    const endMinId = containerId + '_endMin_' + n;

    const row = document.createElement('div');
    row.id = rowId;
    row.className = 'nakanuke-row';
    row.style.cssText = 'display: flex; align-items: flex-end; gap: 8px; margin-top: 8px;';
    row.innerHTML =
        '<div class="form-group" style="flex: 1; margin: 0;">' +
            '<label>戻り時間</label>' +
            '<div style="display: flex; gap: 5px;">' +
                '<select id="' + startHourId + '" class="form-control" style="width: 50%;"></select>' +
                '<select id="' + startMinId + '" class="form-control" style="width: 50%;"></select>' +
            '</div>' +
        '</div>' +
        '<div class="form-group" style="flex: 1; margin: 0;">' +
            '<label>退勤時間</label>' +
            '<div style="display: flex; gap: 5px;">' +
                '<select id="' + endHourId + '" class="form-control" style="width: 50%;"></select>' +
                '<select id="' + endMinId + '" class="form-control" style="width: 50%;"></select>' +
            '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-danger btn-small" onclick="removeNakanukeRow(\'' + rowId + '\')">削除</button>';

    container.appendChild(row);

    // 時・分の選択肢を生成（既存の開始/終了時刻と同じ）
    generateHourMinOptions(startHourId, startMinId);
    generateHourMinOptions(endHourId, endMinId);

    // 既存データから復元する場合は初期値をセット
    if (startVal) setHourMin(startVal, startHourId, startMinId);
    if (endVal) setHourMin(endVal, endHourId, endMinId);
}

// 中抜けの行を削除する
function removeNakanukeRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
}

// 中抜けのすべての行をクリアする
function clearNakanukeRows(containerId) {
    containerId = containerId || 'nakanukeContainer';
    const container = document.getElementById(containerId);
    if (container) container.innerHTML = '';
}

// 入力済みの中抜け時間帯を "HH:MM-HH:MM" の配列で取得する
function getNakanukeSlots(containerId) {
    containerId = containerId || 'nakanukeContainer';
    const container = document.getElementById(containerId);
    if (!container) return [];
    const slots = [];
    container.querySelectorAll('.nakanuke-row').forEach(row => {
        const selects = row.querySelectorAll('select');
        if (selects.length < 4) return;
        const startTime = getTimeString(selects[0].value, selects[1].value);
        const endTime = getTimeString(selects[2].value, selects[3].value);
        if (startTime && endTime) {
            slots.push(`${startTime}-${endTime}`);
        }
    });
    return slots;
}

// 中抜けあり（time_slots が2件以上）の場合に2行表示用のHTMLを返す。
// 例: ["09:30-12:00","16:30-18:00"] -> "09:30-12:00<br>16:30-18:00"
function formatTimeSlotsDisplay(req) {
    if (!req || !req.time_slots || req.time_slots.length === 0) return '';
    return req.time_slots.join('<br>');
}

function closeQuickCreateModal() {
    document.getElementById('quickCreateModal').style.display = 'none';
    clearNakanukeRows();
}

// クイック作成を保存
// 入社日 / 退職日のチェック: NG なら true を返し toast を表示
async function checkHireRetireBlock(userId, shiftDate) {
    if (!userId || !shiftDate) return false;
    const { users } = await getCachedData();
    const user = users.find(u => u.id === userId);
    if (!user) return false;
    if (user.hire_date && shiftDate < user.hire_date) {
        showToast(`${user.name} さんの入社日 (${user.hire_date}) より前の日付にはシフトを作成できません`, 'error');
        return true;
    }
    if (user.retirement_date && shiftDate > user.retirement_date) {
        showToast(`${user.name} さんの退職日 (${user.retirement_date}) より後の日付にはシフトを作成できません`, 'error');
        return true;
    }
    return false;
}

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

    // 入社日 / 退職日チェック
    if (await checkHireRetireBlock(userId, date)) return;

    try {
        // すべて shift_requests テーブルに保存（承認済み or 未承認）
        const requestData = {
            user_id: userId,
            user_name: userName,
            date: date,
            time_slots: [`${startTime}-${endTime}`, ...getNakanukeSlots()],
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
                    time_slots: [`${startTime}-${endTime}`, ...getNakanukeSlots('mgmtNakanukeContainer')],
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
        clearCache();
        closeMgmtModal();
        loadManagementCalendar();
        loadCalendar();
        loadShiftRequests();
        loadShifts();
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
        loadCalendar();
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
            loadCalendar();
            loadShiftRequests();
        } else {
            throw new Error('承認取り消しに失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('承認取消に失敗しました: ' + error.message, 'error');
    }
}

// 欠勤マーク
async function markAbsent() {
    await toggleAbsent(true);
}

// 欠勤取消
async function unmarkAbsent() {
    await toggleAbsent(false);
}

// 欠勤フラグの ON/OFF（内部用）
async function toggleAbsent(absent) {
    const id = document.getElementById('mgmtItemId').value;
    const action = absent ? '欠勤にする' : '欠勤を取消す';

    if (!confirm(`このシフトを${action}してもよろしいですか？`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_update.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: id,
                is_absent: absent
            })
        });

        if (response.ok) {
            showToast(absent ? '欠勤にしました' : '欠勤を取消しました', 'success');
            clearCache();
            closeMgmtModal();
            loadManagementCalendar();
            loadCalendar();
            loadShiftRequests();
        } else {
            throw new Error('更新に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast(`${action}のに失敗しました: ` + error.message, 'error');
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
            loadCalendar();
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
        'unsubmitted': 2,
        'users': 3,
        'totals': 4,
        'calendar': 5
    };
    tabs[tabMap[tabName]].classList.add('active');

    // タブコンテンツの表示を切り替え
    document.getElementById('managementTab').style.display = tabName === 'management' ? 'block' : 'none';
    document.getElementById('requestsTab').style.display = tabName === 'requests' ? 'block' : 'none';
    document.getElementById('unsubmittedTab').style.display = tabName === 'unsubmitted' ? 'block' : 'none';
    document.getElementById('usersTab').style.display = tabName === 'users' ? 'block' : 'none';
    document.getElementById('totalsTab').style.display = tabName === 'totals' ? 'block' : 'none';
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
            clearCache();
            closeShiftEditModal();
            loadShifts();
            loadCalendar();
            loadManagementCalendar();
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
            clearCache();
            closeShiftEditModal();
            loadShifts();
            loadCalendar();
            loadManagementCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        showToast('シフトの削除に失敗しました', 'error');
    }
}

// 希望シフト詳細を開く（未承認・承認済み両方）→ 編集/削除可能な管理モーダルを使用
function openRequestDetail(requestId) {
    openMgmtModal('request', requestId);
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

    // 入社日 / 退職日チェック
    if (await checkHireRetireBlock(userId, date)) return;

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

// ===== シフト未提出者タブ =====

// Date を YYYY-MM-DD 文字列に変換（ローカル時刻基準）
function formatDateForInput(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// プリセットで期間を設定（today/next の前半/後半）
// type: 'this-first' | 'this-second' | 'next-first' | 'next-second'
// autoSearch: true なら設定後すぐに検索を実行
function setUnsubmittedPreset(type, autoSearch) {
    const startEl = document.getElementById('unsubStart');
    const endEl = document.getElementById('unsubEnd');
    if (!startEl || !endEl) return;

    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed
    let half = 'first';

    if (type === 'this-second') {
        half = 'second';
    } else if (type === 'next-first') {
        month += 1;
        if (month > 11) { month = 0; year += 1; }
    } else if (type === 'next-second') {
        month += 1;
        if (month > 11) { month = 0; year += 1; }
        half = 'second';
    }

    let startDate, endDate;
    if (half === 'first') {
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month, 15);
    } else {
        startDate = new Date(year, month, 16);
        endDate = new Date(year, month + 1, 0); // 月末
    }

    startEl.value = formatDateForInput(startDate);
    endEl.value = formatDateForInput(endDate);

    if (autoSearch) {
        loadUnsubmittedUsers();
    }
}

// シフト未提出者を検索
async function loadUnsubmittedUsers() {
    const startEl = document.getElementById('unsubStart');
    const endEl = document.getElementById('unsubEnd');
    const container = document.getElementById('unsubmittedResult');
    if (!startEl || !endEl || !container) return;

    const startDate = startEl.value;
    const endDate = endEl.value;

    if (!startDate || !endDate) {
        showToast('開始日と終了日を指定してください', 'error');
        return;
    }
    if (startDate > endDate) {
        showToast('開始日は終了日より前にしてください', 'error');
        return;
    }

    container.innerHTML = '<p style="color: #6c757d;">検索中...</p>';

    try {
        const { users: usersData, requests: requestsData } = await getCachedData();

        // 期間内に提出のあるユーザー ID の集合（pending / approved 問わず）
        const submittedUserIds = new Set(
            requestsData
                .filter(r => r.date >= startDate && r.date <= endDate)
                .map(r => r.user_id)
        );

        // 管理者以外、かつ「退職前」「入社後」のユーザーで提出が無い人を抽出
        // - 退職日が期間開始日より前 (= 期間中はすでに退職済) の人は除外
        // - 入社日が期間終了日より後 (= 期間中はまだ入社前) の人は除外
        const staffUsers = usersData.filter(u =>
            u.role !== 'admin' &&
            !(u.retirement_date && u.retirement_date < startDate) &&
            !(u.hire_date && u.hire_date > endDate)
        );
        const unsubmitted = staffUsers
            .filter(u => !submittedUserIds.has(u.id))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

        const totalStaff = staffUsers.length;
        const submittedCount = totalStaff - unsubmitted.length;

        if (unsubmitted.length === 0) {
            container.innerHTML = `
                <div style="background: #d4edda; border: 1px solid #c3e6cb; padding: 16px; border-radius: 8px;">
                    <div style="color: #155724; font-weight: 700; font-size: 16px;">✓ 全員提出済みです</div>
                    <p style="color: #155724; font-size: 13px; margin-top: 6px; margin-bottom: 0;">
                        ${startDate} 〜 ${endDate} の期間で、全スタッフ ${totalStaff} 名がシフトを提出しています。
                    </p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
                <strong style="color: #856404; font-size: 15px;">未提出: ${unsubmitted.length}名</strong>
                <span style="color: #6c757d; margin-left: 8px; font-size: 13px;">
                    （提出済 ${submittedCount} / 全 ${totalStaff} 名 ・ 対象期間: ${startDate} 〜 ${endDate}）
                </span>
            </div>
            <div>
                ${unsubmitted.map(u => `
                    <div class="shift-card" style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 700; font-size: 15px;">${u.name || '（名前未設定）'}</div>
                            ${u.phone ? `<div style="color: #6c757d; font-size: 13px; margin-top: 4px;">${u.phone}</div>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } catch (error) {
        console.error('エラー:', error);
        container.innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// ログアウト
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}
