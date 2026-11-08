import { state } from '../store.js';
import { shell } from '../ui.js';
import { esc, gl, norm, tok, meaningTokens } from '../utils.js';
import { ORDER, G } from '../glyphs.js';

let dir = 'zan';
let kbMode = 'lat';

function keysHtml() {
  return ORDER.map(letter => `<button type="button" class="key" data-key="${letter}" aria-label="${letter}">
    ${kbMode === 'zan' && G[letter.toLowerCase()]
      ? `<img class="gl" src="${G[letter.toLowerCase()]}" alt="${esc(letter)}">`
      : esc(letter)}
  </button>`).join('');
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const position = start + text.length;
  input.setSelectionRange(position, position);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function deleteAtCursor(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;

  if (start !== end) {
    input.value = input.value.slice(0, start) + input.value.slice(end);
    input.setSelectionRange(start, start);
  } else if (start > 0) {
    input.value = input.value.slice(0, start - 1) + input.value.slice(start);
    input.setSelectionRange(start - 1, start - 1);
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function translate(text) {
  const clean = text.trim();
  if (!clean) return '—';

  if (dir === 'zan') {
    return clean.split(/\s+/).map(part => {
      const key = tok(part).join('');
      const matches = state.words.filter(word => tok(word.word).join('') === key);
      if (!matches.length) return `<span class="unknown">${esc(part)}</span>`;
      return matches.map(word => `<div class="hit">
        <b>${esc(word.meaning)}</b>
        <div class="pron">Pronúncia: ${esc(word.pronunciation || '—')}</div>
      </div>`).join('');
    }).join('<hr class="mini">');
  }

  return clean.split(/\s+/).map(part => {
    const key = norm(part);
    const matches = state.words.filter(word =>
      norm(word.meaning) === key || meaningTokens(word.meaning).includes(key)
    );
    if (!matches.length) return `<span class="unknown">[${esc(part)}]</span>`;
    return matches.map(word => `<div class="hit">
      <div class="glyphs">${gl(word.word)}</div>
      <b>${esc(word.word)}</b>
      <div class="pron">Pronúncia: ${esc(word.pronunciation || '—')}</div>
    </div>`).join('<hr class="mini">');
  }).join(' ');
}

export async function render() {
  document.getElementById('app').innerHTML = shell(`
    <h2>Tradutor</h2>
    <p class="lede">Traduza palavras entre o Idimus Donv Zan e o português.</p>

    <div class="tabs" role="tablist" aria-label="Direção da tradução">
      <button type="button" class="tab ${dir === 'zan' ? 'on' : ''}" data-dir="zan" role="tab" aria-selected="${dir === 'zan'}">
        Zan → Português
      </button>
      <button type="button" class="tab ${dir === 'pt' ? 'on' : ''}" data-dir="pt" role="tab" aria-selected="${dir === 'pt'}">
        Português → Zan
      </button>
    </div>

    <label for="ti">Texto</label>
    ${dir === 'zan'
      ? `<input id="ti" placeholder="Escreva em Idimus Donv Zan…" autocomplete="off" spellcheck="false">
         <div class="glyphs" id="ti-preview" aria-hidden="true"></div>
         <div class="kb-box">
           <div class="row">
             <button type="button" class="btn sm ${kbMode === 'lat' ? 'primary' : ''}" data-kbmode="lat">Teclado latino</button>
             <button type="button" class="btn sm ${kbMode === 'zan' ? 'primary' : ''}" data-kbmode="zan">Teclado Zan</button>
             <button type="button" class="btn sm" data-kbdel>⌫ Apagar</button>
           </div>
           <div class="kb" id="kb">${keysHtml()}</div>
         </div>`
      : `<input id="ti" placeholder="Digite uma palavra em português…" autocomplete="off">`}

    <div class="card translation-card" id="result" aria-live="polite">—</div>

    ${dir === 'zan'
      ? `<p class="hint">Dica: o teclado Zan insere os glifos oficiais, mas você também pode digitar com letras comuns.</p>`
      : `<p class="hint">O tradutor consulta o significado das palavras cadastradas pelo administrador.</p>`}
  `);

  const input = document.getElementById('ti');
  const preview = document.getElementById('ti-preview');
  const result = document.getElementById('result');

  const update = () => {
    if (preview) preview.innerHTML = gl(input.value);
    result.innerHTML = translate(input.value);
  };

  input.addEventListener('input', update);
  if (input.value) update();

  document.querySelectorAll('[data-dir]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.dir === dir) return;
      dir = button.dataset.dir;
      render();
    });
  });

  const kbBox = document.querySelector('.kb-box');
  if (kbBox) {
    kbBox.addEventListener('click', event => {
      const modeButton = event.target.closest('[data-kbmode]');
      if (modeButton) {
        kbMode = modeButton.dataset.kbmode;
        document.getElementById('kb').innerHTML = keysHtml();
        document.querySelectorAll('[data-kbmode]').forEach(button => {
          button.classList.toggle('primary', button.dataset.kbmode === kbMode);
        });
        return;
      }

      if (event.target.closest('[data-kbdel]')) {
        deleteAtCursor(input);
        return;
      }

      const key = event.target.closest('[data-key]');
      if (key) insertAtCursor(input, key.dataset.key);
    });
  }
}
