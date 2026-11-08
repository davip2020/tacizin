import { shell } from '../ui.js';
import { esc, glyphImage } from '../utils.js';
import { ORDER, NAMES, ACC, PUN } from '../glyphs.js';

export async function render() {
  document.getElementById('app').innerHTML = shell(`
    <h2>Alfabeto</h2>
    <p class="lede">21 letras independentes. CH, LH e SS são letras próprias, não combinações.</p>

    <section class="section">
      <h3>1. Letras</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>#</th><th>Símbolo</th><th>Letra</th><th>Nome</th></tr>
          </thead>
          <tbody>
            ${ORDER.map((letter, index) => `<tr>
              <td class="num">${index + 1}</td>
              <td>${glyphImage(letter, letter)}</td>
              <td class="letter">${esc(letter)}</td>
              <td>${esc(NAMES[index])}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h3>2. Acentuação</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Sinal</th><th>Nome</th><th>Equivalência</th><th>Explicação</th></tr>
          </thead>
          <tbody>
            ${ACC.map((item, index) => `<tr>
              <td>${glyphImage(`ac${index + 1}`, item[0])}</td>
              <td>${esc(item[0])}</td>
              <td>${esc(item[1])}</td>
              <td>${esc(item[2])}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="section">
      <h3>3. Pontuação</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Sinal</th><th>Nome</th><th>Equivalente</th><th>Explicação</th></tr>
          </thead>
          <tbody>
            ${PUN.map((item, index) => `<tr>
              <td>${glyphImage(`pu${index + 1}`, item[0])}</td>
              <td>${esc(item[1])}</td>
              <td>${esc(item[0])}</td>
              <td>${esc(item[2])}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <div class="notice">
      Os glifos acima são a escrita oficial do Idimus Donv Zan. Ao digitar uma palavra
      no dicionário ou no tradutor, o portal converte automaticamente as letras em símbolos.
    </div>
  `);
}
