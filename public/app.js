let token = localStorage.getItem('sakhachat_token');
let me = JSON.parse(localStorage.getItem('sakhachat_user') || 'null');
let socket = null;
let currentChat = null; // {id, displayName, username}
let onlineUsers = new Set();
let usersCache = [];

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
  await fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
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
  searchUsers('');
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
    }
  });
  socket.on('connect_error', () => {
    // token invalid
    localStorage.clear();
    location.reload();
  });
}

// --- Users ---
async function searchUsers(q) {
  const r = await fetch('/api/users?q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!r.ok) return;
  usersCache = await r.json();
  renderUserList();
}

function renderUserList() {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  if (!usersCache.length) {
    list.innerHTML = '<p style="padding:16px;color:#999;font-size:14px;text-align:center">Никого не найдено</p>';
    return;
  }
  for (const u of usersCache) {
    const isOnline = onlineUsers.has(u.id);
    const div = document.createElement('div');
    div.className = 'user-item' + (currentChat && currentChat.id === u.id ? ' active' : '');
    div.innerHTML = `
      <div class="avatar">${u.displayName[0].toUpperCase()}${isOnline ? '<span class="online-dot"></span>' : ''}</div>
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
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// --- Chat ---
async function openChat(user) {
  currentChat = user;
  document.getElementById('empty-chat').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';
  document.getElementById('chat-avatar').textContent = user.displayName[0].toUpperCase();
  document.getElementById('chat-name').textContent = user.displayName;
  updateStatus();
  renderUserList();

  const r = await fetch('/api/messages/' + user.id, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const messages = await r.json();
  const container = document.getElementById('messages');
  container.innerHTML = '';
  for (const m of messages) appendMessage(m, false);
  scrollBottom();
  document.getElementById('message-input').focus();
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

function appendMessage(msg, animate) {
  const container = document.getElementById('messages');
  const isMine = msg.sender_id === me.id;
  const div = document.createElement('div');
  div.className = 'message ' + (isMine ? 'mine' : 'theirs');
  if (!animate) div.style.animation = 'none';
  const time = new Date(msg.created_at + 'Z').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = escapeHtml(msg.text) + `<span class="time">${time}</span>`;
  container.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  const c = document.getElementById('messages');
  c.scrollTop = c.scrollHeight;
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !currentChat) return;
  socket.emit('send_message', { to: currentChat.id, text }, (msg) => {
    appendMessage(msg, true);
  });
  input.value = '';
  input.focus();
}

// --- Boot ---
if (token && me) {
  initApp();
}