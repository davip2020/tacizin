import { isConfigured } from './supabase.js';
import { initAuth, ensureData, signOut } from './store.js';
import { startRouter, mount } from './router.js';
import { renderSetup } from './views/setup.js';
import { toast, bindPasswordToggles } from './ui.js';
import { ARCH } from './glyphs.js';
import { esc } from './utils.js';

const app = document.getElementById('app');

function renderFatal(error) {
  const message = error?.message || String(error);
  const missingTable = /does not exist|not found|42P01|PGRST205/i.test(message);

  app.innerHTML = `<main class="wrap narrow-page">
    <div class="hero sm">${ARCH}
      <h1>Tacizin</h1>
      <div class="sub">Idimus Donv Zan</div>
      <div class="rule"><i></i></div>
    </div>
    <div class="card error-card">
      <h3>Banco de dados indisponível</h3>
      <p class="err">${esc(message)}</p>
      ${missingTable
        ? `<p class="muted">As tabelas ainda não foram criadas. Abra o SQL Editor do Supabase,
            execute o conteúdo de <code>supabase/schema.sql</code> e recarregue esta página.</p>`
        : `<p class="muted">Confira a URL e a chave em <code>src/config.js</code> e tente novamente.</p>`}
      <div class="row" style="justify-content:center">
        <button type="button" class="btn primary" onclick="location.reload()">Recarregar</button>
      </div>
    </div>
  </main>`;
}

async function boot() {
  if (!isConfigured()) {
    renderSetup(app);
    return;
  }

  try {
    await initAuth();
    await ensureData();
  } catch (error) {
    console.error(error);
    renderFatal(error);
    return;
  }

  startRouter();
}

document.addEventListener('click', async event => {
  const trigger = event.target.closest('[data-action="logout"]');
  if (!trigger) return;
  event.preventDefault();
  await signOut();
  toast('Sessão encerrada.');
  if (location.hash === '#/dicionario' || !location.hash) {
    await mount();
  } else {
    location.hash = '/dicionario';
  }
});

bindPasswordToggles(document);
boot();
