import { G, ORDER } from './glyphs.js';

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Escapa texto vindo do banco/usuário antes de interpolar em HTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

/** Minúsculo, sem acentos e sem espaços nas pontas. */
export const norm = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Tokeniza respeitando CH, LH e SS como letras únicas. */
export function tok(value) {
  const upper = norm(value).toUpperCase();
  const out = [];
  for (let i = 0; i < upper.length; i++) {
    const pair = upper.substr(i, 2);
    if (['CH', 'LH', 'SS'].includes(pair)) {
      out.push(pair);
      i++;
    } else {
      out.push(upper[i]);
    }
  }
  return out;
}

/** Ordena pelo alfabeto próprio do Idimus Donv Zan. */
export function cmp(a, b) {
  const left = tok(a);
  const right = tok(b);

  const rank = letter => {
    const index = ORDER.indexOf(letter);
    // Letras fora do alfabeto (empréstimos, por exemplo) vão para o fim.
    return index === -1 ? ORDER.length + letter.charCodeAt(0) : index;
  };

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const diff = rank(left[i]) - rank(right[i]);
    if (diff) return diff;
  }
  return left.length - right.length;
}

/** Renderiza os glifos de uma palavra. */
export function gl(value) {
  return tok(value).map(letter => {
    const glyph = G[letter.toLowerCase()];
    if (!glyph) return esc(letter);
    return `<img class="gl" src="${glyph}" alt="${esc(letter)}" title="${esc(letter)}">`;
  }).join('');
}

/** Glifo avulso (letra, acento ou pontuação). */
export function glyphImage(key, label = '') {
  const glyph = G[String(key).toLowerCase()];
  return glyph
    ? `<img class="gl" src="${glyph}" alt="${esc(label)}" title="${esc(label)}">`
    : '—';
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function debounce(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Aceita apenas cores hexadecimais de 6 dígitos. */
export function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

/** Palavras que compõem um significado, para o tradutor PT → Zan. */
export function meaningTokens(meaning) {
  return norm(meaning).split(/[\s,;:/.()[\]{}=+–—-]+/).filter(Boolean);
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
