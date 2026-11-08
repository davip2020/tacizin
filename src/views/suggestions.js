import { supabase } from '../supabase.js';
import { state, subscribeTableChanges } from '../store.js';
import { shell, statusChip, toast, emptyState, fieldError } from '../ui.js';
import { esc, gl, formatDate, plural } from '../utils.js';

function friendly(error) {
  const raw = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  if (/limite|10 sugest/i.test(raw)) {
    return 'Você já tem 10 sugestões pendentes. Aguarde a análise do administrador.';
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return 'Sua conta não tem permissão para esta ação.';
  }
  if (/duplicate key/i.test(raw)) {
    return 'Já existe uma sugestão ou palavra com esses dados.';
  }
  return error?.message || 'Não foi possível concluir a operação.';
}

export async function suggest(params) {
  const prefillWord = params.get('word') || '';
  const prefillId = params.get('id') || '';
  const existing = prefillId ? state.words.find(word => word.id === prefillId) : null;
  const kind = existing ? 'edit_word' : 'new_word';

  document.getElementById('app').innerHTML = shell(`
    <h2>Sugerir palavra</h2>
    <p class="lede">Sua sugestão será analisada pelo administrador antes de entrar no dicionário.</p>

    ${existing ? `<div class="notice">
      Você está sugerindo uma correção para <b>${esc(existing.word)}</b>.
      A versão atual é: <i>${esc(existing.meaning)}</i>
    </div>` : ''}

    <form id="suggest-form" class="section" novalidate>
      <div class="form-grid">
        <div>
          <label for="sw">Palavra *</label>
          <input id="sw" maxlength="80" value="${esc(prefillWord)}" required autocomplete="off">
        </div>
        <div>
          <label for="sp">Pronúncia</label>
          <input id="sp" maxlength="120" value="${esc(existing?.pronunciation || '')}" autocomplete="off">
        </div>
      </div>

      <div class="glyphs" id="s-preview">${gl(prefillWord)}</div>

      <label for="sm">Significado *</label>
      <textarea id="sm" rows="3" maxlength="600" required>${esc(existing?.meaning || '')}</textarea>

      <label for="sn">Observação para o administrador</label>
      <textarea id="sn" rows="2" maxlength="600" placeholder="Opcional: explique sua sugestão, cite fontes ou exemplos…"></textarea>

      <div class="msg" id="smsg" role="status"></div>

      <div class="row">
        <button type="submit" class="btn primary">Enviar sugestão</button>
        <a class="btn" href="#/dicionario">Cancelar</a>
      </div>
    </form>

    <p class="hint">
      Você pode acompanhar o resultado em <a href="#/minhas-sugestoes">Minhas sugestões</a>.
      O limite é de 10 sugestões pendentes por pessoa.
    </p>
  `);

  const form = document.getElementById('suggest-form');
  const wordInput = document.getElementById('sw');
  const preview = document.getElementById('s-preview');

  wordInput.addEventListener('input', () => {
    preview.innerHTML = gl(wordInput.value);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const word = wordInput.value.trim();
    const meaning = document.getElementById('sm').value.trim();
    const pronunciation = document.getElementById('sp').value.trim();
    const note = document.getElementById('sn').value.trim();

    if (!word || !meaning) {
      fieldError('smsg', 'Palavra e significado são obrigatórios.');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Enviando…';

    const { error } = await supabase.from('suggestions').insert({
      author_id: state.session.user.id,
      kind,
      word_id: existing?.id || null,
      word,
      meaning,
      pronunciation: pronunciation || null,
      note: note || null
    });

    button.disabled = false;
    button.textContent = 'Enviar sugestão';

    if (error) {
      console.error(error);
      fieldError('smsg', friendly(error));
      return;
    }

    toast('Sugestão enviada. Obrigado pela contribuição!');
    location.hash = '/minhas-sugestoes';
  });
}

export async function mine() {
  document.getElementById('app').innerHTML = shell(`
    <div class="section-head">
      <div>
        <h2>Minhas sugestões</h2>
        <p class="lede">Acompanhe o que você enviou e o retorno do administrador.</p>
      </div>
      <a class="btn primary" href="#/sugerir">Nova sugestão</a>
    </div>
    <div id="mine-summary" class="chips-row"></div>
    <div id="mine-list" class="stack"></div>
  `);

  const list = document.getElementById('mine-list');
  const summary = document.getElementById('mine-summary');

  async function load() {
    const { data, error } = await supabase
      .from('suggestions')
      .select('*')
      .eq('author_id', state.session.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      list.innerHTML = `<div class="card error-card"><p class="err">${esc(friendly(error))}</p></div>`;
      return;
    }

    const rows = data || [];
    const pending = rows.filter(item => item.status === 'pending').length;
    const approved = rows.filter(item => item.status === 'approved').length;
    const rejected = rows.filter(item => item.status === 'rejected').length;

    summary.innerHTML = `
      <span class="badge warn">${pending} pendente${pending === 1 ? '' : 's'}</span>
      <span class="badge ok">${approved} aprovada${approved === 1 ? '' : 's'}</span>
      <span class="badge err">${rejected} recusada${rejected === 1 ? '' : 's'}</span>
      <span class="count">${plural(rows.length, 'sugestão enviada', 'sugestões enviadas')}</span>
    `;

    if (!rows.length) {
      list.innerHTML = `${emptyState('Você ainda não enviou nenhuma sugestão.')}
        <p class="center"><a class="btn primary" href="#/sugerir">Enviar a primeira sugestão</a></p>`;
      return;
    }

    list.innerHTML = rows.map(item => `
      <article class="suggestion">
        <header class="suggestion-head">
          ${statusChip(item.status)}
          <span class="muted">${esc(formatDate(item.created_at))}</span>
          ${item.kind === 'edit_word' ? '<span class="badge">correção</span>' : '<span class="badge">nova palavra</span>'}
        </header>
        <div class="glyphs">${gl(item.word || '')}</div>
        <h3>${esc(item.word || '—')}</h3>
        <p class="meaning">${esc(item.meaning || '—')}</p>
        <p class="pron">Pronúncia: ${esc(item.pronunciation || '—')}</p>
        ${item.note ? `<p class="note"><b>Sua observação:</b> ${esc(item.note)}</p>` : ''}
        ${item.review_note ? `<p class="review"><b>Retorno do administrador:</b> ${esc(item.review_note)}</p>` : ''}
      </article>
    `).join('');
  }

  await load();

  const unsubscribe = subscribeTableChanges(
    'suggestions',
    () => load(),
    `author_id=eq.${state.session.user.id}`
  );

  return () => unsubscribe();
}
