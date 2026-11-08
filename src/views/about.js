import { state } from '../store.js';
import { shell } from '../ui.js';
import { esc, plural } from '../utils.js';

export async function render() {
  const settings = state.settings;
  const aboutText = settings.about?.trim() || `O ${settings.site_name} é o portal oficial do Idimus Donv Zan:
    dicionário, alfabeto e tradutor de uma língua criada para preservar uma identidade.
    O vocabulário é curado pelo administrador do portal, e qualquer pessoa com uma conta
    pode enviar sugestões de novas palavras ou correções.`;

  document.getElementById('app').innerHTML = shell(`
    <h2>Sobre o ${esc(settings.site_name)}</h2>
    <p class="lede">${esc(settings.hero_phrase)}</p>

    <div class="section">
      <p class="about-text">${esc(aboutText)}</p>
    </div>

    <div class="section">
      <h3>Informações do sistema</h3>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr><th>Nome do sistema</th><td>${esc(settings.site_name)}</td></tr>
            <tr><th>Idioma</th><td>${esc(settings.tagline)}</td></tr>
            <tr><th>Criador</th><td>Zani</td></tr>
            <tr><th>Letras</th><td>21 independentes (CH, LH e SS são letras próprias)</td></tr>
            <tr><th>Palavras publicadas</th><td>${plural(state.words.length, 'palavra', 'palavras')}</td></tr>
            <tr><th>Versão do portal</th><td>2.0 · banco de dados compartilhado</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="section">
      <h3>Como o portal funciona</h3>
      <div class="pillars">
        <div class="pillar">
          <h4>Consulta livre</h4>
          <p>Qualquer visitante pode pesquisar o dicionário, o alfabeto e o tradutor.</p>
        </div>
        <div class="pillar">
          <h4>Conta de estudante</h4>
          <p>Cadastre-se para enviar sugestões de palavras e correções ao administrador.</p>
        </div>
        <div class="pillar">
          <h4>Curadoria do mestre</h4>
          <p>O administrador aprova, recusa e publica o conteúdo, garantindo a consistência da língua.</p>
        </div>
      </div>
    </div>

    ${!state.session
      ? `<div class="notice">
          Quer contribuir com o idioma? <a href="#/cadastrar">Crie sua conta</a> e envie sugestões.
        </div>`
      : `<div class="notice">
          <a href="#/sugerir">Enviar uma sugestão</a> · <a href="#/minhas-sugestoes">Acompanhar minhas sugestões</a>
        </div>`}
  `);
}
