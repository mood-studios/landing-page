import { io } from 'socket.io-client';
import { chatApi } from './api.js';
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
  if (s && typeof s === 'object') return String(s._id);
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
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL || window.location.origin, {
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

  socket.on('receive_message', (data) => {
    if (!data) return;
    if (data.roomId && roomId && data.roomId !== roomId) return;
    appendMessage(data);
  });

  socket.on('new_message_notification', ({ roomId: notifRoom, senderId: fromId }) => {
    const studioId = studio?._id ? String(studio._id) : '';
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
  myId = String(me?._id || '');

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
      if (id && !existingIds.has(id)) appendMessage(m, { scroll: false });
    });
    if (messages.length && empty) empty.classList.add('hidden');
  }

  scrollMessagesToEnd();
  connectSocket();
  joinStudioRoom();
  setChatStatus('Online');
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value.trim();
  if (!text || !studio) return;

  setChatError('');
  appendMessage({
    _id: `temp-${Date.now()}`,
    message: text,
    senderId: { _id: myId },
    createdAt: new Date().toISOString(),
  });

  if (!socket?.connected) {
    input.value = '';
    loadChat({ quiet: true });
    return;
  }

  socket.emit('send_message', {
    receiverId: String(studio._id),
    message: text,
  });
  input.value = '';
  input.focus();
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
  socket?.disconnect();
  socket = null;
  studio = null;
  roomId = null;
  open = false;
}
