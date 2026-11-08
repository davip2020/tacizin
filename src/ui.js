import { state } from './store.js';
import { ARCH } from './glyphs.js';
import { esc } from './utils.js';

const NAV = [
  ['/dicionario', 'Dicionário'],
  ['/alfabeto', 'Alfabeto'],
  ['/tradutor', 'Tradutor'],
  ['/sobre', 'Sobre']
];

function currentPath() {
  const raw = location.hash.replace(/^#/, '') || '/dicionario';
  const path = raw.split('?')[0];
  return path || '/dicionario';
}

export function hero(small = false) {
  const { settings } = state;
  const logo = settings.logo_url
    ? `<img class="hero-logo" src="${esc(settings.logo_url)}" alt="Logo de ${esc(settings.site_name)}">`
    : ARCH;

  return `<div class="hero ${small ? 'sm' : ''}">
    ${logo}
    <h1>${esc(settings.site_name)}</h1>
    <div class="sub">${esc(settings.tagline)}</div>
    <div class="rule"><i></i></div>
  </div>`;
}

function topbar() {
  const path = currentPath();
  const { profile, settings } = state;

  const navLinks = NAV.map(([href, label]) => {
    const active = path === href || (href !== '/dicionario' && path.startsWith(href));
    return `<a href="#${href}" class="${active ? 'on' : ''}">${label}</a>`;
  }).join('');

  const adminLink = profile?.role === 'admin'
    ? `<a href="#/admin" class="${path.startsWith('/admin') ? 'on' : ''}">Administração</a>`
    : '';

  const sessionArea = profile
    ? `<div class="session">
        <a class="who" href="#/minhas-sugestoes" title="Minhas sugestões">
          ${esc(profile.username)}${profile.role === 'admin' ? ' <span class="badge gold">mestre</span>' : ''}
        </a>
        <a class="session-link" href="#/minhas-sugestoes">Sugestões</a>
        <button type="button" class="btn sm ghost" data-action="logout">Sair</button>
      </div>`
    : `<div class="session">
        <a class="btn sm ghost" href="#/entrar">Entrar</a>
        <a class="btn sm primary" href="#/cadastrar">Criar conta</a>
      </div>`;

  return `<header class="top">
    <a class="brand" href="#/dicionario">${esc(settings.site_name)}</a>
    <nav class="nav" aria-label="Navegação principal">
      ${navLinks}
      ${adminLink}
    </nav>
    ${sessionArea}
  </header>`;
}

export function footer() {
  return `<footer><span>${esc(state.settings.footer_text)}</span></footer>`;
}

export function shell(content, { narrow = false } = {}) {
  return `${topbar()}
    <main class="wrap ${narrow ? 'narrow-page' : ''}">
      ${hero(true)}
      <div class="page">${content}</div>
    </main>
    ${footer()}`;
}

/** Página sem navegação (login, cadastro, recuperação). */
export function bareShell(content) {
  return `<main class="wrap narrow-page">
    ${hero()}
    <div class="page">${content}</div>
    <p class="back-link"><a href="#/dicionario">← Voltar ao dicionário</a></p>
  </main>
  ${footer()}`;
}

export function loadingScreen(message = 'Carregando…') {
  return `<div class="boot" role="status" aria-live="polite">
    <div class="boot-mark">${ARCH}</div>
    <p>${esc(message)}</p>
  </div>`;
}

export function emptyState(message) {
  return `<p class="empty">${esc(message)}</p>`;
}

export function statusChip(status) {
  const map = {
    pending: ['Pendente', 'warn'],
    approved: ['Aprovada', 'ok'],
    rejected: ['Recusada', 'err']
  };
  const [label, tone] = map[status] || [status, ''];
  return `<span class="badge ${tone}">${label}</span>`;
}

export function toast(message, type = 'ok') {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  stack.appendChild(item);

  setTimeout(() => {
    item.classList.add('out');
    setTimeout(() => item.remove(), 260);
  }, 4200);
}

let lastFocused = null;
let escHandler = null;

export function openModal({ title, body, actions = '' }) {
  closeModal();
  lastFocused = document.activeElement;

  const wrapper = document.createElement('div');
  wrapper.className = 'modal';
  wrapper.innerHTML = `<div class="card modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head">
      <h3>${esc(title)}</h3>
      <button type="button" class="icon-btn" data-close aria-label="Fechar">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${actions ? `<div class="modal-actions">${actions}</div>` : ''}
  </div>`;

  wrapper.addEventListener('click', event => {
    if (event.target === wrapper || event.target.closest('[data-close]')) closeModal();
  });

  escHandler = event => {
    if (event.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(wrapper);
  const focusable = wrapper.querySelector('input, textarea, select, button');
  if (focusable) focusable.focus();

  return wrapper;
}

export function closeModal() {
  const modal = document.querySelector('.modal');
  if (modal) modal.remove();
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
    lastFocused = null;
  }
}

export function go(path) {
  location.hash = path;
}

/** Alterna visibilidade de campos de senha. */
export function bindPasswordToggles(root = document) {
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-toggle-password]');
    if (!button) return;
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
    button.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar';
    button.setAttribute('aria-pressed', String(input.type === 'text'));
  });
}

export function fieldError(id, message) {
  const box = document.getElementById(id);
  if (!box) return;
  box.className = message ? 'msg err' : 'msg';
  box.textContent = message || '';
}
