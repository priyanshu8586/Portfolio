import { api, setCsrf } from './api.js';

const form = document.getElementById('login-form');
const notice = document.getElementById('login-notice');
const btn = document.getElementById('login-btn');

function show(msg) {
  notice.hidden = false;
  notice.textContent = 'Error: ' + msg;
}

async function init() {
  try {
    const me = await api('GET', '/api/auth/me');
    if (me.authenticated) { location.replace('/admin/dashboard'); return; }
    setCsrf(me.csrfToken);
  } catch {
    show('Could not reach the server. Please reload the page.');
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (btn.disabled) return;
  notice.hidden = true;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  if (!email || !password) { show('Enter your email and password.'); return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const res = await api('POST', '/api/auth/login', { email, password });
    setCsrf(res.csrfToken);
    location.replace('/admin/dashboard');
  } catch (err) {
    form.elements.password.value = '';
    if (err.code === 'CSRF') await init(); // token went stale: fetch a fresh one
    show(err.message);
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

init();
