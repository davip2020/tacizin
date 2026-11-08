# Tacizin · Idimus Donv Zan

Portal do idioma **Idimus Donv Zan**: dicionário, alfabeto, tradutor e curadoria de sugestões.

O site é 100% estático (HTML + CSS + JavaScript puro, sem build) e usa o
**Supabase** como banco de dados compartilhado (PostgreSQL + Auth + Storage + Realtime).
Isso permite hospedar no **GitHub Pages** mantendo os dados centralizados.

---

## Como o portal funciona

| Papel | Permissões |
| --- | --- |
| **Visitante** | Consulta o dicionário, o alfabeto e o tradutor. Não altera nada. |
| **Pessoa cadastrada** | Tudo do visitante + envia sugestões de palavras/correções e acompanha o status. |
| **Administrador (mestre)** | Controla todo o conteúdo: cria, edita e exclui palavras, aprova/recusa sugestões, personaliza o portal (nome, cores, textos e logo) e importa/exporta o dicionário. |

- O dicionário é **público para leitura** (não exige login).
- Sugestões exigem conta e ficam **pendentes** até a decisão do administrador.
- Ao aprovar, a palavra é publicada imediatamente e a sugestão vira `approved`.
- Ao recusar, o autor vê o motivo informado em **Minhas sugestões**.
- Limite anti-spam: **10 sugestões pendentes** por pessoa.
- O papel `admin` **só pode ser concedido por SQL** — nunca pela interface.

---

## Passo a passo

### 1. Criar o projeto no Supabase

1. Acesse <https://supabase.com> e crie uma conta.
2. Crie um **New project** (plano gratuito serve).
3. Anote a senha do banco e aguarde a inicialização.

### 2. Executar o schema

1. No painel do Supabase, abra **SQL Editor → New query**.
2. Cole **todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Clique em **Run**.

O script é idempotente: pode ser executado novamente em caso de atualização.
Ele cria:

- tabelas `profiles`, `words`, `suggestions` e `site_settings`;
- triggers de perfil automático, normalização de palavras e limite de sugestões;
- funções `username_available`, `approve_suggestion`, `reject_suggestion` e `import_words`;
- políticas de **Row Level Security (RLS)**;
- bucket público `assets` (logo) no Storage;
- publicação Realtime para palavras e sugestões.

### 3. Conectar o site ao banco

No painel do Supabase, abra **Project Settings → API** e copie:

- **Project URL**
- **anon public** (não use `service_role`!)

Edite [`src/config.js`](src/config.js):

```js
export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
export const SUPABASE_ANON_KEY = 'SUA-CHAVE-ANON-PUBLICA';
```

A chave `anon` é pública de propósito. A proteção real vem das políticas de RLS.

### 4. Criar a primeira conta e promover o administrador

1. Abra o site e clique em **Criar conta** (use o nome de usuário desejado, ex.: `Zani`).
2. Confirme o e-mail, se a confirmação estiver ativada.
3. No **SQL Editor**, execute:

```sql
update public.profiles
set role = 'admin'
where lower(username) = lower('Zani');
```

4. Saia e entre novamente. O menu **Administração** aparecerá.

> Para adicionar outro administrador, repita o `update` com o username desejado.

### 5. Configurar autenticação e URLs de redirecionamento

Em **Authentication → URL Configuration**:

- **Site URL**: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
- **Redirect URLs** (adicione todas que usar):
  - `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`
  - `http://127.0.0.1:5173/` (teste local)
  - `http://localhost:5173/`

Os links de confirmação de conta e de recuperação de senha usam essa URL.
O portal já sabe processar os tokens e abrir a tela correta (inclusive
`#type=recovery`), mesmo depois que o Supabase limpa o hash da URL.

Em **Authentication → Providers → Email**:

- Para testes rápidos, você pode desativar **Confirm email**.
- Para produção, mantenha a confirmação ativada e configure um **SMTP próprio**
  (Authentication → Emails) para evitar o limite de e-mails do Supabase.

### 6. Publicar no GitHub Pages

O site não tem etapa de build. Todo o conteúdo já está pronto para ser servido.

**Opção A — pelo site do GitHub**

1. Crie um repositório (público ou privado com Pages habilitado).
2. Envie **o conteúdo desta pasta** para a raiz do repositório, mantendo
   `index.html` na raiz e as pastas `src/`, `assets/`, `supabase/` e `tools/`.
3. Vá em **Settings → Pages**.
4. Em **Build and deployment**, escolha **Deploy from a branch**.
5. Selecione a branch `main` e a pasta `/ (root)`. Salve.
6. Aguarde alguns minutos e acesse
   `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

**Opção B — por linha de comando**

```bash
git init
git add .
git commit -m "Tacizin 2.0 com Supabase"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u origin main
```

O arquivo `.nojekyll` já está incluído para o GitHub Pages não processar o site
com o Jekyll.

> O roteamento usa `#/rota` (hash), então funciona em subpastas do GitHub Pages
> sem configuração de servidor.

### 7. Conferir a instalação

1. Abra o site publicado.
2. O dicionário deve carregar (mesmo vazio, sem erro).
3. Crie uma conta de teste, envie uma sugestão.
4. Entre como administrador, aprove a sugestão e confira a palavra publicada.
5. Personalize o portal em **Administração → Personalizar portal**.

Se aparecer **“Configuração pendente”**, os valores de `src/config.js` ainda não
foram preenchidos ou o navegador está com o arquivo antigo em cache.
Se aparecer **“Banco de dados indisponível”**, o `schema.sql` ainda não foi executado.

---

## Importar o backup do aplicativo antigo

O app antigo exportava um arquivo `tacizin_backup.json` no formato:

```json
{
  "words": [
    { "id": 1, "word": "Zan", "meaning": "guerra", "pron": "zán" }
  ],
  "users": [],
  "wotd": null
}
```

No portal novo:

1. Entre como administrador.
2. Abra **Administração**.
3. Em **Backup do dicionário**, clique em **Importar backup (.json)**.
4. Selecione o arquivo antigo.

A importação:

- aproveita **somente as palavras** (`word`, `meaning` e `pron`/`pronunciation`);
- ignora palavras repetidas automaticamente;
- **não migra contas nem senhas antigas** — cada pessoa deve criar uma nova conta;
- aceita também o JSON exportado pelo próprio portal novo.

Para exportar uma cópia atualizada, use **Exportar palavras (.json)** no painel.

---

## Personalização

Em **Administração → Personalizar portal** o mestre altera:

- nome do site, subtítulo e frase de destaque;
- texto da página “Sobre”;
- cor principal e cor secundária;
- texto do rodapé;
- logo do portal.

O logo é enviado para o bucket público `assets` do Supabase Storage
(PNG, JPG, WEBP, SVG ou GIF, até 2 MB). As alterações valem para todos os
visitantes e são aplicadas em tempo real.

---

## Estrutura do projeto

```text
.
├── index.html                  # entrada do site (ES modules)
├── assets/
│   └── favicon.svg
├── src/
│   ├── config.js               # URL e chave anon do Supabase (preencher)
│   ├── supabase.js             # cliente Supabase e URL de redirecionamento
│   ├── store.js                # sessão, perfil, configurações e palavras
│   ├── router.js               # rotas por hash, guards de auth/admin
│   ├── ui.js                   # shell, hero, modal, toast e helpers
│   ├── utils.js                # glifos, normalização, ordenação e escapes
│   ├── glyphs.js               # alfabeto, acentos, pontuação e SVGs oficiais
│   ├── styles.css              # identidade visual completa
│   ├── main.js                 # inicialização
│   └── views/
│       ├── setup.js            # instruções quando falta configurar
│       ├── auth.js             # login, cadastro, recuperação e nova senha
│       ├── dictionary.js       # dicionário público
│       ├── alphabet.js         # alfabeto, acentos e pontuação
│       ├── translator.js       # tradutor nos dois sentidos + teclado Zan
│       ├── about.js            # página “Sobre”
│       ├── suggestions.js      # envio e acompanhamento de sugestões
│       └── admin.js            # painel, CRUD, sugestões e personalização
├── supabase/
│   └── schema.sql              # schema completo (rodar no SQL Editor)
├── tools/
│   └── serve.cjs               # servidor local sem dependências
├── .nojekyll                   # necessário para o GitHub Pages
├── .gitignore
├── package.json
└── README.md
```

---

## Desenvolvimento local

Requisitos: **Node.js 18+** (apenas para o servidor local) e um navegador moderno.

```bash
npm start
```

O site abre em <http://127.0.0.1:5173/>.

> Abrir `index.html` diretamente com `file://` **não funciona**, porque os
> navegadores bloqueiam ES modules nesse protocolo. Use `npm start` ou o
> GitHub Pages.

Não há `npm install`: o servidor local não tem dependências e o cliente Supabase
é carregado por CDN (`jsdelivr`).

---

## Segurança

- A chave `anon` é pública e **pode** ficar no repositório.
- **Nunca** coloque a chave `service_role` no front-end nem no repositório.
- Toda autorização é feita no servidor pelas políticas de RLS:
  - qualquer pessoa lê o dicionário e as configurações públicas;
  - apenas pessoas autenticadas leem o próprio perfil e criam sugestões;
  - apenas o administrador escreve em palavras/configurações e revisa sugestões;
  - apenas o administrador envia arquivos ao bucket `assets`.
- O papel `admin` só é concedido por SQL no painel do Supabase.
- O cadastro usa e-mail + senha com hash gerenciado pelo Supabase Auth.

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| “Configuração pendente” | `src/config.js` vazio | Preencha URL e chave `anon` e recarregue (Ctrl+F5). |
| “Banco de dados indisponível” | `schema.sql` não executado | Rode o arquivo completo no SQL Editor. |
| `relation "public.words" does not exist` | Schema não aplicado | Idem acima. |
| “E-mail ou senha incorretos” | Credenciais inválidas | Confira e-mail/senha ou use “Esqueci minha senha”. |
| “Confirme seu e-mail antes de entrar” | Confirmação ativada | Abra o link enviado ou desative **Confirm email** para testes. |
| Link de recuperação cai no dicionário | URL não está na lista de redirecionamento | Adicione a URL em **Authentication → URL Configuration**. |
| “Bucket assets não encontrado” | Schema antigo sem a seção de Storage | Execute novamente o `schema.sql`. |
| Dicionário não atualiza sozinho | Realtime não publicado | Rode novamente a seção 9 do `schema.sql`; confira **Database → Replication**. |
| Projeto Supabase pausado | Inatividade no plano gratuito | Reative o projeto no painel do Supabase. |
| Alterações não aparecem no site publicado | Cache do navegador/CDN | Aguarde 1–2 min e recarregue com Ctrl+F5. |

---

## Limites do plano gratuito (referência)

- Banco PostgreSQL com espaço limitado (suficiente para um dicionário).
- Autenticação com e-mail; SMTP próprio recomendado para produção.
- Projetos gratuitos podem ser pausados após longos períodos sem uso.
- Storage e Realtime possuem cotas próprias — consulte a página de preços do
  Supabase para valores atualizados.

---

## Créditos

Idioma, alfabeto e identidade visual: **Tacizin · Idimus Donv Zan**.
Portal 2.0: banco compartilhado, autenticação, sugestões e curadoria.
