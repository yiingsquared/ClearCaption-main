import { t, getLocale, setLocale, options, languages } from '../shared/i18n.js';
import { icon, brand, escapeHTML as esc } from '../shared/icons.js';
import { sampleEntry, sampleCount, sampleTitle, sampleNotes } from './sample.js';
import { SpeechSession } from './speech.js';

const $ = selector => document.querySelector(selector);
const native = window.clearcaption;
const state = {
  route: 'dashboard', user: null, token: sessionStorage.getItem('cc-token') || '',
  sessions: [], current: null, config: {}, dirty: false, partial: '', error: '',
  target: localStorage.getItem('cc-translation') || 'zh',
  theme: localStorage.getItem('cc-theme') || 'light',
  size: Math.min(54, Math.max(24, Number(localStorage.getItem('cc-size')) || 32)),
  overlay: false, finishing: false, saving: false, generating: false,
  serviceURL: '', filter: '',
};
let speech, demoTimer, pollTimer, timer, modalReturnFocus, toastTimer;
const pending = new Set(), translations = new Set();
const time = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const date = n => new Intl.DateTimeFormat(getLocale() === 'zh' ? 'zh-CN' : getLocale(), { dateStyle: 'medium' }).format(n);
const btn = (action, label, name, cls = '', attrs = '') => `<button class="button ${cls}" data-action="${action}" ${attrs}>${name ? icon(name) : ''}${t(label)}</button>`;
function errorText(e) { const code = typeof e === 'string' ? e : e.message; return t(code) === code ? t('error') : t(code); }
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 6500); }
async function api(path, { method = 'GET', body, roomToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const memberToken = roomToken || state.current?.memberToken;
  if (memberToken) headers['X-Room-Token'] = memberToken;
  let result;
  if (native) result = await native.api({ path, method, headers, body });
  else {
    const response = await fetch(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(50000) });
    let data;
    try { data = await response.json(); } catch { throw new Error('SERVICE_ERROR'); }
    result = { ok: response.ok, data };
  }
  if (!result.ok) throw new Error(result.data?.error || 'SERVICE_ERROR');
  return result.data;
}
async function loadSessions() {
  if (state.user) state.sessions = (await api('/api/sessions')).sessions;
  else state.sessions = [];
}
async function refreshConfig() { state.config = await api('/api/config'); }
function setDirty(value = true) {
  state.dirty = value;
  native?.setBusy(!!state.current?.active || value);
  const indicator = $('#save-status');
  if (indicator) indicator.textContent = t(value ? 'unsaved' : 'saved');
}
function shell() {
  document.body.dataset.theme = state.theme;
  document.documentElement.lang = getLocale() === 'zh' ? 'zh-CN' : getLocale();
  document.documentElement.style.setProperty('--caption-size', `${state.size}px`);
  native?.setBusy(!!state.current?.active || state.dirty);
  const current = state.current;
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="/" aria-label="ClearCaption">${brand}</a><nav class="nav-list" aria-label="Navigation">
    ${[['dashboard','home'],['live','mic'],['library','folder'],['settings','settings']].map(([route,name]) => `<button class="nav-item ${state.route === route || route === 'library' && state.route === 'editor' ? 'active' : ''}" data-route="${route}" title="${t(route)}">${icon(name)}<span>${t(route)}</span></button>`).join('')}
    </nav><div class="sidebar-bottom"><div class="privacy-mini">${icon('shield')}${t('textOnly')}</div><div class="user-card"><button class="avatar" data-action="${state.user ? 'account' : 'login'}" aria-label="${t('signIn')}" style="border:0">${esc(state.user?.name.slice(0, 2).toUpperCase() || 'G')}</button><div class="user-details"><b>${esc(state.user?.name || t('guest'))}</b><button class="link-button" data-action="${state.user ? 'logout' : 'login'}">${t(state.user ? 'signOut' : 'signIn')}</button></div></div></div></aside>
    <div class="main"><header class="topbar"><span class="breadcrumb">${t('workspace')} &nbsp; / &nbsp; ${t(state.route === 'editor' ? 'review' : state.route)}</span><div class="topbar-right">${current?.active ? `<button class="status ${current.paused ? 'paused' : ''}" data-action="back-live" style="background:none;border:0"><span class="status-dot"></span>${t(current.demo ? 'demo' : current.paused ? 'paused' : 'listening')}</button>` : `<span class="fine">${t('textOnly')}</span>`}<select id="interface-language" class="locale-select" aria-label="${t('interfaceLanguage')}">${options(getLocale())}</select></div></header><main class="content" id="main-content"></main></div></div>`;
  renderRoute();
}
function renderRoute() {
  if (state.route === 'live' && !state.current) state.route = 'dashboard';
  if (state.route === 'editor' && !state.current) state.route = 'library';
  const views = { dashboard, liveView, library: libraryView, settings: settingsView, editor: editorView };
  $('#main-content').innerHTML = (state.route === 'live' ? liveView : views[state.route])();
  if (state.route === 'live') updateLive();
  if (state.route === 'editor') resizeEntries();
}
function sessionRows(sessions) {
  if (!sessions.length) return `<div class="card empty">${icon('notes')}<h3>${t(state.filter ? 'noMatches' : 'emptyTitle')}</h3><p>${t('emptyText')}</p></div>`;
  return `<div class="card">${sessions.map(s => `<button class="session-row" data-open="${esc(s.id)}">${icon('notes')}<div><b>${esc(s.title)}</b><span>${date(s.created)} &nbsp; · &nbsp; ${time(s.duration)} &nbsp; · &nbsp; ${languages[s.language] || s.language}</span></div>${s.demo ? `<small class="badge">${t('demo')}</small>` : ''}</button>`).join('')}</div>`;
}
function dashboard() {
  return `<div class="page-intro"><div><div class="eyebrow">CLEARCAPTION</div><h1>${t('welcome')}</h1><p>${t('welcomeText')}</p></div>${state.current ? btn('back-live', state.current.active ? 'backLive' : 'review', 'notes', 'tint') : ''}</div>
    <div class="mode-cards"><section class="card mode-card"><div class="mode-icon">${icon('mic')}</div><h2>${t('presenter')}</h2><p>${t('presenterText')}</p><div class="card-actions">${btn('presenter','startPresent','plus','primary')}</div></section><section class="card mode-card"><div class="mode-icon blue">${icon('headphones')}</div><h2>${t('listener')}</h2><p>${t('listenerText')}</p><div class="card-actions">${btn('join','joinClass','headphones','tint')}<button class="inline-link" data-action="personal">${t('listenOwn')}</button></div></section></div>
    <section class="demo-strip">${icon('spark')}<div><h3>${t('demo')}</h3><p>${t('demoDescription')}</p></div>${btn('demo','tryDemo',null,'small')}</section>
    <div class="section-row"><h2>${t('recent')}</h2><button class="inline-link" data-route="library">${t('viewAll')}</button></div>${sessionRows(state.sessions.slice(0, 4))}
    ${!state.config.aiReady ? `<p class="fine" style="margin-top:20px">${t('configureText')}</p>` : ''}`;
}
function liveView() {
  const s = state.current;
  return `<div class="page-intro"><div><div class="eyebrow">${t(s.role === 'listener' ? 'joined' : s.role === 'presenter' ? 'presenter' : 'personal')}</div><div class="live-heading"><h1>${esc(s.title)}</h1><span class="badge" id="elapsed">${time(s.duration || 0)}</span></div></div>${s.code ? `<button class="code-chip" data-action="copy-code" title="${t('copyCode')}">${t('code')}<b>${esc(s.code)}</b>${icon('copy')}</button>` : ''}</div>
    ${s.demo ? `<div class="notice sample">${t('demoBanner')}</div>` : ''}<div class="notice warning" id="live-error" ${state.error ? '' : 'hidden'}>${esc(state.error)}</div>
    <div class="live-grid"><section class="card caption-panel"><div class="panel-head"><h2>${t('liveCaption')}</h2><span class="status ${s.paused ? 'paused' : ''}" id="session-status"><span class="status-dot"></span>${t(s.paused ? 'paused' : 'listening')}</span></div><div class="caption-screen" id="caption-screen" aria-live="polite" aria-atomic="true"></div><div class="caption-footer"><span>${languages[s.language]}</span><label class="toolbar-label">${t('translation')}<select id="translation">${options(state.target, true)}</select></label></div></section><section class="card transcript-panel"><div class="panel-head"><h2>${t('transcript')}</h2><span class="fine" id="segment-count">${s.entries.length}</span></div><div class="transcript-list" id="transcript-list"></div></section></div>
    <div class="live-controls"><div class="control-group">${s.role !== 'listener' ? btn('pause',s.paused ? 'resume' : 'pause',s.paused ? 'play' : 'pause') : ''}${btn('overlay','floating','display', state.overlay ? 'tint' : '')}</div><div class="control-group"><span class="fine">${t('textOnly')}</span>${btn('finish',s.role === 'listener' ? 'leave' : 'end','stop','danger',state.finishing ? 'disabled' : '')}</div></div>`;
}
function updateLive() {
  const s = state.current;
  if (!s) return;
  const last = s.entries.at(-1), text = state.partial || last?.text;
  const translated = !state.partial && last && state.target !== 'off' && state.target !== s.language ? last.translations?.[state.target] : '';
  if ($('#caption-screen')) {
    $('#caption-screen').innerHTML = text ? `<p class="original">${esc(text)}</p>${translated ? `<p class="translated">${esc(translated)}</p>` : ''}` : `<div class="waiting-block"><div class="wave"><i></i><i></i><i></i><i></i></div><b>${t('waiting')}</b><p>${t('waitingHint')}</p></div>`;
    const list = $('#transcript-list');
    const bottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.innerHTML = s.entries.map(e => `<article class="transcript-item"><span class="timestamp">${time(e.time)}</span><p>${esc(e.text)}</p>${e.translations?.[state.target] && state.target !== s.language ? `<p class="translation-line">${esc(e.translations[state.target])}</p>` : ''}</article>`).join('');
    if (bottom) list.scrollTop = list.scrollHeight;
    $('#segment-count').textContent = s.entries.length;
    $('#live-error').hidden = !state.error;
    $('#live-error').textContent = state.error;
  }
  if (state.overlay) sendOverlay(text || t('waiting'), translated || '');
}
function editorView() {
  const s = state.current;
  return `<div class="page-intro"><div><div class="eyebrow">${t('review')}</div><h1>${esc(s.title)}</h1><div class="stats-row"><span>${date(s.created)}</span><span>${t('duration')}: <b>${time(s.duration)}</b></span><span>${t('words')}: <b>${s.entries.length}</b></span><span id="save-status">${t(state.dirty ? 'unsaved' : 'saved')}</span></div></div><div class="control-group">${btn('export','export','download')}${btn('save','save','check','primary')}</div></div>
    ${s.demo ? `<div class="notice sample">${t('demoBanner')}</div>` : ''}${!state.user ? `<div class="notice">${t('guestHint')}</div>` : ''}
    <div class="editor-grid"><section class="card editor-panel"><div class="panel-head"><h2>${t('transcript')}</h2><span class="fine">${languages[s.language]}</span></div><div style="padding:15px 22px 5px"><label class="field">${t('title')}<input id="session-title" value="${esc(s.title)}" maxlength="160"></label><p class="fine" style="margin-top:12px">${t('editHint')}</p></div><div class="editor-scroll">${s.entries.length ? s.entries.map(e => `<div class="edit-entry"><label><span class="timestamp">${time(e.time)}</span><textarea data-entry="${esc(e.id)}" aria-label="${t('transcript')} ${time(e.time)}" maxlength="6000">${esc(e.text)}</textarea></label></div>`).join('') : `<div class="empty"><p>${t('emptyText')}</p></div>`}</div></section>
    <section class="card editor-panel"><div class="panel-head"><h2>${t('notes')}</h2>${icon('spark')}</div><div class="notes-tools"><select id="notes-language" aria-label="${t('notesLanguage')}">${options(s.notesLanguage || getLocale())}</select>${btn('generate',state.generating ? 'generating' : s.demo ? 'loadSample' : 'generate','spark','tint small',state.generating ? 'disabled' : '')}</div><textarea id="notes-text" aria-label="${t('notes')}" maxlength="100000" placeholder="${t('notesPlaceholder')}">${esc(s.notes || '')}</textarea><div class="editor-foot">${t(s.demo ? 'sampleNotes' : 'reviewAI')}</div></section></div>`;
}
function libraryView() {
  const filtered = state.sessions.filter(s => s.title.toLowerCase().includes(state.filter.toLowerCase()));
  return `<div class="page-intro"><div><h1>${t('library')}</h1><p>${t('emptyText')}</p></div>${btn('presenter','newSession','plus','primary')}</div><div class="section-row"><label class="search-box">${icon('search')}<input id="search-sessions" value="${esc(state.filter)}" placeholder="${t('search')}" aria-label="${t('search')}"></label>${!state.user ? btn('login','signIn',null,'small') : ''}</div><div id="session-results">${sessionRows(filtered)}</div>${state.current && !state.current.active ? `<div style="margin-top:20px">${btn('back-live','review','notes','tint')}</div>` : ''}`;
}
function settingsView() {
  return `<div class="page-intro"><div><h1>${t('settings')}</h1><p>${t('tagline')}</p></div></div><section class="card settings-card"><h2>${t('appearance')}</h2><div class="setting-row"><label for="theme">${t('theme')}</label><select id="theme"><option value="light" ${state.theme === 'light' ? 'selected' : ''}>${t('light')}</option><option value="dark" ${state.theme === 'dark' ? 'selected' : ''}>${t('dark')}</option></select></div><div class="setting-row"><label for="caption-size">${t('captionSize')} <span id="size-value">${state.size}px</span></label><input type="range" id="caption-size" min="24" max="54" value="${state.size}"></div><p class="fine">${t('desktopShortcuts')}</p></section>
    <section class="card settings-card"><h2>${t('service')}</h2><div class="notice ${state.config.aiReady ? '' : 'warning'}"><b>${t(state.config.aiReady ? 'ready' : 'configure')}</b>${state.config.aiReady ? t('privacyText') : t('configureText')}</div><p class="fine">${t(state.config.storage === 'local' ? 'localService' : 'cloudService')}</p>${native ? `<div class="setting-column"><label class="field">${t('serverAddress')}<input id="service-url" type="url" value="${esc(state.serviceURL)}" placeholder="https://…" ${state.current?.active ? 'disabled' : ''}></label><p class="fine">${t('serviceHint')}</p>${btn('set-service','apply',null,'small',state.current?.active ? 'disabled' : '')}</div><div class="setting-column"><label class="field">${t('key')}<input id="service-key" type="password" autocomplete="off" placeholder="sk-…" ${state.serviceURL ? 'disabled' : ''}></label><p class="fine">${t('keyHint')}</p>${btn('set-key','save',null,'small',state.serviceURL ? 'disabled' : '')}</div>` : ''}</section>
    <section class="card settings-card"><h2>${t('privacyTitle')}</h2><p class="fine">${t('privacyText')}</p><p class="fine" style="margin-top:12px">${t('loginHint')}</p>${state.user ? `<div class="setting-row" style="margin-top:20px"><span>${esc(state.user.email)}</span>${btn('logout','signOut',null,'small')}</div>` : `<div style="margin-top:20px">${btn('login','signIn',null,'small')}</div>`}</section>`;
}
function resizeEntries() {
  document.querySelectorAll('[data-entry]').forEach(el => { el.style.height = 'auto'; el.style.height = `${Math.min(300, el.scrollHeight + 4)}px`; });
}
function modal(content) {
  modalReturnFocus = document.activeElement;
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" data-action="close-modal" aria-label="${t('close')}">${icon('close')}</button>${content}</section></div>`;
  setTimeout(() => $('.modal input, .modal select, .modal .button')?.focus(), 0);
}
function closeModal() { $('#modal-root').innerHTML = ''; modalReturnFocus?.focus?.(); }
function confirmDialog(title, action, label = 'end') {
  modal(`<h2 id="modal-title">${t(label)}</h2><p>${title}</p><div class="modal-actions">${btn('close-modal','cancel')}${btn(action,label,null,'primary')}</div>`);
}
function login(register = false) {
  modal(`<h2 id="modal-title">${t(register ? 'register' : 'signIn')}</h2><p>${t('loginHint')}</p><form id="auth-form" data-register="${register}">${register ? `<label class="field">${t('name')}<input name="name" autocomplete="name" maxlength="80" required></label>` : ''}<label class="field">${t('email')}<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label class="field">${t('password')}<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="10" maxlength="256" required placeholder="${t('passwordHint')}"></label><div class="error-message" role="alert"></div><button class="button primary" type="submit">${t(register ? 'register' : 'signIn')}</button></form><div class="form-footer"><button data-action="${register ? 'login' : 'register'}">${t(register ? 'signIn' : 'register')}</button></div>`);
}
async function canReplace() {
  if (state.current?.active) { state.route = 'live'; shell(); return false; }
  if (state.dirty) {
    const yes = await new Promise(resolve => {
      confirmDialog(t('discardConfirm'), 'discard', 'discard');
      const handler = event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (['discard','close-modal'].includes(action)) { document.removeEventListener('click', handler); resolve(action === 'discard'); }
      };
      document.addEventListener('click', handler);
    });
    if (!yes) return false;
    setDirty(false);
  }
  return true;
}
async function setup(role, isDemo = false) {
  if (!await canReplace()) return;
  modal(`<h2 id="modal-title">${t(isDemo ? 'demo' : role === 'presenter' ? 'startPresent' : 'listenOwn')}</h2><p>${t(isDemo ? 'demoDescription' : 'micNotice')}</p><form id="setup-form" data-role="${role}"><label class="field">${t('title')}<input name="title" value="${esc(isDemo ? sampleTitle[getLocale()] : '')}" placeholder="${t('defaultTitle')}" maxlength="160"></label><label class="field">${t('source')}<select name="language">${options(getLocale())}</select></label><label class="field">${t('translation')}<select name="target">${options(state.target,true)}</select></label><label class="checkbox"><input name="demo" type="checkbox" ${isDemo ? 'checked' : ''}>${t('demo')}</label><div class="error-message" role="alert"></div><button class="button primary" type="submit">${t('begin')}</button></form>`);
}
async function joinDialog() {
  if (!await canReplace()) return;
  modal(`<h2 id="modal-title">${t('joinClass')}</h2><p>${t('codeHint')}</p><form id="join-form"><label class="field">${t('code')}<input name="code" maxlength="6" minlength="6" pattern="[A-Za-z2-9]{6}" autocomplete="off" required style="font-size:26px;letter-spacing:5px;text-transform:uppercase"></label><label class="field">${t('translation')}<select name="target">${options(state.target,true)}</select></label><p class="fine">${t('guestHint')}</p><div class="error-message" role="alert"></div><button class="button primary" type="submit">${t('joinClass')}</button></form>`);
}
function track(promise) { pending.add(promise); promise.finally(() => pending.delete(promise)); return promise; }
async function publishEntry(s, entry) {
  if (!s.room || s.role !== 'presenter') return;
  try { await api(`/api/rooms/${s.room}/segments`, { method: 'POST', body: entry }); }
  catch (e) { state.error = errorText(e); updateLive(); }
}
async function translateEntry(s, entry, target) {
  if (target === 'off' || target === s.language || entry.translations?.[target]) return;
  const id = `${entry.id}:${target}`;
  if (translations.has(id)) return;
  translations.add(id);
  try {
    const result = await api('/api/translate', { method: 'POST', body: { text: entry.text, language: target } });
    entry.translations[target] = result.text;
    if (state.current === s) updateLive();
    if (s.active) await publishEntry(s, entry);
  } catch (e) { if (state.current === s) { state.error = errorText(e); updateLive(); } }
  finally { translations.delete(id); }
}
function appendEntry(s, entry) {
  if (state.current !== s) return;
  s.entries.push(entry); s.entries.sort((a,b) => a.time - b.time);
  setDirty(); updateLive();
  track((async () => { await publishEntry(s, entry); await translateEntry(s, entry, state.target); })());
}
function demoTick(s) {
  if (state.current !== s || !s.active || s.paused) return;
  if (s.demoIndex >= sampleCount) { clearInterval(demoTimer); return; }
  appendEntry(s, sampleEntry(s.demoIndex++, s.language));
}
async function startSession(data) {
  const isDemo = data.demo === 'on';
  if (!isDemo && !state.user) throw new Error('AUTH_REQUIRED');
  if (!isDemo && !state.config.aiReady) throw new Error('AI_NOT_CONFIGURED');
  state.target = data.target; localStorage.setItem('cc-translation', state.target);
  const s = { id: crypto.randomUUID(), title: data.title.trim() || (isDemo ? sampleTitle[getLocale()] : t('defaultTitle')),
    role: data.role, language: data.language, demo: isDemo, demoIndex: 0, entries: [], notes: '',
    notesLanguage: getLocale(), created: Date.now(), started: Date.now(), duration: 0, active: true, paused: false };
  let createdRoom;
  try {
    if (data.role === 'presenter' && state.user) {
      createdRoom = (await api('/api/rooms', { method: 'POST', body: { title: s.title, language: s.language, demo: isDemo } })).room;
      s.room = createdRoom.id; s.code = createdRoom.code;
    }
    if (!isDemo) {
      speech = new SpeechSession({ api, language: s.language,
        onPartial: text => { state.partial = text; if (state.current === s) updateLive(); },
        onFinal: entry => { if (state.current === s) appendEntry(s, entry); else s.entries.push(entry); },
        onError: code => { state.error = errorText(code); s.paused = true; if (state.current === s) shell(); },
      });
      await speech.start();
    }
  } catch (e) {
    speech?.stop(); speech = null;
    if (createdRoom) await api(`/api/rooms/${createdRoom.id}/end`, { method: 'POST', body: {} }).catch(() => {});
    throw e;
  }
  state.current = s; state.route = 'live'; state.partial = ''; state.error = ''; setDirty(); closeModal(); shell();
  for (const entry of s.entries) track((async () => { await publishEntry(s, entry); await translateEntry(s, entry, state.target); })());
  if (isDemo) { demoTick(s); demoTimer = setInterval(() => demoTick(s), 4200); }
  startClock(s);
}
function startClock(s) {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!s.active) return;
    s.duration = Math.max(Date.now() - s.started, s.demo ? (s.entries.at(-1)?.time || 0) : 0);
    if ($('#elapsed')) $('#elapsed').textContent = time(s.duration);
  }, 1000);
}
async function joinSession(data) {
  const result = await api('/api/rooms/join', { method: 'POST', body: { code: data.code } });
  const room = result.room;
  state.target = data.target; localStorage.setItem('cc-translation', state.target);
  const s = { id: crypto.randomUUID(), title: room.title, room: room.id, code: room.code,
    role: 'listener', memberToken: result.token, language: room.language, demo: room.demo,
    entries: [], notes: '', notesLanguage: getLocale(), created: room.started, started: room.started, active: true, duration: 0 };
  state.current = s; state.route = 'live'; state.error = ''; state.partial = ''; setDirty(); closeModal(); shell(); startClock(s);
  pollRoom(s);
}
async function pollRoom(s) {
  if (state.current !== s || !s.active) return;
  try {
    const result = await api(`/api/rooms/${s.room}`);
    if (!s.active) return;
    const existing = new Map(s.entries.map(e => [e.id,e]));
    s.entries = result.entries.map(e => ({ ...e, translations: { ...existing.get(e.id)?.translations, ...e.translations } }));
    state.error = ''; updateLive();
    for (const entry of s.entries.slice(-6)) if (!entry.translations?.[state.target] && state.target !== 'off' && state.target !== s.language && !s.demo) track(translateEntry(s, entry, state.target));
    if (result.room.ended || result.room.expired) { toast(t('ROOM_ENDED')); await finishSession(false); return; }
  } catch (e) {
    state.error = errorText(e); updateLive();
    if (['FORBIDDEN','ROOM_NOT_FOUND','AUTH_REQUIRED'].includes(e.message)) { await finishSession(false); return; }
  }
  if (s.active) pollTimer = setTimeout(() => pollRoom(s), 1800);
}
async function togglePause() {
  const s = state.current;
  if (!s?.active || state.finishing || s.role === 'listener') return;
  if (!s.demo && speech?.stopped) { toast(t('CONNECTION_FAILED')); return; }
  s.paused = !s.paused; speech?.pause(s.paused); shell();
}
async function finishSession(endHost = true) {
  if (state.finishing || !state.current?.active) return;
  const s = state.current;
  state.finishing = true; closeModal(); renderRoute();
  clearInterval(demoTimer); clearTimeout(pollTimer); clearInterval(timer);
  if (speech) {
    const result = await speech.finish(); speech = null;
    if (result.unflushed) toast(t('CONNECTION_FAILED'));
  }
  await Promise.allSettled([...pending]);
  if (s.role === 'presenter' && s.room && endHost) {
    try { await api(`/api/rooms/${s.room}/end`, { method: 'POST', body: {} }); }
    catch (e) { toast(errorText(e)); }
  }
  s.active = false; s.duration = Math.max(s.duration, s.entries.at(-1)?.time || 0); state.partial = '';
  state.finishing = false; state.overlay = false; native?.overlay({ visible: false }); $('#browser-overlay').hidden = true;
  state.route = 'editor'; setDirty(); shell();
  if (state.user) await saveCurrent(false);
}
async function saveCurrent(show = true) {
  if (!state.user) { login(); return; }
  const s = state.current;
  if (!s || state.saving) return;
  if (!s.title.trim() || s.entries.some(e => !e.text.trim())) { toast(t('editHint')); return; }
  state.saving = true;
  const before = JSON.stringify(s);
  try {
    await api('/api/sessions', { method: 'POST', body: s });
    if (JSON.stringify(s) === before) setDirty(false);
    await loadSessions();
    if (show) toast(t('saved'));
  } catch (e) { toast(errorText(e)); }
  finally { state.saving = false; }
}
async function generateNotes() {
  const s = state.current;
  if (!s || state.generating || !s.entries.length) return;
  if (s.notes.trim()) {
    confirmDialog(t('replaceNotes'), 'generate-confirmed', 'generate'); return;
  }
  await createNotes();
}
async function createNotes() {
  closeModal();
  const s = state.current;
  if (!s || state.generating) return;
  const lang = s.notesLanguage;
  state.generating = true;
  const priorNotes = s.notes;
  if (state.route === 'editor') renderRoute();
  try {
    const text = s.demo ? sampleNotes[lang] : (await api('/api/notes', { method: 'POST', body: {
      language: lang, transcript: s.entries.map(e => `[${time(e.time)}] ${e.text}`).join('\n'),
    } })).text;
    if (state.current !== s) return;
    if (s.notes !== priorNotes) { toast(t('notesChanged')); return; }
    s.notes = text; setDirty();
  } catch (e) { toast(errorText(e)); }
  finally { state.generating = false; if (state.current === s && state.route === 'editor') renderRoute(); }
}
function exportDialog() {
  modal(`<h2 id="modal-title">${t('export')}</h2><p>${t('faq3a')}</p><div class="setting-column">${btn('export-notes','exportNotes','download')}${btn('export-transcript','exportTranscript','notes')}${btn('print','printPDF','display')}${state.sessions.some(s => s.id === state.current?.id) ? btn('delete-dialog','delete','trash') : ''}</div>`);
}
function downloadText(content, extension) {
  const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = `${state.current.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,80) || 'ClearCaption'}.${extension}`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function exportTranscript() { downloadText(`${state.current.title}\n\n${state.current.entries.map(e => `[${time(e.time)}] ${e.text}${state.target !== state.current.language && e.translations[state.target] ? '\n' + e.translations[state.target] : ''}`).join('\n\n')}`, 'txt'); }
function sendOverlay(text, translation) {
  if (native) native.overlay({ visible: true, text, translation, size: state.size });
  else { const el = $('#browser-overlay'); el.hidden = false; el.innerHTML = `${esc(text)}${translation ? `<p>${esc(translation)}</p>` : ''}`; }
}
async function toggleOverlay() {
  state.overlay = !state.overlay;
  if (!state.overlay) { native?.overlay({ visible: false }); $('#browser-overlay').hidden = true; }
  else { if (!native) toast(t('browserOverlay')); updateLive(); }
  if (state.route === 'live') renderRoute();
}
document.addEventListener('click', async event => {
  const route = event.target.closest('[data-route]')?.dataset.route;
  const open = event.target.closest('[data-open]')?.dataset.open;
  const action = event.target.closest('[data-action]')?.dataset.action;
  try {
    if (route) {
      if (route === 'live' && !state.current) { await setup('presenter'); return; }
      state.route = route === 'live' && !state.current.active ? 'editor' : route; shell(); return;
    }
    if (open) {
      if (!await canReplace()) return;
      state.current = structuredClone(state.sessions.find(s => s.id === open));
      state.route = 'editor'; setDirty(false); shell(); return;
    }
    switch (action) {
      case 'close-modal': case 'discard': closeModal(); break;
      case 'login': login(); break;
      case 'register': login(true); break;
      case 'account': state.route = 'settings'; shell(); break;
      case 'logout':
        if (state.current?.active) { toast(t('endConfirm')); return; }
        if (!await canReplace()) return;
        await api('/api/auth/logout', { method: 'POST', body: {} });
        state.user = null; state.token = ''; state.sessions = []; state.current = null; sessionStorage.removeItem('cc-token'); state.route = 'dashboard'; shell(); break;
      case 'presenter': await setup('presenter'); break;
      case 'personal': await setup('personal'); break;
      case 'demo': await setup('presenter', true); break;
      case 'join': await joinDialog(); break;
      case 'back-live': if (state.current) { state.route = state.current.active ? 'live' : 'editor'; shell(); } break;
      case 'pause': await togglePause(); break;
      case 'finish': confirmDialog(t('endConfirm'), 'finish-confirmed'); break;
      case 'finish-confirmed': await finishSession(); break;
      case 'overlay': await toggleOverlay(); break;
      case 'copy-code': await navigator.clipboard.writeText(state.current.code); toast(t('copied')); break;
      case 'save': await saveCurrent(); break;
      case 'generate': await generateNotes(); break;
      case 'generate-confirmed': await createNotes(); break;
      case 'export': exportDialog(); break;
      case 'export-notes': if (!state.current.notes) { toast(t('noNotes')); break; } downloadText(state.current.notes, 'md'); closeModal(); break;
      case 'export-transcript': exportTranscript(); closeModal(); break;
      case 'print': {
        const s = state.current;
        $('#print-area').innerHTML = `<h1>${esc(s.title)}</h1>${esc(s.notes || s.entries.map(e => `[${time(e.time)}] ${e.text}`).join('\n\n'))}`;
        closeModal(); window.print(); break;
      }
      case 'delete-dialog': confirmDialog(t('deleteConfirm'), 'delete-confirmed', 'delete'); break;
      case 'delete-confirmed': await api(`/api/sessions/${state.current.id}`, { method: 'DELETE' }); state.current = null; setDirty(false); await loadSessions(); closeModal(); state.route = 'library'; shell(); break;
      case 'set-service': {
        if (state.current?.active || !await canReplace()) return;
        const url = $('#service-url').value.trim();
        await native.setService(url); state.serviceURL = url; state.token = ''; state.user = null; state.sessions = []; state.current = null; sessionStorage.removeItem('cc-token');
        await refreshConfig(); shell(); toast(t('saved')); break;
      }
      case 'set-key': {
        const key = $('#service-key').value.trim(); if (!key) return;
        await native.setKey(key); $('#service-key').value = ''; await refreshConfig(); shell(); toast(t('keySaved')); break;
      }
    }
  } catch (e) { toast(errorText(e)); }
});
document.addEventListener('submit', async event => {
  if (!['auth-form','setup-form','join-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target, button = form.querySelector('[type=submit]'), error = form.querySelector('.error-message');
  const data = Object.fromEntries(new FormData(form));
  button.disabled = true; const label = button.textContent; button.textContent = t('connecting'); error.textContent = '';
  try {
    if (form.id === 'auth-form') {
      const result = await api(`/api/auth/${form.dataset.register === 'true' ? 'register' : 'login'}`, { method: 'POST', body: data });
      state.token = result.token; state.user = result.user; sessionStorage.setItem('cc-token', result.token);
      await loadSessions(); closeModal(); shell();
    } else if (form.id === 'setup-form') await startSession({ ...data, role: form.dataset.role });
    else await joinSession(data);
  } catch (e) { error.textContent = errorText(e); button.disabled = false; button.textContent = label; }
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'interface-language') { setLocale(el.value); shell(); }
  if (el.id === 'translation') {
    state.target = el.value; localStorage.setItem('cc-translation', el.value); updateLive();
    const s = state.current;
    if (s && !s.demo) for (const entry of s.entries.slice(-6)) track(translateEntry(s, entry, el.value));
  }
  if (el.id === 'notes-language') { state.current.notesLanguage = el.value; setDirty(); }
  if (el.id === 'theme') { state.theme = el.value; localStorage.setItem('cc-theme', el.value); document.body.dataset.theme = el.value; }
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'caption-size') {
    state.size = Number(el.value); localStorage.setItem('cc-size', el.value); $('#size-value').textContent = `${el.value}px`;
    document.documentElement.style.setProperty('--caption-size', `${el.value}px`); updateLive();
  }
  if (el.id === 'notes-text') { state.current.notes = el.value; setDirty(); }
  if (el.id === 'session-title') { state.current.title = el.value; setDirty(); }
  if (el.dataset.entry) {
    const entry = state.current.entries.find(e => e.id === el.dataset.entry);
    if (entry) { entry.text = el.value; entry.translations = {}; setDirty(); el.style.height = 'auto'; el.style.height = `${Math.min(300, el.scrollHeight + 4)}px`; }
  }
  if (el.id === 'search-sessions') {
    state.filter = el.value;
    $('#session-results').innerHTML = sessionRows(state.sessions.filter(s => s.title.toLowerCase().includes(el.value.toLowerCase())));
  }
});
document.addEventListener('keydown', event => {
  if (!$('.modal')) return;
  if (event.key === 'Escape') { event.preventDefault(); $('.modal-close')?.click(); }
  if (event.key === 'Tab') {
    const focusable = [...$('.modal').querySelectorAll('button,input,select,textarea,a')].filter(el => !el.disabled);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
window.addEventListener('beforeunload', event => { if (state.current?.active || state.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => speech?.stop());
native?.onShortcut(action => { if (action === 'pause') togglePause(); else if (action === 'overlay' && state.current?.active) toggleOverlay(); });

shell();
try {
  if (native) state.serviceURL = (await native.getPreferences()).serviceURL || '';
  await refreshConfig();
  if (state.token) {
    try { state.user = (await api('/api/auth/me')).user; await loadSessions(); }
    catch { state.token = ''; sessionStorage.removeItem('cc-token'); }
  }
  shell();
  const query = new URLSearchParams(location.search);
  if (query.has('demo')) await setup('presenter', true);
  else if (query.get('mode') === 'presenter') await setup('presenter');
  else if (query.get('mode') === 'listener') await joinDialog();
} catch (e) { toast(errorText(e)); }
