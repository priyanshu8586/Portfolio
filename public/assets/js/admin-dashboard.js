import { api, ApiError, setCsrf, el } from './api.js';

const $ = (id) => document.getElementById(id);
const globalNotice = $('global-notice');
let noticeTimer;

function notify(kind, text) {
  globalNotice.hidden = false;
  globalNotice.className = `notice ${kind === 'error' ? 'is-error' : 'is-success'}`;
  globalNotice.textContent = (kind === 'error' ? 'Error: ' : 'Done: ') + text;
  clearTimeout(noticeTimer);
  if (kind !== 'error') noticeTimer = setTimeout(() => { globalNotice.hidden = true; }, 5000);
}

/** Any API call from the dashboard goes through here so expired sessions send you to login. */
async function call(method, path, body) {
  try {
    return await api(method, path, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { location.replace('/admin/login'); }
    throw err;
  }
}

function fieldErrors(prefix, fields = {}, names) {
  for (const n of names) {
    const target = $(`${prefix}${n}`);
    if (target) target.textContent = fields[n] || '';
  }
}

const fmtDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// ---------- Tabs ----------
const tabs = [...document.querySelectorAll('[role="tab"]')];
const loaders = {};
function showView(name, focus = false) {
  for (const t of tabs) {
    const on = t.dataset.view === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`panel-${t.dataset.view}`).hidden = !on;
    if (on && focus) t.focus();
  }
  history.replaceState(null, '', `#${name}`);
  globalNotice.hidden = true;
  loaders[name]?.();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showView(t.dataset.view));
  t.addEventListener('keydown', (e) => {
    const move = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (move) { e.preventDefault(); showView(tabs[(i + move + tabs.length) % tabs.length].dataset.view, true); }
  });
});

// ---------- Overview ----------
async function loadOverview() {
  const s = await call('GET', '/api/admin/stats');
  setUnread(s.unread);
  const items = [
    ['Unread messages', s.unread], ['Messages in inbox', s.inbox], ['All messages', s.total_messages],
    ['Published projects', s.published_projects], ['Total projects', s.total_projects],
  ];
  $('stat-grid').replaceChildren(...items.map(([label, n]) =>
    el('div', { class: 'stat' }, el('span', { class: 'stat-num', text: String(n) }), el('span', { class: 'stat-label', text: label }))));
}
loaders.overview = () => loadOverview().catch((e) => notify('error', e.message));

function setUnread(n) {
  const badge = $('unread-count');
  badge.hidden = n === 0;
  badge.textContent = String(n);
}

// ---------- Messages ----------
let msgFilter = '';
let msgPage = 1;
const PAGE_SIZE = 10;

async function loadMessages() {
  const status = $('messages-status');
  status.textContent = 'Loading…';
  const q = new URLSearchParams({ page: String(msgPage), limit: String(PAGE_SIZE) });
  if (msgFilter) q.set('status', msgFilter);
  const data = await call('GET', `/api/admin/messages?${q}`);
  status.textContent = data.items.length ? '' : 'No messages here.';
  $('message-list').replaceChildren(...data.items.map(messageItem));
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  $('message-pager').hidden = pages <= 1;
  $('page-label').textContent = `Page ${data.page} of ${pages}`;
  $('prev-page').disabled = data.page <= 1;
  $('next-page').disabled = data.page >= pages;
}
loaders.messages = () => loadMessages().catch((e) => { $('messages-status').textContent = ''; notify('error', e.message); });

function messageItem(m) {
  const act = (label, handler, cls = '') => el('button', { class: `btn btn-sm ${cls}`, type: 'button', onclick: handler }, label);
  const setStatus = (status) => async () => {
    try { await call('PATCH', `/api/admin/messages/${m.id}`, { status }); await loadMessages(); refreshUnread(); }
    catch (e) { notify('error', e.message); }
  };
  const remove = async () => {
    if (!confirm(`Delete the message from ${m.name}? This cannot be undone.`)) return;
    try { await call('DELETE', `/api/admin/messages/${m.id}`); await loadMessages(); refreshUnread(); notify('success', 'Message deleted.'); }
    catch (e) { notify('error', e.message); }
  };
  const mailto = `mailto:${encodeURIComponent(m.email).replace('%40', '@')}?subject=${encodeURIComponent('Re: ' + (m.subject || 'your message'))}`;
  return el('li', { class: `message ${m.status === 'unread' ? 'is-unread' : ''}` },
    el('div', { class: 'message-top' },
      el('span', { class: 'message-from' }, m.name, ' ', el('span', { class: 'muted small', text: `<${m.email}>` })),
      el('span', { class: 'muted small' }, el('span', { class: 'badge', text: m.status }), ' ', fmtDate(m.created_at))),
    m.subject ? el('div', { class: 'message-subject' }, el('strong', { text: m.subject })) : null,
    el('p', { class: 'message-body', text: m.body }),
    el('div', { class: 'row-actions' },
      el('a', { class: 'btn btn-sm btn-primary', href: mailto }, 'Reply by email'),
      m.status !== 'read' ? act('Mark read', setStatus('read')) : act('Mark unread', setStatus('unread')),
      m.status !== 'archived' ? act('Archive', setStatus('archived')) : act('Move to inbox', setStatus('read')),
      act('Delete', remove, 'btn-danger')));
}

async function refreshUnread() {
  try { setUnread((await call('GET', '/api/admin/stats')).unread); } catch { /* non-critical */ }
}

document.querySelectorAll('[data-filter]').forEach((b) =>
  b.addEventListener('click', () => {
    msgFilter = b.dataset.filter; msgPage = 1;
    document.querySelectorAll('[data-filter]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-pressed', String(on));
    });
    loaders.messages();
  }));
$('prev-page').addEventListener('click', () => { msgPage = Math.max(1, msgPage - 1); loaders.messages(); });
$('next-page').addEventListener('click', () => { msgPage += 1; loaders.messages(); });

// ---------- Projects ----------
let projects = [];
const dialog = $('project-dialog');
const pform = $('project-form');
const PFIELDS = ['title', 'summary', 'tags', 'live_url', 'repo_url', 'sort_order'];
let editingId = null;

async function loadProjects() {
  $('projects-status').textContent = 'Loading…';
  projects = (await call('GET', '/api/admin/projects')).items;
  $('projects-status').textContent = projects.length ? '' : 'No projects yet. Add your first one.';
  $('project-rows').replaceChildren(...projects.map((p) =>
    el('li', { class: 'project-row' },
      el('div', {},
        el('h2', {}, p.title, ' ', el('span', { class: 'badge', text: p.is_published ? 'Published' : 'Hidden' })),
        el('p', { text: p.summary.length > 110 ? p.summary.slice(0, 107) + '…' : p.summary })),
      el('div', { class: 'row-actions' },
        el('button', { class: 'btn btn-sm', type: 'button', onclick: () => openProject(p) }, 'Edit', el('span', { class: 'sr-only' }, ` ${p.title}`)),
        el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: () => deleteProject(p) }, 'Delete', el('span', { class: 'sr-only' }, ` ${p.title}`))))));
}
loaders.projects = () => loadProjects().catch((e) => { $('projects-status').textContent = ''; notify('error', e.message); });

function openProject(p) {
  editingId = p ? p.id : null;
  $('project-dialog-title').textContent = p ? 'Edit project' : 'New project';
  $('project-notice').hidden = true;
  fieldErrors('pje-', {}, PFIELDS);
  pform.elements.title.value = p?.title || '';
  pform.elements.summary.value = p?.summary || '';
  pform.elements.tags.value = p ? p.tags.join(', ') : '';
  pform.elements.live_url.value = p?.live_url || '';
  pform.elements.repo_url.value = p?.repo_url || '';
  pform.elements.sort_order.value = p ? p.sort_order : projects.length + 1;
  pform.elements.is_published.checked = p ? p.is_published : true;
  dialog.showModal();
  pform.elements.title.focus();
}
$('new-project').addEventListener('click', () => openProject(null));
$('project-cancel').addEventListener('click', () => dialog.close());

async function deleteProject(p) {
  if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
  try { await call('DELETE', `/api/admin/projects/${p.id}`); await loadProjects(); notify('success', 'Project deleted.'); }
  catch (e) { notify('error', e.message); }
}

pform.addEventListener('submit', async (e) => {
  e.preventDefault();
  const save = $('project-save');
  if (save.disabled) return;
  fieldErrors('pje-', {}, PFIELDS);
  $('project-notice').hidden = true;
  const f = pform.elements;
  const payload = {
    title: f.title.value, summary: f.summary.value,
    tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean),
    live_url: f.live_url.value.trim(), repo_url: f.repo_url.value.trim(),
    sort_order: Number.parseInt(f.sort_order.value, 10) || 0,
    is_published: f.is_published.checked,
  };
  save.disabled = true;
  try {
    await call(editingId ? 'PUT' : 'POST', editingId ? `/api/admin/projects/${editingId}` : '/api/admin/projects', payload);
    dialog.close();
    await loadProjects();
    notify('success', editingId ? 'Project updated.' : 'Project created.');
  } catch (err) {
    fieldErrors('pje-', err.fields, PFIELDS);
    $('project-notice').hidden = false;
    $('project-notice').textContent = 'Error: ' + err.message;
  } finally {
    save.disabled = false;
  }
});

// ---------- Profile ----------
const profileForm = $('profile-form');
const PROFILE_FIELDS = ['name', 'headline', 'bio', 'github', 'linkedin'];
async function loadProfile() {
  const s = await call('GET', '/api/admin/settings');
  for (const k of PROFILE_FIELDS) profileForm.elements[k].value = s[k] || '';
  fieldErrors('pe-', {}, PROFILE_FIELDS);
}
loaders.profile = () => loadProfile().catch((e) => notify('error', e.message));

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  fieldErrors('pe-', {}, PROFILE_FIELDS);
  const btn = profileForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await call('PUT', '/api/admin/settings', Object.fromEntries(PROFILE_FIELDS.map((k) => [k, profileForm.elements[k].value])));
    notify('success', 'Profile saved. It is live on the public site.');
  } catch (err) {
    fieldErrors('pe-', err.fields, PROFILE_FIELDS);
    notify('error', err.message);
  } finally { btn.disabled = false; }
});

// ---------- Security ----------
const pwForm = $('password-form');
const PW_FIELDS = ['currentPassword', 'newPassword'];
pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  fieldErrors('pwe-', {}, PW_FIELDS);
  const btn = pwForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await call('POST', '/api/auth/change-password', {
      currentPassword: pwForm.elements.currentPassword.value,
      newPassword: pwForm.elements.newPassword.value,
    });
    pwForm.reset();
    pwForm.elements.username.value = $('who').textContent;
    notify('success', 'Password changed. Other sessions were signed out.');
  } catch (err) {
    fieldErrors('pwe-', err.fields, PW_FIELDS);
    notify('error', err.message);
  } finally { btn.disabled = false; }
});

// ---------- Sign out + boot ----------
$('logout-btn').addEventListener('click', async () => {
  try { await api('POST', '/api/auth/logout', {}); } catch { /* leave anyway */ }
  location.replace('/admin/login');
});

(async function boot() {
  try {
    const me = await api('GET', '/api/auth/me');
    if (!me.authenticated) { location.replace('/admin/login'); return; }
    setCsrf(me.csrfToken);
    $('who').textContent = me.email;
    pwForm.elements.username.value = me.email;
    const start = location.hash.slice(1);
    showView(tabs.some((t) => t.dataset.view === start) ? start : 'overview');
  } catch (err) {
    notify('error', err.message);
  }
})();
