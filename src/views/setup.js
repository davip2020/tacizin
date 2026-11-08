import { ARCH } from '../glyphs.js';
import { esc } from '../utils.js';

export function renderSetup(app) {
  app.innerHTML = `<main class="wrap narrow-page">
    <div class="hero">
      ${ARCH}
      <h1>Tacizin</h1>
      <div class="sub">Idimus Donv Zan</div>
      <div class="rule"><i></i></div>
    </div>

    <div class="card setup-card">
      <h3>Configuração pendente</h3>
      <p class="muted">
        O portal já está pronto, mas ainda não está conectado ao banco de dados.
        Siga os passos abaixo uma única vez.
      </p>

      <ol class="steps">
        <li>
          <b>Crie um projeto no Supabase</b>
          <p>Acesse <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>,
          crie um projeto gratuito e aguarde a inicialização.</p>
        </li>
        <li>
          <b>Execute o schema</b>
          <p>No painel do Supabase, abra <i>SQL Editor</i>, cole todo o conteúdo de
          <code>supabase/schema.sql</code> e clique em <i>Run</i>.</p>
        </li>
        <li>
          <b>Conecte o site</b>
          <p>Em <i>Project Settings → API</i>, copie a <b>Project URL</b> e a chave
          <b>anon public</b>. Cole em <code>src/config.js</code>:</p>
          <pre><code>export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON';</code></pre>
        </li>
        <li>
          <b>Crie sua conta e defina o administrador</b>
          <p>Cadastre-se pelo site, depois rode no SQL Editor:</p>
          <pre><code>update public.profiles
set role = 'admin'
where username = 'Zani';</code></pre>
        </li>
        <li>
          <b>Publique</b>
          <p>Envie o projeto para o GitHub e ative o GitHub Pages
          (<i>Settings → Pages → Deploy from a branch</i>). Detalhes no <code>README.md</code>.</p>
        </li>
      </ol>

      <div class="notice">
        A chave <code>anon</code> é pública de propósito. A proteção dos dados vem das
        políticas de acesso (RLS) criadas pelo schema — nunca use a chave
        <code>service_role</code> no navegador.
      </div>

      <div class="row" style="justify-content:center;margin-top:18px">
        <button type="button" class="btn primary" onclick="location.reload()">Já configurei, recarregar</button>
      </div>
    </div>
    <p class="back-link muted">Tacizin · portal do idioma Idimus Donv Zan</p>
  </main>`;
}
