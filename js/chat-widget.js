import { io } from 'socket.io-client';
import { chatApi, getAuthToken } from './api.js';
import { SOCKET_URL } from './config.js';
import { getUser } from './auth.js';

let socket = null;
let studio = null;
let myId = null;
let roomId = null;
let open = false;
let pollTimer = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function senderId(msg) {
  const s = msg.senderId;
  if (s && typeof s === 'object') {
    return String(s._id || s.id || '');
  }
  return String(s || '');
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function scrollMessagesToEnd() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

function renderMessage(msg) {
  const isMe = senderId(msg) === myId;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMe ? 'chat-bubble--me' : 'chat-bubble--them'}`;
  bubble.dataset.msgId = msg._id ? String(msg._id) : '';
  bubble.innerHTML = `
    <p class="chat-bubble-text">${escapeHtml(msg.message)}</p>
    <span class="chat-bubble-time">${formatTime(msg.createdAt)}</span>
  `;
  return bubble;
}

function messageExists(msgId) {
  if (!msgId || String(msgId).startsWith('temp-')) return false;
  return Boolean(document.querySelector(`[data-msg-id="${msgId}"]`));
}

function appendMessage(msg, { scroll = true } = {}) {
  const list = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!list || !msg) return;

  const id = msg._id ? String(msg._id) : '';
  if (id && messageExists(id)) return;

  if (empty) empty.classList.add('hidden');
  list.appendChild(renderMessage(msg));
  if (scroll) scrollMessagesToEnd();
}

/** Swap the latest optimistic bubble for the saved server message. */
function replaceOptimisticMessage(msg) {
  const list = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!list || !msg) return false;

  const id = msg._id ? String(msg._id) : '';
  if (id && messageExists(id)) return true;

  const temp = list.querySelector('[data-msg-id^="temp-"]:last-of-type');
  if (temp && id && !id.startsWith('temp-')) {
    temp.replaceWith(renderMessage(msg));
    if (empty) empty.classList.add('hidden');
    scrollMessagesToEnd();
    return true;
  }

  return false;
}

function handleIncomingMessage(data) {
  if (!data) return;

  if (data.roomId) roomId = data.roomId;

  const fromMe = senderId(data) === myId;
  const foreignRoom =
    !fromMe && data.roomId && roomId && data.roomId !== roomId;
  if (foreignRoom) return;

  if (fromMe && replaceOptimisticMessage(data)) return;
  appendMessage(data);
}

function setChatStatus(text) {
  const el = document.getElementById('chatStatus');
  if (el) el.textContent = text;
}

function setChatError(text) {
  const el = document.getElementById('chatError');
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function joinStudioRoom() {
  if (!socket?.connected || !studio?._id) return;
  socket.emit('join_room', { receiverId: String(studio._id) });
}

function connectSocket() {
  const token = getAuthToken();
  if (!token) return null;

  if (socket?.connected) {
    joinStudioRoom();
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL || window.location.origin, {
    auth: { token },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
  });

  socket.on('connect', () => {
    setChatStatus('Connected');
    joinStudioRoom();
  });
  socket.on('disconnect', () => setChatStatus('Reconnecting…'));
  socket.on('connect_error', () => setChatStatus('Connection issue'));

  socket.on('receive_message', handleIncomingMessage);

  socket.on('room_joined', (payload) => {
    if (payload?.roomId) roomId = payload.roomId;
  });

  socket.on('new_message_notification', ({ roomId: notifRoom, senderId: fromId }) => {
    const studioId = studio?._id ? String(studio._id) : '';
    if (fromId === myId) return;
    if (fromId === studioId || (notifRoom && roomId && notifRoom === roomId)) {
      loadChat({ quiet: true });
    }
  });

  socket.on('error', (payload) => {
    setChatError(payload?.message || 'Could not send message');
  });

  return socket;
}

async function loadChat({ quiet = false } = {}) {
  const list = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!list) return;

  if (!quiet) {
    list.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
    setChatError('');
    setChatStatus('Loading…');
  }

  studio = (await chatApi.getStudio()).data;
  const me = getUser();
  myId = String(me?._id || me?.id || '');

  const title = document.getElementById('chatPanelTitle');
  if (title) title.textContent = studio?.name || 'Mood Studios';

  const studioId = String(studio._id);
  const history = await chatApi.getHistory(studioId);
  roomId = history.data?.roomId || null;
  const messages = history.data?.messages || [];

  if (!quiet) {
    list.innerHTML = '';
    if (messages.length) {
      if (empty) empty.classList.add('hidden');
      messages.forEach((m) => list.appendChild(renderMessage(m)));
    } else if (empty) {
      empty.classList.remove('hidden');
    }
  } else {
    const existingIds = new Set(
      [...list.querySelectorAll('[data-msg-id]')].map((el) => el.dataset.msgId).filter(Boolean)
    );
    messages.forEach((m) => {
      const id = m._id ? String(m._id) : '';
      if (id && !existingIds.has(id)) {
        if (senderId(m) === myId && replaceOptimisticMessage(m)) return;
        appendMessage(m, { scroll: false });
      }
    });
    if (messages.length && empty) empty.classList.add('hidden');
  }

  scrollMessagesToEnd();
  connectSocket();
  setChatStatus(socket?.connected ? 'Online' : 'Connecting…');
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value.trim();
  if (!text || !studio) return;

  setChatError('');
  const tempId = `temp-${Date.now()}`;
  appendMessage({
    _id: tempId,
    message: text,
    senderId: { _id: myId },
    createdAt: new Date().toISOString(),
  });
  input.value = '';

  const studioId = String(studio._id);
  const sock = connectSocket();

  try {
    if (sock?.connected) {
      joinStudioRoom();
      sock.emit('send_message', {
        receiverId: studioId,
        message: text,
      });
      input.focus();
      return;
    }

    const res = await chatApi.sendMessage(studioId, text);
    const saved = res.data;
    if (saved && replaceOptimisticMessage(saved)) {
      input.focus();
      return;
    }
    if (saved) {
      handleIncomingMessage(saved);
    }
    input.focus();
  } catch (err) {
    const list = document.getElementById('chatMessages');
    list?.querySelector(`[data-msg-id="${tempId}"]`)?.remove();
    setChatError(err.message || 'Could not send message');
    input.value = text;
    input.focus();
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (open && studio) loadChat({ quiet: true });
  }, 12000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function setPanelOpen(next) {
  open = next;
  const panel = document.getElementById('chatPanel');
  const fab = document.getElementById('chatFab');
  panel?.classList.toggle('hidden', !open);
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  fab?.classList.toggle('chat-fab--open', open);
  fab?.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open) {
    loadChat().catch((err) => {
      setChatStatus('Offline');
      setChatError(err.message || 'Could not load chat');
    });
    startPolling();
    document.getElementById('chatInput')?.focus();
    scrollMessagesToEnd();
  } else {
    stopPolling();
  }
}

function toggleChatPanel() {
  setPanelOpen(!open);
}

export function initChatWidget() {
  const fab = document.getElementById('chatFab');
  const closeBtn = document.getElementById('chatCloseBtn');
  const form = document.getElementById('chatForm');

  fab?.addEventListener('click', toggleChatPanel);
  closeBtn?.addEventListener('click', () => setPanelOpen(false));

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setPanelOpen(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && open) {
      loadChat({ quiet: true });
      joinStudioRoom();
    }
  });
}

export function teardownChatWidget() {
  stopPolling();
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  studio = null;
  roomId = null;
  open = false;
}
