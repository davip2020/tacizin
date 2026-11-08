import { state, loadProfile } from './store.js';
import { initialHash } from './supabase.js';
import { loadingScreen, footer, toast } from './ui.js';
import { esc } from './utils.js';
import { ARCH } from './glyphs.js';
import * as dictionary from './views/dictionary.js';
import * as alphabet from './views/alphabet.js';
import * as translator from './views/translator.js';
import * as about from './views/about.js';
import * as auth from './views/auth.js';
import * as suggestions from './views/suggestions.js';
import * as admin from './views/admin.js';

const routes = {
  '/dicionario': { title: 'Dicionário', view: dictionary },
  '/alfabeto': { title: 'Alfabeto', view: alphabet },
  '/tradutor': { title: 'Tradutor', view: translator },
  '/sobre': { title: 'Sobre o Tacizin', view: about },

  '/entrar': { title: 'Entrar', view: { render: auth.login }, guestOnly: true },
  '/cadastrar': { title: 'Criar conta', view: { render: auth.register }, guestOnly: true },
  '/recuperar': { title: 'Recuperar senha', view: { render: auth.recover }, guestOnly: true },
  '/redefinir': { title: 'Redefinir senha', view: { render: auth.reset } },

  '/sugerir': { title: 'Sugerir palavra', view: { render: suggestions.suggest }, auth: true },
  '/minhas-sugestoes': { title: 'Minhas sugestões', view: { render: suggestions.mine }, auth: true },

  '/admin': { title: 'Administração', view: { render: admin.dashboard }, admin: true },
  '/admin/sugestoes': { title: 'Sugestões recebidas', view: { render: admin.adminSuggestions }, admin: true },
  '/admin/personalizacao': { title: 'Personalização', view: { render: admin.adminSettings }, admin: true }
};

let mountVersion = 0;
let activeCleanup = null;

function parseHash() {
  const current = location.hash.replace(/^#/, '');
  // Se o supabase-js já limpou o hash, usamos o valor capturado no carregamento.
  const raw = current || initialHash.replace(/^#/, '');

  // Links de recuperação/confirmação do Supabase trazem tokens no hash.
  if (/access_token=|type=|error_description=|error=/.test(raw)) {
    const params = new URLSearchParams(raw);
    const type = params.get('type');
    if (type === 'recovery' || params.get('error_description') || params.get('error')) {
      return { path: '/redefinir', params };
    }
    return { path: '/dicionario', params };
  }

  const [rawPath, query = ''] = raw.split('?');
  let path = rawPath || '/dicionario';
  if (path === '/') path = '/dicionario';
  if (!path.startsWith('/')) path = `/${path}`;
  return { path, params: new URLSearchParams(query) };
}

function redirect(path) {
  location.replace(`#${path}`);
}

export async function mount() {
  const version = ++mountVersion;
  const { path, params } = parseHash();
  const route = routes[path] || routes['/dicionario'];

  if ((route.auth || route.admin) && !state.session) {
    toast('Entre na sua conta para continuar.', 'err');
    redirect(`/entrar?next=${encodeURIComponent(path)}`);
    return;
  }

  if (route.admin && state.session && !state.profile) {
    await loadProfile();
  }

  if (route.admin && state.profile?.role !== 'admin') {
    toast('Área restrita ao administrador.', 'err');
    redirect('/dicionario');
    return;
  }

  if (route.guestOnly && state.session) {
    const next = params.get('next') || '';
    redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/dicionario');
    return;
  }

  if (activeCleanup) {
    try { activeCleanup(); } catch (error) { console.warn(error); }
    activeCleanup = null;
  }

  const app = document.getElementById('app');
  app.innerHTML = loadingScreen();
  window.scrollTo(0, 0);

  try {
    const cleanup = await route.view.render(params);
    if (version !== mountVersion) {
      if (typeof cleanup === 'function') cleanup();
      return;
    }
    activeCleanup = typeof cleanup === 'function' ? cleanup : null;
    document.title = `${route.title} · ${state.settings.site_name}`;
  } catch (error) {
    console.error(error);
    if (version === mountVersion) renderError(app, error);
  }
}

function renderError(app, error) {
  const message = error?.message || String(error);
  const missingTable = /does not exist|not found|42P01|PGRST205/i.test(message);

  app.innerHTML = `<main class="wrap narrow-page">
    <div class="hero sm">${ARCH}<h1>${esc(state.settings.site_name)}</h1>
      <div class="sub">${esc(state.settings.tagline)}</div><div class="rule"><i></i></div></div>
    <div class="card error-card">
      <h3>Não foi possível carregar</h3>
      <p class="err">${esc(message)}</p>
      ${missingTable
        ? `<p class="muted">As tabelas do banco ainda não existem. Rode o arquivo
            <code>supabase/schema.sql</code> no SQL Editor do Supabase e recarregue.</p>`
        : `<p class="muted">Verifique sua conexão e a configuração em <code>src/config.js</code>.</p>`}
      <div class="row" style="justify-content:center">
        <button type="button" class="btn primary" onclick="location.reload()">Recarregar</button>
        <a class="btn" href="#/dicionario">Voltar ao início</a>
      </div>
    </div>
  </main>
  ${footer()}`;
}

export function startRouter() {
  window.addEventListener('hashchange', mount);
  document.addEventListener('tz:auth', mount);

  if (!location.hash) {
    // Links de recuperação chegam sem hash visível (o supabase-js consome),
    // então só redirecionamos quando não há token preservado.
    if (parseHash().path !== '/redefinir') {
      redirect('/dicionario');
      return;
    }
  }

  mount();
}
