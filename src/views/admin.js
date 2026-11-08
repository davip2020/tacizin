import { supabase } from '../supabase.js';
import {
  state,
  refreshWords,
  refreshSettings,
  subscribeTableChanges
} from '../store.js';
import {
  shell,
  toast,
  openModal,
  closeModal,
  statusChip,
  emptyState,
  fieldError
} from '../ui.js';
import {
  esc,
  gl,
  norm,
  plural,
  formatDate,
  debounce,
  todayStamp,
  safeColor
} from '../utils.js';

function friendlyWordError(error) {
  const raw = [error?.message, error?.details].filter(Boolean).join(' ');
  if (/duplicate key|words_word_norm_key/i.test(raw)) {
    return 'Já existe uma palavra com esse nome no dicionário.';
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return 'Apenas o administrador pode alterar o dicionário.';
  }
  return error?.message || 'Não foi possível salvar.';
}

function friendlySuggestionError(error) {
  const raw = [error?.message, error?.details].filter(Boolean).join(' ');
  if (/já existe|duplicate key/i.test(raw)) {
    return 'Já existe uma palavra com esse nome. Ajuste a sugestão antes de aprovar.';
  }
  if (/não existe mais/i.test(raw)) {
    return 'A palavra original foi excluída. Use “Recusar” ou cadastre manualmente.';
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return 'Apenas o administrador pode revisar sugestões.';
  }
  return error?.message || 'Não foi possível concluir a revisão.';
}

export async function dashboard() {
  const [usersResult, pendingResult] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  if (usersResult.error) console.warn(usersResult.error);
  if (pendingResult.error) console.warn(pendingResult.error);

  const usersCount = usersResult.count ?? 0;
  const pendingCount = pendingResult.count ?? 0;

  document.getElementById('app').innerHTML = shell(`
    <div class="section-head">
      <div>
        <h2>Administração</h2>
        <p class="lede">Controle do dicionário, das sugestões e da identidade do portal.</p>
      </div>
      <span class="badge gold">mestre</span>
    </div>

    <div class="stats">
      <div class="stat">Palavras publicadas<b id="stat-words">${state.words.length}</b></div>
      <div class="stat">Pessoas cadastradas<b id="stat-users">${usersCount}</b></div>
      <div class="stat">Sugestões pendentes<b id="stat-pending">${pendingCount}</b></div>
    </div>

    <div class="quick-links">
      <a class="btn" href="#/admin/sugestoes">Revisar sugestões (${pendingCount})</a>
      <a class="btn" href="#/admin/personalizacao">Personalizar portal</a>
      <a class="btn" href="#/dicionario">Ver dicionário público</a>
    </div>

    <section class="section" id="words-section">
      <div class="section-head">
        <h3 id="form-mode">Nova palavra</h3>
        <span class="count">${state.settings.site_name}</span>
      </div>

      <form id="word-form" class="form-card" novalidate>
        <input type="hidden" id="word-id">

        <div class="form-grid">
          <div>
            <label for="word-input">Palavra *</label>
            <input id="word-input" maxlength="80" autocomplete="off" required>
          </div>
          <div>
            <label for="pron-input">Pronúncia</label>
            <input id="pron-input" maxlength="120" autocomplete="off">
          </div>
        </div>

        <div class="glyphs" id="word-preview" aria-hidden="true"></div>

        <label for="meaning-input">Significado *</label>
        <textarea id="meaning-input" rows="3" maxlength="600" required></textarea>

        <label for="notes-input">Observações (opcional)</label>
        <textarea id="notes-input" rows="2" maxlength="600"
          placeholder="Etimologia, exemplos de uso, classe gramatical…"></textarea>

        <div class="msg" id="word-msg" role="status"></div>

        <div class="row">
          <button type="submit" class="btn primary" id="word-submit">Salvar palavra</button>
          <button type="button" class="btn" id="word-cancel" hidden>Cancelar edição</button>
        </div>
      </form>
    </section>

    <section class="section">
      <div class="section-head">
        <h3>Palavras cadastradas</h3>
        <span class="count" id="words-count">${plural(state.words.length, 'palavra', 'palavras')}</span>
      </div>
      <input id="admin-search" type="search" placeholder="Filtrar por palavra ou significado…" autocomplete="off">
      <div id="word-table-wrap" class="table-wrap"></div>
    </section>

    <section class="section">
      <h3>Backup do dicionário</h3>
      <p class="muted">
        Exporte uma cópia em JSON ou importe o backup do aplicativo antigo.
        Palavras repetidas são ignoradas automaticamente.
      </p>
      <div class="row">
        <button type="button" class="btn primary" id="export-words">⬇ Exportar palavras (.json)</button>
        <button type="button" class="btn" id="import-trigger">⬆ Importar backup (.json)</button>
        <input id="import-file" type="file" accept=".json,application/json" hidden>
      </div>
      <p class="hint">
        A importação reaproveita apenas as palavras. Contas e senhas do app antigo não são migradas —
        cada pessoa deve criar uma nova conta.
      </p>
    </section>
  `);

  const form = document.getElementById('word-form');
  const idInput = document.getElementById('word-id');
  const wordInput = document.getElementById('word-input');
  const meaningInput = document.getElementById('meaning-input');
  const pronInput = document.getElementById('pron-input');
  const notesInput = document.getElementById('notes-input');
  const preview = document.getElementById('word-preview');
  const submitButton = document.getElementById('word-submit');
  const cancelButton = document.getElementById('word-cancel');
  const formMode = document.getElementById('form-mode');
  const tableWrap = document.getElementById('word-table-wrap');
  const searchInput = document.getElementById('admin-search');

  let search = '';

  function updateCounters() {
    document.getElementById('stat-words').textContent = state.words.length;
    document.getElementById('words-count').textContent = plural(state.words.length, 'palavra', 'palavras');
  }

  function tableHtml() {
    const needle = norm(search);
    const list = state.words.filter(word =>
      !needle || norm(word.word).includes(needle) || norm(word.meaning).includes(needle)
    );

    if (!list.length) return emptyState('Nenhuma palavra encontrada.');

    return `<table>
      <thead>
        <tr><th>Palavra</th><th>Significado</th><th>Pronúncia</th><th>Ações</th></tr>
      </thead>
      <tbody>
        ${list.map(word => `<tr>
          <td class="word-cell">
            <div class="glyphs sm">${gl(word.word)}</div>
            <b>${esc(word.word)}</b>
          </td>
          <td>${esc(word.meaning)}</td>
          <td class="muted">${esc(word.pronunciation || '—')}</td>
          <td class="actions">
            <button type="button" class="btn sm" data-edit="${word.id}">Editar</button>
            <button type="button" class="btn sm danger" data-delete="${word.id}">Excluir</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  function renderTable() {
    tableWrap.innerHTML = tableHtml();
  }

  function resetForm() {
    form.reset();
    idInput.value = '';
    preview.innerHTML = '';
    submitButton.textContent = 'Salvar palavra';
    cancelButton.hidden = true;
    formMode.textContent = 'Nova palavra';
    fieldError('word-msg', '');
    wordInput.focus();
  }

  function fillForm(word) {
    idInput.value = word.id;
    wordInput.value = word.word;
    meaningInput.value = word.meaning;
    pronInput.value = word.pronunciation || '';
    notesInput.value = word.notes || '';
    preview.innerHTML = gl(word.word);
    submitButton.textContent = 'Atualizar palavra';
    cancelButton.hidden = false;
    formMode.textContent = 'Editando palavra';
    fieldError('word-msg', '');
    document.getElementById('words-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    wordInput.focus();
  }

  wordInput.addEventListener('input', () => {
    preview.innerHTML = gl(wordInput.value);
  });

  searchInput.addEventListener('input', debounce(() => {
    search = searchInput.value;
    renderTable();
  }, 120));

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const editingId = idInput.value;
    const word = wordInput.value.trim();
    const meaning = meaningInput.value.trim();
    const pronunciation = pronInput.value.trim();
    const notes = notesInput.value.trim();

    if (!word || !meaning) {
      fieldError('word-msg', 'Palavra e significado são obrigatórios.');
      return;
    }

    const payload = {
      word,
      meaning,
      pronunciation: pronunciation || null,
      notes: notes || null
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Salvando…';

    let error = null;
    if (editingId) {
      const result = await supabase.from('words').update(payload).eq('id', editingId);
      error = result.error;
    } else {
      const result = await supabase.from('words').insert({
        ...payload,
        created_by: state.session.user.id
      });
      error = result.error;
    }

    submitButton.disabled = false;
    submitButton.textContent = editingId ? 'Atualizar palavra' : 'Salvar palavra';

    if (error) {
      console.error(error);
      fieldError('word-msg', friendlyWordError(error));
      return;
    }

    await refreshWords();
    updateCounters();
    renderTable();
    resetForm();
    toast(editingId ? 'Palavra atualizada.' : 'Palavra publicada no dicionário.');
  });

  cancelButton.addEventListener('click', resetForm);

  tableWrap.addEventListener('click', async event => {
    const editButton = event.target.closest('[data-edit]');
    if (editButton) {
      const word = state.words.find(item => item.id === editButton.dataset.edit);
      if (word) fillForm(word);
      return;
    }

    const deleteButton = event.target.closest('[data-delete]');
    if (!deleteButton) return;

    const word = state.words.find(item => item.id === deleteButton.dataset.delete);
    if (!word) return;
    if (!confirm(`Excluir a palavra “${word.word}”? Esta ação não pode ser desfeita.`)) return;

    const { error } = await supabase.from('words').delete().eq('id', word.id);
    if (error) {
      toast(friendlyWordError(error), 'err');
      return;
    }

    await refreshWords();
    updateCounters();
    renderTable();
    if (idInput.value === word.id) resetForm();
    toast('Palavra excluída.');
  });

  document.getElementById('export-words').addEventListener('click', () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'tacizin-supabase',
      words: state.words.map(word => ({
        word: word.word,
        meaning: word.meaning,
        pronunciation: word.pronunciation || '',
        notes: word.notes || '',
        created_at: word.created_at
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tacizin-palavras-${todayStamp()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  const importTrigger = document.getElementById('import-trigger');
  const importFile = document.getElementById('import-file');

  importTrigger.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('Arquivo JSON inválido.', 'err');
      importFile.value = '';
      return;
    }

    const source = Array.isArray(parsed) ? parsed : parsed?.words;
    if (!Array.isArray(source)) {
      toast('Formato não reconhecido. Use o backup exportado pelo portal.', 'err');
      importFile.value = '';
      return;
    }

    const rows = source
      .map(item => {
        const word = String(item?.word ?? '').trim();
        const meaning = String(item?.meaning ?? '').trim();
        const pronunciation = String(item?.pronunciation ?? item?.pron ?? '').trim();
        return { word, meaning, pronunciation: pronunciation || null };
      })
      .filter(item => item.word && item.meaning);

    if (!rows.length) {
      toast('Nenhuma palavra válida encontrada no arquivo.', 'err');
      importFile.value = '';
      return;
    }

    if (!confirm(`Importar ${rows.length} palavra(s)? As repetidas serão ignoradas.`)) {
      importFile.value = '';
      return;
    }

    importTrigger.disabled = true;
    importTrigger.textContent = 'Importando…';

    let imported = 0;
    try {
      for (let index = 0; index < rows.length; index += 400) {
        const chunk = rows.slice(index, index + 400);
        const { data, error } = await supabase.rpc('import_words', { p_words: chunk });
        if (error) throw error;
        imported += Number(data) || 0;
      }

      await refreshWords();
      updateCounters();
      renderTable();
      toast(`${imported} palavra(s) importada(s). ${rows.length - imported} ignorada(s).`);
    } catch (error) {
      console.error(error);
      toast(friendlyWordError(error), 'err');
    }

    importTrigger.disabled = false;
    importTrigger.textContent = '⬆ Importar backup (.json)';
    importFile.value = '';
  });

  renderTable();

  const unsubscribe = subscribeTableChanges('words', debounce(async () => {
    await refreshWords();
    updateCounters();
    renderTable();
  }, 600));

  return () => unsubscribe();
}

export async function adminSuggestions() {
  document.getElementById('app').innerHTML = shell(`
    <div class="section-head">
      <div>
        <h2>Sugestões recebidas</h2>
        <p class="lede">Aprove o que deve entrar no dicionário e recuse o que não se encaixa.</p>
      </div>
      <a class="btn" href="#/admin">Voltar ao painel</a>
    </div>
    <div class="tabs" id="sug-tabs" role="tablist"></div>
    <div id="sug-list" class="stack"></div>
    <p class="hint">
      Ao aprovar, a palavra é publicada imediatamente. Ao recusar, o autor vê o motivo
      informado em “Minhas sugestões”.
    </p>
  `);

  const tabs = document.getElementById('sug-tabs');
  const list = document.getElementById('sug-list');
  const authors = new Map();
  let rows = [];
  let active = 'pending';

  function renderTabs() {
    const counts = {
      pending: rows.filter(item => item.status === 'pending').length,
      approved: rows.filter(item => item.status === 'approved').length,
      rejected: rows.filter(item => item.status === 'rejected').length
    };

    const tabsData = [
      ['pending', 'Pendentes', counts.pending],
      ['approved', 'Aprovadas', counts.approved],
      ['rejected', 'Recusadas', counts.rejected],
      ['all', 'Todas', rows.length]
    ];

    tabs.innerHTML = tabsData.map(([key, label, count]) => `
      <button type="button" class="tab ${active === key ? 'on' : ''}" data-filter="${key}" role="tab"
        aria-selected="${active === key}">${label} <span class="tab-count">${count}</span></button>
    `).join('');
  }

  function cardHtml(item) {
    const current = item.word_id ? state.words.find(word => word.id === item.word_id) : null;
    const canApprove = item.kind !== 'other';

    return `<article class="suggestion">
      <header class="suggestion-head">
        ${statusChip(item.status)}
        <span class="badge">${item.kind === 'edit_word' ? 'correção' : item.kind === 'other' ? 'outro' : 'nova palavra'}</span>
        <span class="muted">
          por <b>${esc(authors.get(item.author_id) || 'usuário')}</b> · ${esc(formatDate(item.created_at))}
        </span>
      </header>

      <div class="glyphs">${gl(item.word || '')}</div>
      <h3>${esc(item.word || '—')}</h3>
      <p class="meaning">${esc(item.meaning || '—')}</p>
      <p class="pron">Pronúncia: ${esc(item.pronunciation || '—')}</p>

      ${current ? `<p class="note">
        <b>Versão atual:</b> ${esc(current.word)} — ${esc(current.meaning)}
      </p>` : ''}

      ${item.note ? `<p class="note"><b>Observação do autor:</b> ${esc(item.note)}</p>` : ''}
      ${item.review_note ? `<p class="review"><b>Motivo da recusa:</b> ${esc(item.review_note)}</p>` : ''}

      ${item.status === 'pending' ? `<footer class="suggestion-actions">
        ${canApprove ? `<button type="button" class="btn primary sm" data-approve="${item.id}">Aprovar e publicar</button>` : ''}
        <button type="button" class="btn danger sm" data-reject="${item.id}">Recusar</button>
      </footer>` : ''}
    </article>`;
  }

  function renderList() {
    const filtered = active === 'all' ? rows : rows.filter(item => item.status === active);

    if (!filtered.length) {
      list.innerHTML = emptyState(
        active === 'pending'
          ? 'Nenhuma sugestão pendente. Tudo em dia!'
          : 'Nenhuma sugestão nesta categoria.'
      );
      return;
    }

    list.innerHTML = filtered.map(cardHtml).join('');
  }

  async function load() {
    const [suggestionsResult, peopleResult] = await Promise.all([
      supabase.from('suggestions').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, username')
    ]);

    if (suggestionsResult.error) {
      console.error(suggestionsResult.error);
      list.innerHTML = `<div class="card error-card"><p class="err">${esc(suggestionsResult.error.message)}</p></div>`;
      return;
    }

    if (peopleResult.error) console.warn(peopleResult.error);

    authors.clear();
    (peopleResult.data || []).forEach(person => authors.set(person.id, person.username));

    rows = suggestionsResult.data || [];
    renderTabs();
    renderList();
  }

  function askReject(id) {
    const modal = openModal({
      title: 'Recusar sugestão',
      body: `<label for="review-note">Motivo (opcional)</label>
        <textarea id="review-note" rows="3" maxlength="400"
          placeholder="Ex.: a palavra já existe com outro significado."></textarea>
        <p class="hint">O autor verá este texto em “Minhas sugestões”.</p>`,
      actions: `<button type="button" class="btn danger" id="confirm-reject">Recusar sugestão</button>
        <button type="button" class="btn" data-close>Cancelar</button>`
    });

    const confirmButton = modal.querySelector('#confirm-reject');
    confirmButton.addEventListener('click', async () => {
      const note = modal.querySelector('#review-note').value.trim();
      confirmButton.disabled = true;
      confirmButton.textContent = 'Recusando…';

      const { error } = await supabase.rpc('reject_suggestion', {
        p_id: id,
        p_note: note || null
      });

      if (error) {
        console.error(error);
        toast(friendlySuggestionError(error), 'err');
        confirmButton.disabled = false;
        confirmButton.textContent = 'Recusar sugestão';
        return;
      }

      closeModal();
      toast('Sugestão recusada.');
      await load();
    });
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    active = button.dataset.filter;
    renderTabs();
    renderList();
  });

  list.addEventListener('click', async event => {
    const approveButton = event.target.closest('[data-approve]');
    if (approveButton) {
      approveButton.disabled = true;
      approveButton.textContent = 'Aprovando…';

      const { error } = await supabase.rpc('approve_suggestion', {
        p_id: approveButton.dataset.approve
      });

      if (error) {
        console.error(error);
        toast(friendlySuggestionError(error), 'err');
        approveButton.disabled = false;
        approveButton.textContent = 'Aprovar e publicar';
        return;
      }

      await refreshWords();
      toast('Sugestão aprovada e publicada no dicionário.');
      await load();
      return;
    }

    const rejectButton = event.target.closest('[data-reject]');
    if (rejectButton) askReject(rejectButton.dataset.reject);
  });

  await load();

  const unsubscribe = subscribeTableChanges('suggestions', debounce(() => {
    if (!document.querySelector('.modal')) load();
  }, 600));

  return () => unsubscribe();
}

export async function adminSettings() {
  const settings = state.settings;

  document.getElementById('app').innerHTML = shell(`
    <div class="section-head">
      <div>
        <h2>Personalização</h2>
        <p class="lede">Identidade visual e textos do portal. As mudanças valem para todos os visitantes.</p>
      </div>
      <a class="btn" href="#/admin">Voltar ao painel</a>
    </div>

    <form id="settings-form" class="section" novalidate>
      <div class="form-grid">
        <div>
          <label for="s-name">Nome do site *</label>
          <input id="s-name" maxlength="40" value="${esc(settings.site_name)}" required>
        </div>
        <div>
          <label for="s-tagline">Subtítulo *</label>
          <input id="s-tagline" maxlength="60" value="${esc(settings.tagline)}" required>
        </div>
      </div>

      <label for="s-hero">Frase de destaque</label>
      <input id="s-hero" maxlength="160" value="${esc(settings.hero_phrase)}">

      <label for="s-about">Texto “Sobre o Tacizin”</label>
      <textarea id="s-about" rows="6" maxlength="3000">${esc(settings.about || '')}</textarea>

      <div class="form-grid">
        <div>
          <label for="s-accent">Cor principal</label>
          <div class="color-row">
            <input type="color" id="s-accent" value="${safeColor(settings.accent, '#c9b68c')}">
            <code id="s-accent-hex">${safeColor(settings.accent, '#c9b68c')}</code>
          </div>
        </div>
        <div>
          <label for="s-accent2">Cor secundária</label>
          <div class="color-row">
            <input type="color" id="s-accent2" value="${safeColor(settings.accent2, '#8f7f60')}">
            <code id="s-accent2-hex">${safeColor(settings.accent2, '#8f7f60')}</code>
          </div>
        </div>
      </div>

      <label for="s-footer">Texto do rodapé</label>
      <input id="s-footer" maxlength="120" value="${esc(settings.footer_text)}">

      <label for="s-logo">Logo do portal</label>
      <div class="logo-box">
        <div id="logo-preview">
          ${settings.logo_url
            ? `<img class="logo-preview" src="${esc(settings.logo_url)}" alt="Logo atual">`
            : `<span class="muted">Sem logo personalizado — o arco padrão é usado.</span>`}
        </div>
        <input type="file" id="s-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif">
        <label class="check"><input type="checkbox" id="s-logo-remove"> Remover o logo atual</label>
        <p class="hint">PNG, JPG, WEBP, SVG ou GIF, até 2 MB.</p>
      </div>

      <div class="msg" id="s-msg" role="status"></div>

      <div class="row">
        <button type="submit" class="btn primary" id="s-submit">Salvar alterações</button>
        <a class="btn" href="#/admin">Cancelar</a>
      </div>
    </form>

    <div class="notice">
      O logo é armazenado no bucket público <code>assets</code> do Supabase Storage.
      Se o upload falhar, confirme que o schema foi executado novamente após a atualização do projeto.
    </div>
  `);

  const form = document.getElementById('settings-form');
  const accent = document.getElementById('s-accent');
  const accent2 = document.getElementById('s-accent2');
  const logoInput = document.getElementById('s-logo');
  const logoPreview = document.getElementById('logo-preview');
  const logoRemove = document.getElementById('s-logo-remove');
  const submitButton = document.getElementById('s-submit');

  accent.addEventListener('input', () => {
    document.getElementById('s-accent-hex').textContent = accent.value;
  });
  accent2.addEventListener('input', () => {
    document.getElementById('s-accent2-hex').textContent = accent2.value;
  });

  logoInput.addEventListener('change', () => {
    const file = logoInput.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    logoPreview.innerHTML = `<img class="logo-preview" src="${url}" alt="Prévia do novo logo">`;
  });

  logoRemove.addEventListener('change', () => {
    if (logoRemove.checked) {
      logoPreview.innerHTML = `<span class="muted">O arco padrão será usado.</span>`;
    } else if (state.settings.logo_url) {
      logoPreview.innerHTML = `<img class="logo-preview" src="${esc(state.settings.logo_url)}" alt="Logo atual">`;
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const siteName = document.getElementById('s-name').value.trim();
    const tagline = document.getElementById('s-tagline').value.trim();
    const heroPhrase = document.getElementById('s-hero').value.trim();
    const about = document.getElementById('s-about').value.trim();
    const footerText = document.getElementById('s-footer').value.trim();

    if (!siteName || !tagline) {
      fieldError('s-msg', 'Nome do site e subtítulo são obrigatórios.');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Salvando…';

    let logoUrl = logoRemove.checked ? null : (state.settings.logo_url || null);
    const file = logoInput.files?.[0];

    try {
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          throw new Error('O logo deve ter no máximo 2 MB.');
        }

        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
        if (!allowed.includes(file.type)) {
          throw new Error('Formato de imagem não suportado.');
        }

        const extension = (file.name.split('.').pop() || 'png').toLowerCase();
        const path = `logo-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(path, file, { cacheControl: '3600', contentType: file.type });

        if (uploadError) {
          throw new Error(
            /bucket/i.test(uploadError.message)
              ? 'Bucket “assets” não encontrado. Rode o schema atualizado no Supabase.'
              : `Falha no upload: ${uploadError.message}`
          );
        }

        const { data } = supabase.storage.from('assets').getPublicUrl(path);
        logoUrl = data.publicUrl;
      }

      const { error } = await supabase.from('site_settings').update({
        site_name: siteName,
        tagline,
        hero_phrase: heroPhrase || '“Uma língua. Uma identidade. Uma civilização.”',
        about: about || null,
        accent: safeColor(accent.value, '#c9b68c'),
        accent2: safeColor(accent2.value, '#8f7f60'),
        footer_text: footerText || '© TACIZIN · IDIMUS DONV ZAN',
        logo_url: logoUrl,
        updated_by: state.session.user.id,
        updated_at: new Date().toISOString()
      }).eq('id', 1);

      if (error) throw error;

      await refreshSettings();
      toast('Personalização salva.');
      await adminSettings();
    } catch (error) {
      console.error(error);
      fieldError('s-msg', error?.message || 'Não foi possível salvar.');
      submitButton.disabled = false;
      submitButton.textContent = 'Salvar alterações';
    }
  });
}
