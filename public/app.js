let token = localStorage.getItem('sakhachat_token');
let me = JSON.parse(localStorage.getItem('sakhachat_user') || 'null');
let socket = null;
let currentChat = null; // {id, displayName, username}
let onlineUsers = new Set();
let usersCache = []; // Здесь хранится либо список чатов, либо результат поиска

// --- Утилиты ---
function isMobile() {
  return window.matchMedia('(max-width: 700px)').matches;
}

// --- Auth ---
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
}
function showLogin() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('register-form').style.display = 'none';
}

async function register() {
  const username = document.getElementById('reg-username').value.trim();
  const displayName = document.getElementById('reg-display').value.trim();
  const password = document.getElementById('reg-password').value;
  const err = document.getElementById('reg-error');
  err.textContent = '';
  try {
    const r = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    });
    const data = await r.json();
    if (!r.ok) return err.textContent = data.error;
    onLogin(data);
  } catch (e) { err.textContent = 'Ошибка сети'; }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) return err.textContent = data.error;
    onLogin(data);
  } catch (e) { err.textContent = 'Ошибка сети'; }
}

function onLogin(data) {
  token = data.token;
  me = data.user;
  localStorage.setItem('sakhachat_token', token);
  localStorage.setItem('sakhachat_user', JSON.stringify(me));
  initApp();
}

async function logout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token }
    });
  } catch (e) { /* сервер недоступен — не страшно */ }
  localStorage.removeItem('sakhachat_token');
  localStorage.removeItem('sakhachat_user');
  if (socket) socket.disconnect();
  location.reload();
}

// --- App init ---
function initApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('chat-screen').style.display = 'flex';
  document.getElementById('me-name').textContent = me.displayName;
  document.getElementById('me-username').textContent = '@' + me.username;
  document.getElementById('me-avatar').textContent = me.displayName[0].toUpperCase();

  connectSocket();
  loadChats(); // Загружаем список наших чатов
}

function connectSocket() {
  socket = io({ auth: { token } });
  
  socket.on('online', (ids) => {
    onlineUsers = new Set(ids);
    renderUserList();
    updateStatus();
  });

  socket.on('new_message', (msg) => {
    if (currentChat && msg.sender_id === currentChat.id) {
      appendMessage(msg, true);
    } else {
      // Если сообщение пришло от кого-то другого — обновляем список чатов
      loadChats();
    }
  });

  socket.on('connect_error', () => {
    localStorage.clear();
    location.reload();
  });
}

// --- Users & Chats ---
async function loadChats() {
  const r = await fetch('/api/chats', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return;
  usersCache = await r.json();
  renderUserList();
}

async function searchUsers(q) {
  const query = q.trim();
  
  // Если очистили поиск (меньше 3 символов) — загружаем список чатов
  if (query.length < 3) {
    loadChats();
    return;
  }

  // Если ввели 3+ символа — ищем по точному логину
  const r = await fetch('/api/users?q=' + encodeURIComponent(query), {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return;
  usersCache = await r.json();
  renderUserList();
}

function renderUserList() {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  
  const searchValue = document.getElementById('search').value.trim();
  const isSearching = searchValue.length >= 3;

  // Если никого не нашли
  if (!usersCache.length) {
    if (isSearching) {
      list.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: #888;">
          <div style="font-size: 40px; margin-bottom: 12px;">🤷‍♂️</div>
          <div style="font-size: 14px; font-weight: 600; color: #555; margin-bottom: 8px;">Пользователь не найден</div>
          <div style="font-size: 13px; line-height: 1.5;">Проверьте логин.</div>
        </div>
      `;
    } else {
      list.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: #888;">
          <div style="font-size: 40px; margin-bottom: 12px;">💬</div>
          <div style="font-size: 15px; font-weight: 600; color: #555; margin-bottom: 8px;">Нет сообщений</div>
          <div style="font-size: 13px; line-height: 1.5;">Введите <b>точный логин</b> друга, чтобы начать общение.</div>
        </div>
      `;
    }
    return;
  }

  // Рисуем карточки
  for (const u of usersCache) {
    const isOnline = onlineUsers.has(u.id);
    const div = document.createElement('div');
    div.className = 'user-item' + (currentChat && currentChat.id === u.id ? ' active' : '');
    div.innerHTML = `
      <div class="avatar">${escapeHtml(u.displayName[0].toUpperCase())}${isOnline ? '<span class="online-dot"></span>' : ''}</div>
      <div>
        <div class="name">${escapeHtml(u.displayName)}</div>
        <div class="username">@${escapeHtml(u.username)}</div>
      </div>
    `;
    div.onclick = () => openChat(u);
    list.appendChild(div);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// --- Chat ---
async function openChat(user) {
  document.getElementById('search').value = '';

  if (isMobile()) {
    document.getElementById('sidebar').classList.add('hidden');
  }

  currentChat = user;
  document.getElementById('empty-chat').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';
  document.getElementById('chat-avatar').textContent = user.displayName[0].toUpperCase();
  document.getElementById('chat-name').textContent = user.displayName;
  updateStatus();
  loadChats();

  const r = await fetch('/api/messages/' + user.id, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const messages = await r.json();
  const container = document.getElementById('messages');
  container.innerHTML = '';
  for (const m of messages) appendMessage(m, false);
  scrollBottom();

  if (!isMobile()) {
    document.getElementById('message-input').focus();
  }
}

function closeChatOnMobile() {
  document.getElementById('sidebar').classList.remove('hidden');
  currentChat = null;
  document.getElementById('chat').style.display = 'none';
  document.getElementById('empty-chat').style.display = 'flex';
  loadChats();
}

function updateStatus() {
  if (!currentChat) return;
  const el = document.getElementById('chat-status');
  if (onlineUsers.has(currentChat.id)) {
    el.textContent = 'в сети';
    el.className = 'status';
  } else {
    el.textContent = 'не в сети';
    el.className = 'status offline';
  }
}

// Отрисовка сообщений (без галочек)
function appendMessage(msg, animate) {
  const container = document.getElementById('messages');
  const isMine = msg.sender_id === me.id;
  const div = document.createElement('div');
  div.className = 'message ' + (isMine ? 'mine' : 'theirs');
  if (!animate) div.style.animation = 'none';
  
  const time = new Date(msg.created_at + 'Z').toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit'
  });
  
  div.innerHTML = escapeHtml(msg.text) + `<span class="time">${time}</span>`;
  container.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  const c = document.getElementById('messages');
  requestAnimationFrame(() => {
    c.scrollTop = c.scrollHeight;
  });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !currentChat) return;
  socket.emit('send_message', { to: currentChat.id, text }, (msg) => {
    appendMessage(msg, true);
    loadChats();
  });
  input.value = '';
  if (!isMobile()) input.focus();
}

// ==================== НАСТРОЙКИ ПРОФИЛЯ ====================
async function openSettings() {
  const modal = document.getElementById('settings-modal');
  modal.style.display = 'flex';

  document.getElementById('settings-error').textContent = '';
  document.getElementById('settings-success').textContent = '';
  document.getElementById('settings-currentPassword').value = '';
  document.getElementById('settings-newPassword').value = '';
  document.getElementById('settings-bio').value = '';

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.checked = document.body.classList.contains('dark');
  }

  try {
    const r = await fetch('/api/me', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await r.json();
    if (!r.ok) {
      document.getElementById('settings-error').textContent = data.error || 'Ошибка загрузки';
      return;
    }

    document.getElementById('settings-avatar').textContent = data.displayName[0].toUpperCase();
    document.getElementById('settings-username-display').textContent = data.displayName;
    document.getElementById('settings-username').textContent = '@' + data.username;
    document.getElementById('settings-displayName').value = data.displayName;
    document.getElementById('settings-bio').value = data.bio || '';

    if (data.createdAt) {
      const d = new Date(data.createdAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      document.getElementById('settings-created').textContent = 'В SakhaChat с ' + formatted;
    }
  } catch (e) {
    document.getElementById('settings-error').textContent = 'Ошибка сети';
  }
}

function closeSettings() {
  document.getElementById('settings-modal').style.display = 'none';
}

async function saveProfile() {
  const err = document.getElementById('settings-error');
  const ok = document.getElementById('settings-success');
  err.textContent = '';
  ok.textContent = '';

  const displayName = document.getElementById('settings-displayName').value.trim();
  const bio = document.getElementById('settings-bio').value;
  const currentPassword = document.getElementById('settings-currentPassword').value;
  const newPassword = document.getElementById('settings-newPassword').value;

  if (!displayName) {
    err.textContent = 'Имя не может быть пустым';
    return;
  }

  const saveBtn = document.querySelector('#settings-modal .btn-primary');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Сохранение...';

  try {
    const body = { displayName, bio };
    if (newPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }

    const r = await fetch('/api/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(body)
    });
    const data = await r.json();

    if (!r.ok) {
      err.textContent = data.error || 'Ошибка';
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
      return;
    }

    me.displayName = data.displayName;
    me.bio = data.bio;
    localStorage.setItem('sakhachat_user', JSON.stringify(me));

    document.getElementById('me-name').textContent = me.displayName;
    document.getElementById('me-avatar').textContent = me.displayName[0].toUpperCase();
    document.getElementById('settings-avatar').textContent = me.displayName[0].toUpperCase();
    document.getElementById('settings-username-display').textContent = me.displayName;

    document.getElementById('settings-currentPassword').value = '';
    document.getElementById('settings-newPassword').value = '';

    ok.textContent = newPassword ? 'Профиль и пароль обновлены!' : 'Профиль обновлён!';
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;

    loadChats();

    setTimeout(() => {
      const modal = document.getElementById('settings-modal');
      if (modal.style.display !== 'none') closeSettings();
    }, 1500);
  } catch (e) {
    err.textContent = 'Ошибка сети';
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

// ==================== ПРОСМОТР ЧУЖОГО ПРОФИЛЯ ====================
async function openViewProfile() {
  if (!currentChat) return;
  const modal = document.getElementById('view-profile-modal');
  
  // Показываем модалку и загружаем данные
  modal.style.display = 'flex';
  document.getElementById('view-profile-avatar').textContent = currentChat.displayName[0].toUpperCase();
  document.getElementById('view-profile-name').textContent = currentChat.displayName;
  document.getElementById('view-profile-username').textContent = '@' + currentChat.username;
  document.getElementById('view-profile-bio').textContent = 'Загрузка...';
  document.getElementById('view-profile-created').textContent = '';
  
  // Прячем блок с датой, пока не загрузили
  const dateEl = document.getElementById('view-profile-chat-date');
  dateEl.style.display = 'none';
  dateEl.textContent = '';

  try {
    const r = await fetch('/api/user/' + currentChat.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const data = await r.json();
    if (!r.ok) return;

    // Описание профиля
    document.getElementById('view-profile-bio').textContent = data.bio || 'Пользователь ничего не рассказал о себе.';
    
    // Дата регистрации в SakhaChat
    if (data.createdAt) {
      const d = new Date(data.createdAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('view-profile-created').textContent = 'В SakhaChat с ' + formatted;
    }

    // Дата первого сообщения (начала общения)
    if (data.firstMessageAt) {
      const d = new Date(data.firstMessageAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      dateEl.textContent = '💬 Общаетесь с ' + formatted;
      dateEl.style.display = 'block';
    } else {
      dateEl.style.display = 'none';
    }
  } catch (e) {
    document.getElementById('view-profile-bio').textContent = 'Ошибка загрузки';
  }
}

function closeViewProfile() {
  document.getElementById('view-profile-modal').style.display = 'none';
}

// Обработчики кликов (закрытие модалок)
document.addEventListener('click', (e) => {
  const modal = document.getElementById('settings-modal');
  if (modal && modal.style.display !== 'none' && e.target === modal) closeSettings();
  
  const viewModal = document.getElementById('view-profile-modal');
  if (viewModal && viewModal.style.display !== 'none' && e.target === viewModal) closeViewProfile();
});
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('settings-modal');
  const viewModal = document.getElementById('view-profile-modal');
  if (e.key === 'Escape') {
    if (modal && modal.style.display !== 'none') closeSettings();
    if (viewModal && viewModal.style.display !== 'none') closeViewProfile();
  }
});

// ==================== ТЁМНАЯ ТЕМА ====================
function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.checked = isDark;
}

function toggleTheme(isDark) {
  localStorage.setItem('sakhachat_theme', isDark ? 'dark' : 'light');
  applyTheme(isDark);
}

// Применяем тему при загрузке: сохранённую, или системную
(function initTheme() {
  const savedTheme = localStorage.getItem('sakhachat_theme');
  if (savedTheme === 'dark') {
    applyTheme(true);
  } else if (savedTheme === 'light') {
    applyTheme(false);
  } else {
    applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
})();

// --- Boot ---
if (token && me) {
  initApp();
}