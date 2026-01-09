// ログイン処理

// APIベースURL（絶対パス）
const API_BASE_URL = 'https://hito-kiwa.co.jp/api';

let allUsers = [];

// ページ読み込み時にユーザー一覧を取得
document.addEventListener('DOMContentLoaded', async () => {
    await loadUsers();
    
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
});

// ユーザー一覧を読み込む
async function loadUsers() {
    try {
        console.log('ユーザー読み込み開始:', API_BASE_URL + '/tables/users');
        const response = await fetch(API_BASE_URL + '/tables/users');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('ユーザー読み込み成功:', result);
        
        allUsers = result.data;
        
        const userSelect = document.getElementById('userSelect');
        userSelect.innerHTML = '<option value="">選択してください</option>';
        
        // スタッフと管理者を分ける
        const staffUsers = result.data.filter(user => user.role !== 'admin');
        const adminUsers = result.data.filter(user => user.role === 'admin');
        
        // スタッフを登録順（created_at 昇順）にソート
        staffUsers.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        
        // スタッフを先に追加
        staffUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} (スタッフ)`;
            option.dataset.role = user.role;
            option.dataset.name = user.name;
            userSelect.appendChild(option);
        });
        
        // 管理者を最後に追加
        adminUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.name} (管理者)`;
            option.dataset.role = user.role;
            option.dataset.name = user.name;
            userSelect.appendChild(option);
        });
        
        console.log('ユーザー選択肢を設定しました:', result.data.length + '人');
    } catch (error) {
        console.error('ユーザー読み込みエラー:', error);
        alert('ユーザー情報の読み込みに失敗しました。\n\nエラー: ' + error.message + '\n\nAPIのURL: ' + API_BASE_URL + '/tables/users');
    }
}

// ログイン処理
async function handleLogin() {
    const userSelect = document.getElementById('userSelect');
    const selectedOption = userSelect.options[userSelect.selectedIndex];
    const password = document.getElementById('password').value;
    
    if (!userSelect.value) {
        alert('ユーザーを選択してください');
        return;
    }
    
    if (!password) {
        alert('パスワードを入力してください');
        return;
    }
    
    // 選択されたユーザーの情報を取得
    const selectedUser = allUsers.find(user => user.id === userSelect.value);
    
    if (!selectedUser) {
        alert('ユーザー情報が見つかりません');
        return;
    }
    
    // パスワード認証
    if (selectedUser.password !== password) {
        alert('パスワードが正しくありません');
        return;
    }
    
    // セッション情報を保存（localStorageを使用）
    const userInfo = {
        id: userSelect.value,
        name: selectedOption.dataset.name,
        role: selectedOption.dataset.role
    };
    
    localStorage.setItem('currentUser', JSON.stringify(userInfo));
    
    // 役割に応じてリダイレクト
    if (userInfo.role === 'admin') {
        window.location.href = 'admin.html';
    } else {
        window.location.href = 'staff.html';
    }
}
