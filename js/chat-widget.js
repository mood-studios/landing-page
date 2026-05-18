import { io } from 'socket.io-client';
import { chatApi } from './api.js';
import { SOCKET_URL } from './config.js';
import { getUser } from './auth.js';

let socket = null;
let studio = null;
let myId = null;
let open = false;
let initialized = false;

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
  bubble.innerHTML = `
    <p class="chat-bubble-text">${escapeHtml(msg.message)}</p>
    <span class="chat-bubble-time">${formatTime(msg.createdAt)}</span>
  `;
  return bubble;
}

function appendMessage(msg, { scroll = true } = {}) {
  const list = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!list) return;

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

function connectSocket() {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL || window.location.origin, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => setChatStatus('Connected'));
  socket.on('disconnect', () => setChatStatus('Reconnecting…'));
  socket.on('connect_error', () => setChatStatus('Connection issue'));

  socket.on('receive_message', (data) => {
    if (!data || !open) return;
    appendMessage(data);
  });

  socket.on('error', (payload) => {
    setChatError(payload?.message || 'Could not send message');
  });

  return socket;
}

async function loadChat() {
  const list = document.getElementById('chatMessages');
  const empty = document.getElementById('chatEmpty');
  if (!list) return;

  list.innerHTML = '';
  if (empty) empty.classList.remove('hidden');
  setChatError('');
  setChatStatus('Loading…');

  studio = (await chatApi.getStudio()).data;
  const me = getUser();
  myId = String(me?._id || '');

  const title = document.getElementById('chatPanelTitle');
  if (title) title.textContent = studio?.name || 'Mood Studios';

  const studioId = String(studio._id);
  const history = await chatApi.getHistory(studioId);
  const messages = history.data?.messages || [];

  if (messages.length) {
    if (empty) empty.classList.add('hidden');
    messages.forEach((m) => list.appendChild(renderMessage(m)));
    scrollMessagesToEnd();
  }

  const sock = connectSocket();
  sock.emit('join_room', { receiverId: studioId });
  setChatStatus('Online');
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input?.value.trim();
  if (!text || !studio || !socket?.connected) return;

  setChatError('');
  socket.emit('send_message', {
    receiverId: String(studio._id),
    message: text,
  });
  input.value = '';
  input.focus();
}

function setPanelOpen(next) {
  open = next;
  const panel = document.getElementById('chatPanel');
  const fab = document.getElementById('chatFab');
  panel?.classList.toggle('hidden', !open);
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  fab?.classList.toggle('chat-fab--open', open);
  fab?.setAttribute('aria-expanded', open ? 'true' : 'false');

  if (open && !initialized) {
    initialized = true;
    loadChat().catch((err) => {
      setChatStatus('Offline');
      setChatError(err.message || 'Could not load chat');
    });
  }

  if (open) {
    document.getElementById('chatInput')?.focus();
    scrollMessagesToEnd();
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
}

export function teardownChatWidget() {
  socket?.disconnect();
  socket = null;
  initialized = false;
  open = false;
}
