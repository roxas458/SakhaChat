let token = localStorage.getItem('sakhachat_token');
let me = JSON.parse(localStorage.getItem('sakhachat_user') || 'null');
let socket = null;
let currentChat = null;
let onlineUsers = new Set();
let usersCache = [];

// ==================== СЛОВАРЬ ПЕРЕВОДОВ ====================
const i18n = {
  ru: {
    tagline: 'Кэпсэтиэх, доҕоттор!',
    login: 'Вход',
    loginPlaceholder: 'Логин',
    passwordPlaceholder: 'Пароль',
    loginBtn: 'Войти',
    noAccount: 'Нет аккаунта?',
    register: 'Регистрация',
    registerTitle: 'Регистрация',
    displayNamePlaceholder: 'Отображаемое имя',
    registerBtn: 'Создать',
    haveAccount: 'Есть аккаунт?',
    settingsTitle: 'Настройки профиля',
    logoutTitle: 'Выйти',
    searchPlaceholder: 'Поиск пользователей...',
    selectChat: 'Выберите собеседника',
    backTitle: 'Назад',
    messagePlaceholder: 'Сообщение...',
    displayName: 'Отображаемое имя',
    yourName: 'Ваше имя',
    displayNameHint: 'Как вас будут видеть другие',
    bio: 'О себе',
    bioPlaceholder: 'Расскажите о себе...',
    bioHint: 'До 150 символов. Видно другим пользователям.',
    changePassword: 'Смена пароля',
    currentPassword: 'Текущий пароль',
    newPassword: 'Новый пароль (от 4 символов)',
    passwordHint: 'Оставьте пустым, если не хотите менять',
    appearance: 'Оформление',
    darkTheme: 'Тёмная тема',
    themeHint: 'Применяется сразу ко всему мессенджеру',
    language: 'Язык',
    languageHint: 'Применяется сразу ко всему интерфейсу',
    cancel: 'Отмена',
    save: 'Сохранить',
    userProfile: 'Профиль пользователя',
    noBio: 'Пользователь ничего не рассказал о себе.',
    close: 'Закрыть',
    // Динамические
    inNetwork: 'в сети',
    notInNetwork: 'не в сети',
    wasRecently: 'был(а) недавно',
    wasJustNow: 'был(а) только что',
    wasMinutesAgo: 'был(а) {n} мин. назад',
    wasTodayAt: 'был(а) сегодня в {time}',
    wasYesterdayAt: 'был(а) вчера в {time}',
    wasDate: 'был(а) {date}',
    userNotFound: 'Пользователь не найден',
    checkLogin: 'Проверьте правильность написания логина (только латиница, без @).',
    findFriends: 'Поиск друзей',
    enterLogin: 'Введите <b>точный логин</b> друга в поле поиска выше, чтобы найти его и начать общение.',
    today: 'Сегодня',
    yesterday: 'Вчера',
    online: 'в сети',
    offline: 'был(а) недавно',
    errorNetwork: 'Ошибка сети',
    saving: 'Сохранение...',
    profileUpdated: 'Профиль обновлён!',
    profileAndPasswordUpdated: 'Профиль и пароль обновлены!',
    nameEmpty: 'Имя не может быть пустым',
    saved: 'Избранное',
    savedHint: 'Заметки для себя',
    savedOnly: 'Только для тебя',
    savedEmpty: 'Не удалось загрузить'
  },
  sah: {
    tagline: 'Кэпсэтиэх, доҕоттор!',
    login: 'Киирии',
    loginPlaceholder: 'Логин',
    passwordPlaceholder: 'Кистэл',
    loginBtn: 'Киир',
    noAccount: 'Аккаунт суох?',
    register: 'Бэлиэтэнии',
    registerTitle: 'Бэлиэтэнии',
    displayNamePlaceholder: 'Көстөр ааккыт',
    registerBtn: 'Оҥор',
    haveAccount: 'Аккаунт баар?',
    settingsTitle: 'Бэйэ уларытыыта',
    logoutTitle: 'Таҕыс',
    searchPlaceholder: 'Кыттааччыны көрдөө...',
    selectChat: 'Кэпсэтээччини тал',
    backTitle: 'Төнүн',
    messagePlaceholder: 'Сурук...',
    displayName: 'Көстөр ааккыт',
    yourName: 'Ааккыт',
    displayNameHint: 'Атын дьон эйигин хайдах көрүөхтэрэ',
    bio: 'Бэйэҥ тускунан',
    bioPlaceholder: 'Бэйэҥ тускунан кэпсээ...',
    bioHint: '150 бэлиэҕэ дылы. Атын дьоҥҥо көстөр.',
    changePassword: 'Кистэли уларытыы',
    currentPassword: 'Билиҥҥи кистэл',
    newPassword: 'Саҥа кистэл (4 бэлиэттэн)',
    passwordHint: 'Уларыппат буоллаххына, кураанах хааллар',
    appearance: 'Көстүү',
    darkTheme: 'Хараҥа тиэмэ',
    themeHint: 'Бүтүн мессенджерга тутатына',
    language: 'Тыл',
    languageHint: 'Бүтүн интерфейска тутатына',
    cancel: 'Салҕаа',
    save: 'Уларыт',
    userProfile: 'Кыттааччы профила',
    noBio: 'Кыттааччы бэйэтин тускунан тугу да кэпсээбэтэҕэ.',
    close: 'Салҕаа',
    // Динамические
    inNetwork: 'ситимҥэ',
    notInNetwork: 'ситимҥэ суох',
    wasRecently: 'сотору',
    wasJustNow: 'билигин',
    wasMinutesAgo: '{n} мүн. ынараа өттүгэр',
    wasTodayAt: 'бүгүн {time}',
    wasYesterdayAt: 'бэҕэһээ {time}',
    wasDate: '{date}',
    userNotFound: 'Кыттааччы көстүбэтэ',
    checkLogin: 'Логин суруйуутун көннөр (латиница эрэ, @ суох).',
    findFriends: 'Доҕоттору көрдөө',
    enterLogin: 'Үөһээ көрдөөххө <b>сөптөөх логины</b> суруй.',
    today: 'Бүгүн',
    yesterday: 'Бэҕэһээ',
    online: 'ситимҥэ',
    offline: 'сотору',
    errorNetwork: 'Ситим алҕаһа',
    saving: 'Уларытыы...',
    profileUpdated: 'Профил уларытылынна!',
    profileAndPasswordUpdated: 'Профил уонна кистэл уларытылынна!',
    nameEmpty: 'Ааккыт кураанах буолбат',
    saved: 'Талыллыбыт',
    savedHint: 'Бэйэҕэр суруктар',
    savedOnly: 'Эрэ эйиэхэ эрэ',
    savedEmpty: 'Сабалларбата'
  }
};

let currentLang = localStorage.getItem('sakhachat_lang') || 'ru';

function t(key) {
  return (i18n[currentLang] && i18n[currentLang][key]) || i18n.ru[key] || key;
}

function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.innerHTML = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  
  const langSelect = document.getElementById('lang-select');
  if (langSelect) langSelect.value = currentLang;

  renderUserList();
  updateStatus();
  
  document.title = 'SakhaChat';
}

function changeLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('sakhachat_lang', lang);
  applyLanguage();
}

// ==================== УТИЛИТЫ ====================
function isMobile() { return window.matchMedia('(max-width: 700px)').matches; }

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName })
    });
    const data = await r.json();
    if (!r.ok) return err.textContent = data.error;
    onLogin(data);
  } catch (e) { err.textContent = t('errorNetwork'); }
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await r.json();
    if (!r.ok) return err.textContent = data.error;
    onLogin(data);
  } catch (e) { err.textContent = t('errorNetwork'); }
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
    await fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  } catch (e) {}
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

  applyLanguage();
  connectSocket();
  loadChats();
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
      markAsUnread(msg.sender_id);
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
  const r = await fetch('/api/chats', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return;
  usersCache = await r.json();
  
  if (currentChat && currentChat.id !== 'saved') {
    const updated = usersCache.find(u => u.id === currentChat.id);
    if (updated) currentChat.lastSeen = updated.lastSeen;
    updateStatus();
  }
  renderUserList();
}

async function searchUsers(q) {
  const query = q.trim();
  if (query.length < 3) { loadChats(); return; }
  const r = await fetch('/api/users?q=' + encodeURIComponent(query), { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return;
  usersCache = await r.json();
  renderUserList();
}

let unreadChats = JSON.parse(localStorage.getItem('sakhachat_unread') || '{}');

function markAsRead(userId) {
  if (unreadChats[userId]) {
    delete unreadChats[userId];
    localStorage.setItem('sakhachat_unread', JSON.stringify(unreadChats));
  }
}

function markAsUnread(userId) {
  unreadChats[userId] = true;
  localStorage.setItem('sakhachat_unread', JSON.stringify(unreadChats));
}

function renderUserList() {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  const searchValue = document.getElementById('search').value.trim();
  const isSearching = searchValue.length >= 3;
  
  const isDark = document.body.classList.contains('dark');
  const titleColor = isDark ? '#e4e6eb' : '#555';
  const textColor = isDark ? '#b0b3b8' : '#888';

  // 1. Добавляем «Избранное» ВСЕГДА (если не ищем)
  if (!isSearching) {
    const savedDiv = document.createElement('div');
    savedDiv.className = 'user-item' + (currentChat && currentChat.id === 'saved' ? ' active' : '');
    savedDiv.innerHTML = `
      <div class="avatar" style="background: linear-gradient(135deg, #f5af19, #f12711);">⭐</div>
      <div>
        <div class="name">${t('saved')}</div>
        <div class="username">${t('savedHint')}</div>
      </div>
    `;
    savedDiv.onclick = () => openSavedChat();
    list.appendChild(savedDiv);

    // Разделитель
    const divider = document.createElement('div');
    divider.style.cssText = `height: 1px; background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; margin: 6px 8px;`;
    list.appendChild(divider);
  }

  if (!usersCache.length) {
    if (isSearching) {
      list.innerHTML = `
        <div style="padding: 30px 20px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 12px;">🤷‍♂️</div>
          <div style="font-size: 14px; font-weight: 600; color: ${titleColor}; margin-bottom: 8px;">${t('userNotFound')}</div>
          <div style="font-size: 13px; line-height: 1.5; color: ${textColor};">${t('checkLogin')}</div>
        </div>
      `;
    } else {
      list.innerHTML += `
        <div style="padding: 30px 20px; text-align: center;">
          <div style="font-size: 40px; margin-bottom: 12px;">🔒</div>
          <div style="font-size: 15px; font-weight: 600; color: ${titleColor}; margin-bottom: 8px;">${t('findFriends')}</div>
          <div style="font-size: 13px; line-height: 1.5; color: ${textColor};">${t('enterLogin')}</div>
        </div>
      `;
    }
    return;
  }

  for (const u of usersCache) {
    const isOnline = onlineUsers.has(u.id);
    const isUnread = unreadChats[u.id] && !(currentChat && currentChat.id === u.id);
    const div = document.createElement('div');
    div.className = 'user-item' + (currentChat && currentChat.id === u.id ? ' active' : '');
    div.innerHTML = `
      <div class="avatar">${escapeHtml(u.displayName[0].toUpperCase())}${isOnline ? '<span class="online-dot"></span>' : ''}</div>
      <div>
        <div class="name" style="${isUnread ? 'font-weight: 800;' : ''}">${escapeHtml(u.displayName)}</div>
        <div class="username">@${escapeHtml(u.username)}</div>
      </div>
      ${isUnread ? '<span style="margin-left: auto; background: #667eea; color: white; border-radius: 50%; width: 10px; height: 10px; display: block;"></span>' : ''}
    `;
    div.onclick = () => openChat(u);
    list.appendChild(div);
  }
}

// ==================== ЭМОДЗИ ====================
const EMOJI_DATA = {
  smileys: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
  gestures: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤝','🙏','💪','🦾','🖕','✍️','🤳','💅','👏','🙌','👐','🤲','🤜','🤛','✊','👊','🫶','🫰','🫱','🫲','🫳','🫴'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','🔥','✨','💫','⭐','🌟','💥','💯','🎉','🎊'],
  food: ['🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','☕','🍵','🧃','🥤','🧋','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉'],
  nature: ['🌿','🍀','🍁','🍂','🍃','🌱','🌲','🌳','🌴','🌵','🌾','🌻','🌺','🌸','🌼','🌷','🌹','🥀','💐','🌎','🌍','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','⭐','🌟','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','💧','💦','☔','🌈','⚡','🔥','✨'],
  objects: ['🎉','🎊','🎈','🎁','🎂','🎀','🎗️','🎟️','🎫','🏆','🏅','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥊','🎯','🎲','🎮','🎰','🎸','🎹','🎺','🎻','🥁','🎤','🎧','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📀','📷','📹','🎥','📞','☎️','📺','📻','⏰','⌚','💡','🔦','🕯️','💰','💎','🔑','🔒','🔓','📚','📖','📝','✏️','🖊️','🖋️','📌','📎','🔗','🎓','🏠','🏡','🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','✈️','🚀','🛸']
};

let emojiPanelOpen = false;

function renderEmojiGrid(category) {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  const list = EMOJI_DATA[category] || [];
  grid.innerHTML = list.map(e =>
    `<button type="button" onclick="insertEmoji('${e}')">${e}</button>`
  ).join('');
}

function switchEmojiTab(category, btn) {
  document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEmojiGrid(category);
}

function toggleEmojiPanel(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('emoji-panel');
  if (!panel) return;

  emojiPanelOpen = !emojiPanelOpen;
  if (emojiPanelOpen) {
    const activeTab = document.querySelector('.emoji-tab.active');
    const cat = activeTab ? activeTab.dataset.cat : 'smileys';
    renderEmojiGrid(cat);
    panel.style.display = 'flex';
  } else {
    panel.style.display = 'none';
  }
}

function closeEmojiPanel() {
  const panel = document.getElementById('emoji-panel');
  if (!panel) return;
  panel.style.display = 'none';
  emojiPanelOpen = false;
}

function insertEmoji(emoji) {
  const input = document.getElementById('message-input');
  if (!input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);

  input.value = before + emoji + after;
  const newPos = start + emoji.length;
  input.focus();
  input.setSelectionRange(newPos, newPos);
}

// --- Chat ---
async function openChat(user) {
  document.getElementById('search').value = '';
  closeEmojiPanel();
  if (isMobile()) document.getElementById('sidebar').classList.add('hidden');

  markAsRead(user.id);
  currentChat = user;

  const container = document.getElementById('messages');
  container.innerHTML = '';

  document.getElementById('empty-chat').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';
  document.getElementById('chat-avatar').textContent = user.displayName[0].toUpperCase();
  document.getElementById('chat-avatar').style.background = '';
  document.getElementById('chat-name').textContent = user.displayName;
  updateStatus();
  loadChats();

  try {
    const r = await fetch('/api/messages/' + user.id, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Ошибка загрузки');
    const messages = await r.json();

    container.innerHTML = '';
    for (const m of messages) appendMessage(m, false);
    scrollBottom();
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #e53935;">${t('errorNetwork')}</div>`;
  }

  if (!isMobile()) document.getElementById('message-input').focus();
}

// --- Избранное ---
async function openSavedChat() {
  document.getElementById('search').value = '';
  closeEmojiPanel();
  if (isMobile()) document.getElementById('sidebar').classList.add('hidden');

  currentChat = { id: 'saved', displayName: t('saved'), username: 'saved' };

  const container = document.getElementById('messages');
  container.innerHTML = '';

  document.getElementById('empty-chat').style.display = 'none';
  document.getElementById('chat').style.display = 'flex';
  document.getElementById('chat-avatar').textContent = '⭐';
  document.getElementById('chat-avatar').style.background = 'linear-gradient(135deg, #f5af19, #f12711)';
  document.getElementById('chat-name').textContent = t('saved');
  document.getElementById('chat-status').textContent = t('savedOnly');
  document.getElementById('chat-status').className = 'status';
  
  renderUserList();

  try {
    const r = await fetch('/api/saved-messages', { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) throw new Error('Ошибка загрузки');
    const messages = await r.json();

    container.innerHTML = '';
    for (const m of messages) appendMessage(m, false);
    scrollBottom();
  } catch (e) {
    container.innerHTML = `<div style="text-align: center; padding: 40px; color: #e53935;">${t('savedEmpty')}</div>`;
  }

  if (!isMobile()) document.getElementById('message-input').focus();
}

function closeChatOnMobile() {
  document.getElementById('sidebar').classList.remove('hidden');
  currentChat = null;
  document.getElementById('chat').style.display = 'none';
  document.getElementById('empty-chat').style.display = 'flex';
  loadChats();
}

function formatLastSeen(lastSeenStr) {
  if (!lastSeenStr) return t('wasRecently');
  
  const d = new Date(lastSeenStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return t('wasJustNow');
  if (diffMins < 60) return t('wasMinutesAgo').replace('{n}', diffMins);
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24 && now.getDate() === d.getDate()) {
    return t('wasTodayAt').replace('{time}', d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}));
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth()) {
    return t('wasYesterdayAt').replace('{time}', d.toLocaleTimeString('ru-RU', {hour: '2-digit', minute:'2-digit'}));
  }
  
  return t('wasDate').replace('{date}', d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'}));
}

function updateStatus() {
  if (!currentChat) return;
  if (currentChat.id === 'saved') {
    document.getElementById('chat-status').textContent = t('savedOnly');
    document.getElementById('chat-status').className = 'status';
    return;
  }
  const el = document.getElementById('chat-status');

  if (onlineUsers.has(currentChat.id)) {
    el.textContent = t('inNetwork');
    el.className = 'status';
  } else {
    el.textContent = formatLastSeen(currentChat.lastSeen);
    el.className = 'status offline';
  }
}

// --- Отрисовка сообщений ---
function formatDateForDivider(dateStr) {
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffTime = today - msgDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('today');
  if (diffDays === 1) return t('yesterday');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function appendMessage(msg, animate) {
  const container = document.getElementById('messages');
  
  const lastMsgEl = container.querySelector('.message:last-child');
  let needDateDivider = false;
  
  if (!lastMsgEl) {
    needDateDivider = true;
  } else {
    const prevDateStr = lastMsgEl.dataset.createdAt;
    if (prevDateStr && prevDateStr.slice(0, 10) !== msg.created_at.slice(0, 10)) {
      needDateDivider = true;
    }
  }

  if (needDateDivider) {
    const dateDiv = document.createElement('div');
    dateDiv.className = 'date-divider';
    dateDiv.textContent = formatDateForDivider(msg.created_at);
    container.appendChild(dateDiv);
  }

  const isMine = msg.sender_id === me.id;
  const div = document.createElement('div');
  div.className = 'message ' + (isMine ? 'mine' : 'theirs');
  div.dataset.createdAt = msg.created_at;
  
  if (!animate) div.style.animation = 'none';
  
  const time = new Date(msg.created_at + 'Z').toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  
  div.innerHTML = escapeHtml(msg.text) + `<span class="time">${time}</span>`;
  container.appendChild(div);
  scrollBottom();
}

function scrollBottom() {
  const c = document.getElementById('messages');
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !currentChat) return;

  closeEmojiPanel();

  // Если это Избранное — отправляем через REST API
  if (currentChat.id === 'saved') {
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ text })
    })
    .then(r => r.json())
    .then(msg => {
      appendMessage(msg, true);
      input.value = '';
    })
    .catch(e => alert(t('errorNetwork')));

    if (!isMobile()) input.focus();
    return;
  }
  
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

  const langSelect = document.getElementById('lang-select');
  if (langSelect) langSelect.value = currentLang;

  try {
    const r = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
    const data = await r.json();
    if (!r.ok) { document.getElementById('settings-error').textContent = data.error || t('errorNetwork'); return; }

    document.getElementById('settings-avatar').textContent = data.displayName[0].toUpperCase();
    document.getElementById('settings-username-display').textContent = data.displayName;
    document.getElementById('settings-username').textContent = '@' + data.username;
    document.getElementById('settings-displayName').value = data.displayName;
    document.getElementById('settings-bio').value = data.bio || '';

    if (data.createdAt) {
      const d = new Date(data.createdAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('settings-created').textContent = 'В SakhaChat с ' + formatted;
    }
  } catch (e) { document.getElementById('settings-error').textContent = t('errorNetwork'); }
}

function closeSettings() { document.getElementById('settings-modal').style.display = 'none'; }

async function saveProfile() {
  const err = document.getElementById('settings-error');
  const ok = document.getElementById('settings-success');
  err.textContent = ''; ok.textContent = '';

  const displayName = document.getElementById('settings-displayName').value.trim();
  const bio = document.getElementById('settings-bio').value;
  const currentPassword = document.getElementById('settings-currentPassword').value;
  const newPassword = document.getElementById('settings-newPassword').value;

  if (!displayName) { err.textContent = t('nameEmpty'); return; }

  const saveBtn = document.querySelector('#settings-modal .btn-primary');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true; saveBtn.textContent = t('saving');

  try {
    const body = { displayName, bio };
    if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

    const r = await fetch('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body)
    });
    const data = await r.json();

    if (!r.ok) { err.textContent = data.error || 'Ошибка'; saveBtn.disabled = false; saveBtn.textContent = originalText; return; }

    me.displayName = data.displayName;
    me.bio = data.bio;
    localStorage.setItem('sakhachat_user', JSON.stringify(me));
    document.getElementById('me-name').textContent = me.displayName;
    document.getElementById('me-avatar').textContent = me.displayName[0].toUpperCase();
    document.getElementById('settings-avatar').textContent = me.displayName[0].toUpperCase();
    document.getElementById('settings-username-display').textContent = me.displayName;
    document.getElementById('settings-currentPassword').value = '';
    document.getElementById('settings-newPassword').value = '';

    ok.textContent = newPassword ? t('profileAndPasswordUpdated') : t('profileUpdated');
    saveBtn.disabled = false; saveBtn.textContent = originalText;
    loadChats();
    setTimeout(() => { if (document.getElementById('settings-modal').style.display !== 'none') closeSettings(); }, 1500);
  } catch (e) { err.textContent = t('errorNetwork'); saveBtn.disabled = false; saveBtn.textContent = originalText; }
}

// ==================== ПРОСМОТР ЧУЖОГО ПРОФИЛЯ ====================
async function openViewProfile() {
  if (!currentChat || currentChat.id === 'saved') return; // Для избранного профиль не нужен
  const modal = document.getElementById('view-profile-modal');
  
  modal.style.display = 'flex';
  document.getElementById('view-profile-avatar').textContent = currentChat.displayName[0].toUpperCase();
  document.getElementById('view-profile-name').textContent = currentChat.displayName;
  document.getElementById('view-profile-username').textContent = '@' + currentChat.username;
  document.getElementById('view-profile-created').textContent = '';
  
  const bioEl = document.getElementById('view-profile-bio');
  bioEl.textContent = '';
  
  const dateEl = document.getElementById('view-profile-chat-date');
  dateEl.textContent = '';

  try {
    const r = await fetch('/api/user/' + currentChat.id, { headers: { Authorization: 'Bearer ' + token } });
    const data = await r.json();
    if (!r.ok) throw new Error('Ошибка загрузки');

    bioEl.textContent = data.bio || t('noBio');
    
    if (data.createdAt) {
      const d = new Date(data.createdAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('view-profile-created').textContent = 'В SakhaChat с ' + formatted;
    }

    if (data.firstMessageAt) {
      const d = new Date(data.firstMessageAt.replace(' ', 'T') + 'Z');
      const formatted = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
      dateEl.textContent = '💬 Общаетесь с ' + formatted;
    }
  } catch (e) {
    bioEl.textContent = t('errorNetwork');
  }
}

function closeViewProfile() { document.getElementById('view-profile-modal').style.display = 'none'; }

document.addEventListener('click', (e) => {
  const modal = document.getElementById('settings-modal');
  if (modal && modal.style.display !== 'none' && e.target === modal) closeSettings();
  const viewModal = document.getElementById('view-profile-modal');
  if (viewModal && viewModal.style.display !== 'none' && e.target === viewModal) closeViewProfile();

  // Закрытие эмодзи-панели по клику вне
  if (emojiPanelOpen) {
    const panel = document.getElementById('emoji-panel');
    const btn = document.getElementById('emoji-btn');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      closeEmojiPanel();
    }
  }
});
document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('settings-modal');
  const viewModal = document.getElementById('view-profile-modal');
  if (e.key === 'Escape') {
    if (modal && modal.style.display !== 'none') closeSettings();
    if (viewModal && viewModal.style.display !== 'none') closeViewProfile();
    if (emojiPanelOpen) closeEmojiPanel();
  }
});

// ==================== ТЁМНАЯ ТЕМА ====================
function applyTheme(isDark) {
  if (isDark) document.body.classList.add('dark');
  else document.body.classList.remove('dark');
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.checked = isDark;
  
  renderUserList();
}

function toggleTheme(isDark) {
  localStorage.setItem('sakhachat_theme', isDark ? 'dark' : 'light');
  applyTheme(isDark);
}

(function initTheme() {
  const savedTheme = localStorage.getItem('sakhachat_theme');
  if (savedTheme === 'dark') applyTheme(true);
  else if (savedTheme === 'light') applyTheme(false);
  else applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
})();

// --- Boot ---
if (token && me) initApp();