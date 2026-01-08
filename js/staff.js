// スタッフページの処理

// APIベースURL
const API_BASE_URL = 'https://hito-kiwa.co.jp/api';

let currentUser = null;
let selectedDates = []; // 複数選択された日付を保持
let currentDisplayYear = new Date().getFullYear();
let currentDisplayMonth = new Date().getMonth() + 1;

// データキャッシュ（無効化してリアルタイム更新）
let shiftsCache = null;
let requestsCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 0; // キャッシュを無効化（即座に反映）

// ページ読み込み時
document.addEventListener('DOMContentLoaded', () => {
    // ログイン確認
    const userInfo = localStorage.getItem('currentUser');
    if (!userInfo) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = JSON.parse(userInfo);
    
    // スタッフ以外は管理者ページへリダイレクト
    if (currentUser.role !== 'staff') {
        window.location.href = 'admin.html';
        return;
    }
    
    // ユーザー名を表示
    document.getElementById('userName').textContent = currentUser.name;
    
    // 今月を設定
    const thisMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('filterMonth').value = thisMonth;
    document.getElementById('calendarMonth').value = thisMonth;
    
    // 時間選択ボックスを生成
    generateTimeOptions();
    
    // 日付選択カレンダーを生成
    renderDateCalendar();
    
    // 初期データ読み込み
    loadMyRequests();
    loadConfirmedShifts();
    loadCalendar();
});

// 時間選択ボックスを生成（9:30-18:00、30分刻み）
function generateTimeOptions() {
    const startSelect = document.getElementById('requestStartTime');
    const endSelect = document.getElementById('requestEndTime');
    
    const times = [];
    for (let hour = 9; hour <= 18; hour++) {
        if (hour === 9) {
            times.push('09:30');
        } else if (hour < 18) {
            times.push(`${hour.toString().padStart(2, '0')}:00`);
            times.push(`${hour.toString().padStart(2, '0')}:30`);
        } else {
            times.push('18:00');
        }
    }
    
    startSelect.innerHTML = '<option value="">選択してください</option>';
    endSelect.innerHTML = '<option value="">選択してください</option>';
    
    times.forEach(time => {
        const option1 = document.createElement('option');
        option1.value = time;
        option1.textContent = time;
        startSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = time;
        option2.textContent = time;
        endSelect.appendChild(option2);
    });
}

// キャッシュされたデータを取得
async function getCachedShiftData() {
    const now = Date.now();
    
    // キャッシュが有効な場合は再利用
    if (shiftsCache && requestsCache && (now - cacheTimestamp < CACHE_DURATION)) {
        return { requests: requestsCache, shifts: shiftsCache };
    }
    
    // キャッシュが無効な場合は新規取得
    const [requestsResponse, shiftsResponse] = await Promise.all([
        fetch(API_BASE_URL + '/tables/shift_requests?limit=100'),
        fetch(API_BASE_URL + '/tables/shifts?limit=100')
    ]);
    
    const requestsResult = await requestsResponse.json();
    const shiftsResult = await shiftsResponse.json();
    
    // 自分のデータのみフィルターしてキャッシュ
    requestsCache = requestsResult.data.filter(r => r.user_id === currentUser.id);
    shiftsCache = shiftsResult.data.filter(s => s.user_id === currentUser.id && s.is_confirmed);
    cacheTimestamp = now;
    
    return { requests: requestsCache, shifts: shiftsCache };
}

// キャッシュをクリア（データ更新時に使用）
function clearShiftCache() {
    shiftsCache = null;
    requestsCache = null;
    cacheTimestamp = 0;
}

// 日付選択カレンダーを生成（既存シフト表示付き）
async function renderDateCalendar() {
    const year = currentDisplayYear;
    const month = currentDisplayMonth;
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    
    document.getElementById('currentMonthLabel').textContent = `${year}年${month}月`;
    
    try {
        // キャッシュからデータを取得
        const { requests, shifts } = await getCachedShiftData();
        
        // 該当月のみフィルター
        const myRequests = requests.filter(r => r.date.startsWith(monthStr));
        const myShifts = shifts.filter(s => s.date.startsWith(monthStr));
        
        // 日付ごとにシフト情報をマッピング
        const requestsByDate = {};
        const shiftsByDate = {};
        
        myRequests.forEach(req => {
            if (!requestsByDate[req.date]) requestsByDate[req.date] = [];
            requestsByDate[req.date].push(req);
        });
        
        myShifts.forEach(shift => {
            if (!shiftsByDate[shift.date]) shiftsByDate[shift.date] = [];
            shiftsByDate[shift.date].push(shift);
        });
        
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();
        
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        
        let html = '';
        
        // 曜日ヘッダー
        dayNames.forEach(day => {
            html += `<div class="date-calendar-header">${day}</div>`;
        });
        
        // 空白セル
        for (let i = 0; i < startDayOfWeek; i++) {
            html += '<div class="date-calendar-day empty"></div>';
        }
        
        // 日付セル
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const cellDate = new Date(year, month - 1, day);
            const isPast = cellDate < today;
            const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6; // 日曜日(0)または土曜日(6)
            const isSelected = selectedDates.includes(dateStr);
            
            const dayRequests = requestsByDate[dateStr] || [];
            const dayShifts = shiftsByDate[dateStr] || [];
            
            const classNames = ['date-calendar-day'];
            if (isPast || isWeekend) classNames.push('disabled');
            if (isSelected) classNames.push('selected');
            
            html += `<div class="${classNames.join(' ')}" onclick="${!isPast && !isWeekend ? `toggleDateSelection('${dateStr}')` : ''}">`;
            html += `<div class="date-num">${day}</div>`;
            
            // 希望シフト（黄色）を表示
            if (dayRequests.length > 0) {
                dayRequests.forEach(req => {
                    const timeSlot = req.time_slots && req.time_slots.length > 0 ? req.time_slots[0] : '';
                    html += `<div class="mini-shift request">${timeSlot}</div>`;
                });
            }
            
            // 確定シフト（赤）を表示
            if (dayShifts.length > 0) {
                dayShifts.forEach(shift => {
                    html += `<div class="mini-shift confirmed">${shift.start_time}-${shift.end_time}</div>`;
                });
            }
            
            html += '</div>';
        }
        
        document.getElementById('dateCalendar').innerHTML = html;
        updateSelectedDatesList();
    } catch (error) {
        console.error('エラー:', error);
        // エラー時は通常のカレンダーを表示
        renderBasicCalendar();
    }
}

// 基本カレンダー（エラー時のフォールバック）
function renderBasicCalendar() {
    const year = currentDisplayYear;
    const month = currentDisplayMonth;
    
    document.getElementById('currentMonthLabel').textContent = `${year}年${month}月`;
    
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    let html = '';
    
    dayNames.forEach(day => {
        html += `<div class="date-calendar-header">${day}</div>`;
    });
    
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="date-calendar-day empty"></div>';
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const cellDate = new Date(year, month - 1, day);
        const isPast = cellDate < today;
        const isSelected = selectedDates.includes(dateStr);
        
        const classNames = ['date-calendar-day'];
        if (isPast) classNames.push('disabled');
        if (isSelected) classNames.push('selected');
        
        html += `<div class="${classNames.join(' ')}" onclick="${!isPast ? `toggleDateSelection('${dateStr}')` : ''}">${day}</div>`;
    }
    
    document.getElementById('dateCalendar').innerHTML = html;
    updateSelectedDatesList();
}

// 日付の選択/解除をトグル
function toggleDateSelection(dateStr) {
    const index = selectedDates.indexOf(dateStr);
    if (index > -1) {
        selectedDates.splice(index, 1);
    } else {
        selectedDates.push(dateStr);
    }
    selectedDates.sort();
    renderDateCalendar();
}

// 選択中の日付リストを更新
function updateSelectedDatesList() {
    const container = document.getElementById('selectedDatesList');
    
    if (selectedDates.length === 0) {
        container.innerHTML = '<span style="color: #6c757d;">日付が選択されていません</span>';
        return;
    }
    
    container.innerHTML = selectedDates.map(date => {
        const d = new Date(date + 'T00:00:00');
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
        return `<span class="selected-date-tag" onclick="toggleDateSelection('${date}')">${month}月${day}日(${dayOfWeek})</span>`;
    }).join('');
}

// 前月へ
function previousMonth() {
    currentDisplayMonth--;
    if (currentDisplayMonth < 1) {
        currentDisplayMonth = 12;
        currentDisplayYear--;
    }
    renderDateCalendar();
}

// 次月へ
function nextMonth() {
    currentDisplayMonth++;
    if (currentDisplayMonth > 12) {
        currentDisplayMonth = 1;
        currentDisplayYear++;
    }
    renderDateCalendar();
}

// 希望シフトを提出（複数日付対応）
async function submitRequest() {
    const startTime = document.getElementById('requestStartTime').value;
    const endTime = document.getElementById('requestEndTime').value;
    const notes = document.getElementById('requestNotes').value;
    
    if (selectedDates.length === 0) {
        alert('希望日を選択してください');
        return;
    }
    
    if (!startTime || !endTime) {
        alert('希望時間を選択してください');
        return;
    }
    
    if (startTime >= endTime) {
        alert('終了時刻は開始時刻より後にしてください');
        return;
    }
    
    try {
        let successCount = 0;
        let failCount = 0;
        
        // 選択されたすべての日付に対してシフトを作成
        for (const date of selectedDates) {
            const requestData = {
                user_id: currentUser.id,
                user_name: currentUser.name,
                date: date,
                time_slots: [`${startTime}-${endTime}`],
                status: 'pending',
                notes: notes
            };
            
            const response = await fetch(API_BASE_URL + '/tables/shift_requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        }
        
        if (successCount > 0) {
            alert(`${successCount}件の希望シフトを提出しました！${failCount > 0 ? `\n（${failCount}件は失敗しました）` : ''}`);
            
            // キャッシュをクリア
            clearShiftCache();
            
            // 選択日付をクリア
            selectedDates = [];
            renderDateCalendar();
            
            // 時間選択と備考はそのまま保持（リセットしない）
            
            // 提出済み一覧を更新
            loadMyRequests();
        } else {
            throw new Error('提出に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフトの提出に失敗しました');
    }
}

// 自分の提出済み希望シフトを読み込む
async function loadMyRequests() {
    try {
        const { requests } = await getCachedShiftData();
        
        // 自分の希望シフトはキャッシュから取得済み
        const myRequests = requests;
        
        const container = document.getElementById('myRequests');
        
        if (myRequests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">提出済みの希望シフトはありません</p>';
            return;
        }
        
        // 日付順にソート（新しい順）
        myRequests.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        container.innerHTML = myRequests.map(req => `
            <div class="shift-card">
                <div class="shift-card-header">
                    <span class="shift-date">${formatDate(req.date)}</span>
                    <span class="shift-status ${req.status === 'approved' ? 'status-approved' : 'status-pending'}">
                        ${req.status === 'approved' ? '承認済み' : '確認中'}
                    </span>
                </div>
                <div class="request-time-slots">
                    ${req.time_slots.map(slot => `<span class="time-slot-tag">${slot}</span>`).join('')}
                </div>
                ${req.notes ? `<div class="shift-notes">${req.notes}</div>` : ''}
                ${req.status === 'pending' ? `
                    <div class="shift-card-actions">
                        <button class="btn btn-secondary btn-small" onclick="editMyRequest('${req.id}')">編集</button>
                        <button class="btn btn-danger btn-small" onclick="deleteMyRequest('${req.id}')">削除</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('myRequests').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// 確定シフトを読み込む
async function loadConfirmedShifts() {
    try {
        const { shifts } = await getCachedShiftData();
        
        // 自分の確定シフトはキャッシュから取得済み
        const myShifts = shifts;
        
        // 選択された月でフィルター
        const filterMonth = document.getElementById('filterMonth').value;
        const filteredShifts = myShifts.filter(shift => 
            shift.date.startsWith(filterMonth)
        );
        
        const container = document.getElementById('confirmedShifts');
        
        if (filteredShifts.length === 0) {
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
        filteredShifts.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        container.innerHTML = filteredShifts.map(shift => `
            <div class="shift-card">
                <div class="shift-card-header">
                    <span class="shift-date">${formatDate(shift.date)}</span>
                    <span class="shift-status status-approved">確定</span>
                </div>
                <div class="shift-time">${shift.start_time} - ${shift.end_time}</div>
                ${shift.notes ? `<div class="shift-notes">${shift.notes}</div>` : ''}
            </div>
        `).join('');
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('confirmedShifts').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// カレンダーを読み込む
async function loadCalendar() {
    try {
        const calendarMonth = document.getElementById('calendarMonth').value;
        const [year, month] = calendarMonth.split('-').map(Number);
        
        // キャッシュからデータを取得
        const { shifts, requests } = await getCachedShiftData();
        
        // 該当月でフィルター
        const myShifts = shifts.filter(shift => shift.date.startsWith(calendarMonth));
        const myRequests = requests.filter(request => request.date.startsWith(calendarMonth));
        
        // カレンダーを生成
        const container = document.getElementById('calendarView');
        container.innerHTML = generateCalendar(year, month, myShifts, myRequests);
    } catch (error) {
        console.error('エラー:', error);
        document.getElementById('calendarView').innerHTML = '<p style="color: #dc3545;">読み込みに失敗しました</p>';
    }
}

// カレンダーHTML生成
function generateCalendar(year, month, shifts, requests) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    // 日付ごとにシフトをマッピング（パフォーマンス最適化）
    const shiftsByDate = {};
    const requestsByDate = {};
    
    shifts.forEach(s => {
        if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
        shiftsByDate[s.date].push(s);
    });
    
    requests.forEach(r => {
        if (!requestsByDate[r.date]) requestsByDate[r.date] = [];
        requestsByDate[r.date].push(r);
    });
    
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
        const dayShifts = shiftsByDate[dateStr] || [];
        const dayRequests = requestsByDate[dateStr] || [];
        
        const hasData = dayShifts.length > 0 || dayRequests.length > 0;
        
        const classNames = ['calendar-day'];
        if (isWeekend) {
            classNames.push('weekend');
        } else if (hasData) {
            classNames.push('has-shift');
        } else {
            classNames.push('clickable-empty');
        }
        
        html += `<div class="${classNames.join(' ')}" onclick="${!hasData && !isWeekend ? `openStaffQuickCreate('${dateStr}')` : ''}" style="${!hasData && !isWeekend ? 'cursor: pointer;' : ''}">`;
        html += `<div class="day-number">${day}</div>`;
        
        // 希望シフト（黄色）
        if (dayRequests.length > 0) {
            dayRequests.forEach(request => {
                const timeSlot = request.time_slots && request.time_slots.length > 0 ? request.time_slots[0] : '';
                // 未承認なら編集可能、承認済みなら詳細表示のみ
                const clickHandler = request.status === 'pending' 
                    ? `openRequestEditModal('${request.id}')` 
                    : `showRequestDetail('${request.id}')`;
                const title = request.status === 'pending' ? '未承認（クリックで編集）' : '承認済み（変更不可）';
                html += `<div class="shift-info request-pending" style="cursor: pointer;" onclick="event.stopPropagation(); ${clickHandler}" title="${title}">${timeSlot}</div>`;
            });
        }
        
        // 確定シフト（赤）
        if (dayShifts.length > 0) {
            dayShifts.forEach(shift => {
                html += `<div class="shift-info shift-confirmed" style="cursor: pointer;" onclick="event.stopPropagation(); showShiftDetail('${shift.id}')" title="確定シフト">${shift.start_time}-${shift.end_time}</div>`;
            });
        }
        
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// シフト詳細を表示（スタッフは閲覧のみ）
async function showShiftDetail(shiftId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shifts/${shiftId}`);
        const shift = await response.json();
        
        const content = `
            <div style="padding: 10px 0;">
                <p style="margin: 10px 0;"><strong>日付:</strong> ${formatDate(shift.date)}</p>
                <p style="margin: 10px 0;"><strong>時間:</strong> ${shift.start_time} - ${shift.end_time}</p>
                ${shift.notes ? `<p style="margin: 10px 0;"><strong>備考:</strong> ${shift.notes}</p>` : ''}
            </div>
        `;
        
        document.getElementById('shiftDetailContent').innerHTML = content;
        document.getElementById('shiftDetailModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        alert('シフト情報の読み込みに失敗しました');
    }
}

// シフト詳細モーダルを閉じる
function closeShiftDetailModal() {
    document.getElementById('shiftDetailModal').style.display = 'none';
}

// 希望シフト詳細を表示（承認済み用）
async function showRequestDetail(requestId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests/${requestId}`);
        const request = await response.json();
        
        const timeSlots = Array.isArray(request.time_slots) ? request.time_slots.join(', ') : request.time_slots;
        const statusText = request.status === 'pending' ? '未承認' : '承認済み';
        
        const content = `
            <div style="padding: 10px 0;">
                <p style="margin: 10px 0;"><strong>日付:</strong> ${formatDate(request.date)}</p>
                <p style="margin: 10px 0;"><strong>時間:</strong> ${timeSlots}</p>
                <p style="margin: 10px 0;"><strong>ステータス:</strong> ${statusText}</p>
                ${request.notes ? `<p style="margin: 10px 0;"><strong>備考:</strong> ${request.notes}</p>` : ''}
            </div>
        `;
        
        document.getElementById('shiftDetailContent').innerHTML = content;
        document.getElementById('shiftDetailModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフト情報の読み込みに失敗しました');
    }
}

// 空白日クリックで希望シフト作成
function openStaffQuickCreate(dateStr) {
    document.getElementById('staffQuickDate').value = dateStr;
    document.getElementById('staffQuickDateDisplay').textContent = formatDate(dateStr);
    document.getElementById('staffQuickStartTime').value = '';
    document.getElementById('staffQuickEndTime').value = '';
    document.getElementById('staffQuickNotes').value = '';
    
    document.getElementById('staffQuickCreateModal').style.display = 'flex';
}

// 希望シフト作成モーダルを閉じる
function closeStaffQuickCreateModal() {
    document.getElementById('staffQuickCreateModal').style.display = 'none';
}

// 希望シフトを作成
async function saveStaffQuickCreate() {
    const date = document.getElementById('staffQuickDate').value;
    const startTime = document.getElementById('staffQuickStartTime').value;
    const endTime = document.getElementById('staffQuickEndTime').value;
    const notes = document.getElementById('staffQuickNotes').value;
    
    if (!startTime || !endTime) {
        alert('時間を入力してください');
        return;
    }
    
    if (startTime >= endTime) {
        alert('終了時刻は開始時刻より後にしてください');
        return;
    }
    
    try {
        const requestData = {
            user_id: currentUser.id,
            user_name: currentUser.name,
            date: date,
            time_slots: [`${startTime}-${endTime}`],
            status: 'pending',
            notes: notes
        };
        
        const response = await fetch(API_BASE_URL + '/tables/shift_requests', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (response.ok) {
            alert('希望シフトを作成しました！');
            clearShiftCache();
            closeStaffQuickCreateModal();
            loadCalendar();
        } else {
            throw new Error('作成に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフトの作成に失敗しました');
    }
}

// 希望シフト編集モーダルを開く（共通処理）
async function openRequestEditModal(requestId) {
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests/${requestId}`);
        const request = await response.json();
        
        // 未承認のみ編集可能
        if (request.status !== 'pending') {
            alert('承認済みのシフトは編集できません');
            return;
        }
        
        // モーダルに情報をセット
        document.getElementById('editRequestId').value = request.id;
        document.getElementById('editRequestDate').textContent = formatDate(request.date);
        
        // 時間選択ボックスを生成（編集用）
        const editStartSelect = document.getElementById('editRequestStartTime');
        const editEndSelect = document.getElementById('editRequestEndTime');
        
        const times = [];
        for (let hour = 9; hour <= 18; hour++) {
            if (hour === 9) {
                times.push('09:30');
            } else {
                times.push(`${hour}:00`);
                if (hour < 18) times.push(`${hour}:30`);
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
        
        // 現在の時間を設定
        if (request.time_slots && request.time_slots.length > 0) {
            const [startTime, endTime] = request.time_slots[0].split('-');
            editStartSelect.value = startTime;
            editEndSelect.value = endTime;
        }
        
        document.getElementById('editRequestNotes').value = request.notes || '';
        
        // モーダルを表示
        document.getElementById('editRequestModal').style.display = 'flex';
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフト情報の読み込みに失敗しました');
    }
}

// 希望シフトを編集（一覧から）
async function editMyRequest(requestId) {
    await openRequestEditModal(requestId);
}

// 編集内容を保存
async function saveEditedRequest() {
    const requestId = document.getElementById('editRequestId').value;
    const startTime = document.getElementById('editRequestStartTime').value;
    const endTime = document.getElementById('editRequestEndTime').value;
    const notes = document.getElementById('editRequestNotes').value;
    
    if (!startTime || !endTime) {
        alert('時間を選択してください');
        return;
    }
    
    if (startTime >= endTime) {
        alert('終了時刻は開始時刻より後にしてください');
        return;
    }
    
    try {
        // POST で更新（PATCH が使えないため）
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests_update.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: requestId,
                time_slots: [`${startTime}-${endTime}`],
                notes: notes
            })
        });
        
        if (response.ok) {
            alert('希望シフトを更新しました！');
            clearShiftCache();
            closeEditRequestModal();
            loadMyRequests();
            loadCalendar();
        } else {
            const error = await response.json();
            throw new Error(error.error || '更新に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフトの更新に失敗しました: ' + error.message);
    }
}

// 編集モーダルを閉じる
function closeEditRequestModal() {
    document.getElementById('editRequestModal').style.display = 'none';
}

// モーダルから希望シフトを削除
async function deleteRequestFromModal() {
    const requestId = document.getElementById('editRequestId').value;
    
    if (!confirm('この希望シフトを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests/${requestId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            alert('希望シフトを削除しました');
            clearShiftCache();
            closeEditRequestModal();
            loadMyRequests();
            loadCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフトの削除に失敗しました');
    }
}

// 希望シフトを削除（一覧から）
async function deleteMyRequest(requestId) {
    if (!confirm('この希望シフトを削除してもよろしいですか？')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/tables/shift_requests/${requestId}`, {
            method: 'DELETE'
        });
        
        if (response.ok || response.status === 204) {
            alert('希望シフトを削除しました');
            clearShiftCache();
            loadMyRequests();
            loadCalendar();
        } else {
            throw new Error('削除に失敗しました');
        }
    } catch (error) {
        console.error('エラー:', error);
        alert('希望シフトの削除に失敗しました');
    }
}

// タブ切り替え
function switchTab(tabName) {
    // タブボタンのアクティブ状態を切り替え
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // タブコンテンツの表示を切り替え
    document.getElementById('requestTab').style.display = tabName === 'request' ? 'block' : 'none';
    document.getElementById('confirmedTab').style.display = tabName === 'confirmed' ? 'block' : 'none';
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

// ログアウト
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

// グローバルスコープに関数を公開
window.submitRequest = submitRequest;
window.switchTab = switchTab;
window.logout = logout;
window.loadConfirmedShifts = loadConfirmedShifts;
window.loadCalendar = loadCalendar;
window.toggleDateSelection = toggleDateSelection;
window.previousMonth = previousMonth;
window.nextMonth = nextMonth;
window.openStaffQuickCreate = openStaffQuickCreate;
window.closeStaffQuickCreateModal = closeStaffQuickCreateModal;
window.saveStaffQuickCreate = saveStaffQuickCreate;
window.closeShiftDetailModal = closeShiftDetailModal;
window.showShiftDetail = showShiftDetail;
window.showRequestDetail = showRequestDetail;
window.openRequestEditModal = openRequestEditModal;
window.editMyRequest = editMyRequest;
window.saveEditedRequest = saveEditedRequest;
window.closeEditRequestModal = closeEditRequestModal;
window.deleteMyRequest = deleteMyRequest;
