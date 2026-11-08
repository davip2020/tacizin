import { state, subscribeTableChanges, refreshWords } from '../store.js';
import { shell, openModal } from '../ui.js';
import { esc, gl, cmp, norm, tok, debounce, plural } from '../utils.js';
import { ORDER } from '../glyphs.js';

let query = '';
let letter = '';

export async function render() {
  query = '';
  letter = '';

  document.getElementById('app').innerHTML = shell(`
    <div class="section-head">
      <div>
        <h2>Dicionário</h2>
        <p class="lede">Consulte o vocabulário oficial do Idimus Donv Zan.</p>
      </div>
      <span class="count" id="word-count"></span>
    </div>

    ${!state.session ? `<div class="notice">
      Encontrou uma palavra nova ou uma correção? <a href="#/cadastrar">Crie uma conta</a>
      para enviar sugestões ao administrador.
    </div>` : ''}

    <form class="searchbar" id="search-form" role="search">
      <input id="q" type="search" placeholder="Pesquise uma palavra, significado ou pronúncia…"
             autocomplete="off" aria-label="Pesquisar no dicionário">
    </form>

    <div class="letters" id="letters" role="group" aria-label="Filtrar por letra"></div>
    <div class="grid" id="word-grid"></div>
  `);

  const grid = document.getElementById('word-grid');
  const letters = document.getElementById('letters');
  const count = document.getElementById('word-count');
  const input = document.getElementById('q');

  function renderLetters() {
    letters.innerHTML = [
      `<button type="button" class="chip ${!letter ? 'on' : ''}" data-letter="">Todas</button>`,
      ...ORDER.map(item =>
        `<button type="button" class="chip ${letter === item ? 'on' : ''}" data-letter="${item}">${item}</button>`
      )
    ].join('');
  }

  function filteredWords() {
    const n = norm(query);
    return state.words
      .filter(word => {
        const matchesQuery = !n
          || norm(word.word).includes(n)
          || norm(word.meaning).includes(n)
          || norm(word.pronunciation || '').includes(n)
          || norm(tok(word.word).join('')).includes(n.replace(/\s+/g, ''));
        const matchesLetter = !letter || tok(word.word)[0] === letter;
        return matchesQuery && matchesLetter;
      })
      .sort((a, b) => cmp(a.word, b.word));
  }

  function renderGrid() {
    const list = filteredWords();
    if (count) count.textContent = plural(list.length, 'palavra', 'palavras');

    if (!list.length) {
      grid.innerHTML = `<p class="empty">Nenhuma palavra encontrada.</p>`;
      return;
    }

    grid.innerHTML = list.map(word => `
      <article class="entry" data-word-id="${esc(word.id)}" tabindex="0">
        <div class="glyphs">${gl(word.word)}</div>
        <h3>${esc(word.word)}</h3>
        <p class="meaning">${esc(word.meaning)}</p>
        <p class="pron">Pronúncia: ${esc(word.pronunciation || '—')}</p>
      </article>
    `).join('');
  }

  function openWord(word) {
    openModal({
      title: word.word,
      body: `<div class="glyphs big">${gl(word.word)}</div>
        <p class="meaning">${esc(word.meaning)}</p>
        <p class="pron">Pronúncia: ${esc(word.pronunciation || '—')}</p>
        ${word.notes ? `<p class="muted">${esc(word.notes)}</p>` : ''}`,
      actions: `${state.session
        ? `<a class="btn primary" href="#/sugerir?word=${encodeURIComponent(word.word)}&id=${encodeURIComponent(word.id)}" data-close>Sugerir correção</a>`
        : ''}
        <button type="button" class="btn" data-close>Fechar</button>`
    });
  }

  renderLetters();
  renderGrid();

  input.addEventListener('input', debounce(() => {
    query = input.value;
    renderGrid();
  }, 120));

  letters.addEventListener('click', event => {
    const button = event.target.closest('[data-letter]');
    if (!button) return;
    letter = button.dataset.letter;
    renderLetters();
    renderGrid();
    input.focus();
  });

  grid.addEventListener('click', event => {
    if (event.target.closest('a')) return;
    const card = event.target.closest('.entry');
    if (!card) return;
    const word = state.words.find(item => item.id === card.dataset.wordId);
    if (word) openWord(word);
  });

  grid.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.entry');
    if (!card) return;
    event.preventDefault();
    const word = state.words.find(item => item.id === card.dataset.wordId);
    if (word) openWord(word);
  });

  const unsubscribe = subscribeTableChanges('words', debounce(async () => {
    await refreshWords();
    renderGrid();
  }, 500));

  return () => unsubscribe();
}
