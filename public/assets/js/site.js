import { api, ApiError, el, safeUrl } from './api.js';

// ---------- Theme toggle ----------
const root = document.documentElement;
document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* storage unavailable */ }
});

// ---------- Mobile menu ----------
const menuBtn = document.getElementById('menu-toggle');
const nav = document.getElementById('site-nav');
function setMenu(open) {
  nav.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); menuBtn.focus(); }
});

document.getElementById('year').textContent = new Date().getFullYear();

// ---------- Site content ----------
function renderProfile(profile) {
  document.querySelectorAll('[data-profile]').forEach((node) => {
    const value = profile[node.dataset.profile];
    if (value) node.textContent = value;
  });
  if (profile.name) document.title = `${profile.name} — Portfolio`;

  const links = document.getElementById('social-links');
  links.replaceChildren();
  for (const [key, label] of [['github', 'GitHub'], ['linkedin', 'LinkedIn']]) {
    const href = profile[key] && safeUrl(profile[key]);
    if (href) {
      links.append(el('li', {}, el('a', { class: 'btn btn-sm', href, target: '_blank', rel: 'noopener noreferrer' }, label)));
    }
  }
  links.hidden = links.children.length === 0;
}

function projectCard(p) {
  const live = p.live_url && safeUrl(p.live_url);
  const repo = p.repo_url && safeUrl(p.repo_url);
  return el('li', {},
    el('article', { class: 'project-card reveal' },
      el('h3', { text: p.title }),
      el('p', { text: p.summary }),
      p.tags && p.tags.length
        ? el('ul', { class: 'tag-row', 'aria-label': 'Technologies used' }, p.tags.map((t) => el('li', { class: 'badge', text: t })))
        : null,
      live || repo
        ? el('div', { class: 'project-links' },
            live ? el('a', { class: 'btn btn-sm btn-primary', href: live, target: '_blank', rel: 'noopener noreferrer' }, 'Live demo', el('span', { class: 'sr-only' }, ` of ${p.title}`)) : null,
            repo ? el('a', { class: 'btn btn-sm', href: repo, target: '_blank', rel: 'noopener noreferrer' }, 'Source', el('span', { class: 'sr-only' }, ` code of ${p.title}`)) : null)
        : null));
}

function renderProjects(projects) {
  const grid = document.getElementById('project-grid');
  const status = document.getElementById('projects-status');
  grid.replaceChildren(...projects.map(projectCard));
  status.hidden = projects.length > 0;
  if (!projects.length) {
    status.hidden = false;
    status.textContent = 'No projects to show yet — check back soon.';
  }
  observeReveals();
}

async function loadSite() {
  try {
    const data = await api('GET', '/api/public/site');
    renderProfile(data.profile);
    renderProjects(data.projects);
  } catch (err) {
    const status = document.getElementById('projects-status');
    status.hidden = false;
    status.textContent = 'Could not load projects right now. Please refresh the page.';
    console.error(err);
  }
}

// ---------- Scroll reveal ----------
let observer;
function observeReveals() {
  const items = document.querySelectorAll('.reveal:not(.is-visible)');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((i) => i.classList.add('is-visible'));
    return;
  }
  document.documentElement.classList.add('js-reveal');
  observer ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-visible'); observer.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  items.forEach((i) => observer.observe(i));
}

// ---------- Contact form ----------
const form = document.getElementById('contact-form');
const notice = document.getElementById('form-notice');
const sendBtn = document.getElementById('send-btn');
const FIELDS = ['name', 'email', 'subject', 'message'];

function showNotice(kind, text) {
  notice.hidden = false;
  notice.className = `notice ${kind === 'error' ? 'is-error' : 'is-success'}`;
  notice.textContent = (kind === 'error' ? 'Error: ' : 'Sent: ') + text;
}

function setFieldError(name, message) {
  const input = form.elements[name];
  const target = document.getElementById(`e-${name}`);
  if (!input || !target) return;
  target.textContent = message || '';
  if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
}

function clientValidate(values) {
  const errors = {};
  if (!values.name) errors.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (values.message.length < 10) errors.message = 'Please write at least 10 characters.';
  return errors;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (sendBtn.disabled) return; // guard against double submit
  notice.hidden = true;
  FIELDS.forEach((f) => setFieldError(f, ''));

  const values = Object.fromEntries(FIELDS.map((f) => [f, form.elements[f].value.trim()]));
  values.website = form.elements.website.value;

  const errors = clientValidate(values);
  if (Object.keys(errors).length) {
    Object.entries(errors).forEach(([k, v]) => setFieldError(k, v));
    form.elements[Object.keys(errors)[0]].focus();
    return;
  }

  sendBtn.disabled = true;
  const original = sendBtn.textContent;
  sendBtn.replaceChildren(el('span', { class: 'spinner', 'aria-hidden': 'true' }), ' Sending…');
  try {
    await api('POST', '/api/public/contact', values);
    form.reset();
    showNotice('success', 'Thank you! Your message has been sent.');
  } catch (err) {
    if (err instanceof ApiError && err.fields && Object.keys(err.fields).length) {
      Object.entries(err.fields).forEach(([k, v]) => setFieldError(k, v));
      const first = FIELDS.find((f) => err.fields[f]);
      if (first) form.elements[first].focus();
      showNotice('error', err.message);
    } else {
      showNotice('error', err.message || 'Could not send your message.');
    }
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = original;
  }
});

observeReveals();
loadSite();
