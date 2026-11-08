import { supabase, appUrl } from '../supabase.js';
import { state, loadProfile } from '../store.js';
import { bareShell, toast, fieldError } from '../ui.js';
import { esc } from '../utils.js';

function authError(error) {
  const message = (error?.message || '').toLowerCase();

  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('user already registered')) return 'Este e-mail já está cadastrado.';
  if (message.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.';
  if (message.includes('database error saving new user')) {
    return 'Não foi possível criar a conta. O nome de usuário pode já estar em uso.';
  }
  if (message.includes('for security purposes') || message.includes('rate limit')) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  if (message.includes('unable to validate email')) return 'E-mail inválido.';
  return error?.message || 'Ocorreu um erro. Tente novamente.';
}

function busy(button, isBusy, idleLabel = 'Entrar') {
  button.disabled = isBusy;
  button.textContent = isBusy ? 'Aguarde…' : idleLabel;
}

function safeNext(params) {
  const next = params.get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dicionario';
}

export async function login(params) {
  document.getElementById('app').innerHTML = bareShell(`
    <div class="card auth-card">
      <h3>Bem-vindo de volta</h3>
      <p class="muted">Entre com suas credenciais.</p>

      <form id="login-form" novalidate>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required>

        <label for="password">Senha</label>
        <div class="row">
          <div class="grow">
            <input id="password" type="password" autocomplete="current-password" placeholder="Sua senha" required>
          </div>
          <button type="button" class="btn sm" data-toggle-password="password">Mostrar</button>
        </div>

        <div class="msg" id="login-msg" role="status"></div>
        <button type="submit" class="btn primary block">Entrar</button>
      </form>

      <div class="auth-links">
        <a href="#/recuperar">Esqueci minha senha</a>
        <a href="#/cadastrar">Criar uma conta</a>
      </div>
    </div>
  `);

  const form = document.getElementById('login-form');
  const msg = document.getElementById('login-msg');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const button = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      fieldError('login-msg', 'Preencha e-mail e senha.');
      return;
    }

    busy(button, true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    busy(button, false);

    if (error) {
      fieldError('login-msg', authError(error));
      return;
    }

    state.session = data.session;
    await loadProfile();
    toast('Sessão iniciada.');
    location.hash = safeNext(params);
  });
}

export async function register(params) {
  document.getElementById('app').innerHTML = bareShell(`
    <div class="card auth-card">
      <h3>Criar uma conta</h3>
      <p class="muted">Cadastre-se para acompanhar o idioma e enviar sugestões ao administrador.</p>

      <form id="register-form" novalidate>
        <label for="username">Nome de usuário</label>
        <input id="username" autocomplete="username" maxlength="24" placeholder="Como quer ser chamado" required>
        <p class="hint">3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado.</p>

        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required>

        <label for="password">Senha</label>
        <div class="row">
          <div class="grow">
            <input id="password" type="password" autocomplete="new-password" placeholder="Mínimo de 6 caracteres" required>
          </div>
          <button type="button" class="btn sm" data-toggle-password="password">Mostrar</button>
        </div>

        <label for="confirm">Confirmar senha</label>
        <input id="confirm" type="password" autocomplete="new-password" placeholder="Repita a senha" required>

        <div class="msg" id="register-msg" role="status"></div>
        <button type="submit" class="btn primary block">Criar conta</button>
      </form>

      <div class="auth-links">
        <a href="#/entrar">Já tenho conta</a>
      </div>
    </div>
  `);

  const form = document.getElementById('register-form');
  const msg = document.getElementById('register-msg');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const button = form.querySelector('button[type="submit"]');

    if (!/^[\p{L}\p{N}._-]{3,24}$/u.test(username)) {
      fieldError('register-msg', 'Nome de usuário inválido. Use 3 a 24 caracteres.');
      return;
    }
    if (!email.includes('@')) {
      fieldError('register-msg', 'Informe um e-mail válido.');
      return;
    }
    if (password.length < 6) {
      fieldError('register-msg', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      fieldError('register-msg', 'As senhas não coincidem.');
      return;
    }

    busy(button, true, 'Criar conta');

    const { data: available, error: checkError } = await supabase.rpc('username_available', {
      p_username: username
    });

    if (!checkError && available === false) {
      busy(button, false, 'Criar conta');
      fieldError('register-msg', 'Este nome de usuário já está em uso.');
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: appUrl()
      }
    });

    busy(button, false, 'Criar conta');

    if (error) {
      fieldError('register-msg', authError(error));
      return;
    }

    if (data.session) {
      state.session = data.session;
      await loadProfile();
      toast('Conta criada. Bem-vindo ao Tacizin!');
      location.hash = safeNext(params);
      return;
    }

    form.outerHTML = `<div class="notice success">
      <b>Conta criada.</b><br>
      Enviamos um link de confirmação para <b>${esc(email)}</b>.
      Abra o e-mail e clique no link para ativar sua conta.
    </div>
    <div class="auth-links"><a href="#/entrar">Ir para o login</a></div>`;
  });
}

export async function recover() {
  document.getElementById('app').innerHTML = bareShell(`
    <div class="card auth-card">
      <h3>Recuperar senha</h3>
      <p class="muted">Informe o e-mail cadastrado e enviaremos um link para criar uma nova senha.</p>

      <form id="recover-form" novalidate>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" required>
        <div class="msg" id="recover-msg" role="status"></div>
        <button type="submit" class="btn primary block">Enviar link</button>
      </form>

      <div class="auth-links">
        <a href="#/entrar">Voltar ao login</a>
      </div>
    </div>
  `);

  const form = document.getElementById('recover-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const button = form.querySelector('button[type="submit"]');
    if (!email) {
      fieldError('recover-msg', 'Informe seu e-mail.');
      return;
    }

    busy(button, true, 'Enviar link');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
    busy(button, false, 'Enviar link');

    if (error) {
      fieldError('recover-msg', authError(error));
      return;
    }

    form.outerHTML = `<div class="notice success">
      Se este e-mail estiver cadastrado, o link de recuperação chegará em instantes.
      Verifique também a caixa de spam.
    </div>
    <div class="auth-links"><a href="#/entrar">Voltar ao login</a></div>`;
  });
}

export async function reset(params) {
  const app = document.getElementById('app');
  const tokenError = params.get('error_description');

  if (tokenError) {
    app.innerHTML = bareShell(`
      <div class="card auth-card">
        <h3>Link inválido</h3>
        <p class="err">${esc(tokenError.replace(/\+/g, ' '))}</p>
        <a class="btn primary block" href="#/recuperar">Solicitar novo link</a>
      </div>
    `);
    return;
  }

  if (!state.session) {
    app.innerHTML = bareShell(`
      <div class="card auth-card">
        <h3>Link expirado</h3>
        <p class="muted">Este link de recuperação não é mais válido ou já foi usado.</p>
        <a class="btn primary block" href="#/recuperar">Solicitar novo link</a>
        <div class="auth-links"><a href="#/entrar">Voltar ao login</a></div>
      </div>
    `);
    return;
  }

  app.innerHTML = bareShell(`
    <div class="card auth-card">
      <h3>Nova senha</h3>
      <p class="muted">Defina uma nova senha para sua conta.</p>

      <form id="reset-form" novalidate>
        <label for="password">Nova senha</label>
        <div class="row">
          <div class="grow">
            <input id="password" type="password" autocomplete="new-password" placeholder="Mínimo de 6 caracteres" required>
          </div>
          <button type="button" class="btn sm" data-toggle-password="password">Mostrar</button>
        </div>

        <label for="confirm">Confirmar nova senha</label>
        <input id="confirm" type="password" autocomplete="new-password" placeholder="Repita a senha" required>

        <div class="msg" id="reset-msg" role="status"></div>
        <button type="submit" class="btn primary block">Salvar nova senha</button>
      </form>
    </div>
  `);

  const form = document.getElementById('reset-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirm').value;
    const button = form.querySelector('button[type="submit"]');

    if (password.length < 6) {
      fieldError('reset-msg', 'A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      fieldError('reset-msg', 'As senhas não coincidem.');
      return;
    }

    busy(button, true, 'Salvar nova senha');
    const { error } = await supabase.auth.updateUser({ password });
    busy(button, false, 'Salvar nova senha');

    if (error) {
      fieldError('reset-msg', authError(error));
      return;
    }

    toast('Senha atualizada com sucesso.');
    location.hash = '/dicionario';
  });
}
