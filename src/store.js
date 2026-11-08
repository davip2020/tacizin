import { supabase } from './supabase.js';
import { cmp, safeColor } from './utils.js';

export const DEFAULT_SETTINGS = {
  site_name: 'Tacizin',
  tagline: 'Idimus Donv Zan',
  hero_phrase: '“Uma língua. Uma identidade. Uma civilização.”',
  about: '',
  accent: '#c9b68c',
  accent2: '#8f7f60',
  footer_text: '© TACIZIN · IDIMUS DONV ZAN',
  logo_url: null
};

export const state = {
  session: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  words: [],
  dataLoaded: false
};

export const isLoggedIn = () => Boolean(state.session);
export const isAdmin = () => state.profile?.role === 'admin';

export function applySettings() {
  const settings = state.settings;
  document.title = `${settings.site_name} · ${settings.tagline}`;

  const root = document.documentElement.style;
  root.setProperty('--acc', safeColor(settings.accent, DEFAULT_SETTINGS.accent));
  root.setProperty('--acc2', safeColor(settings.accent2, DEFAULT_SETTINGS.accent2));

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute(
      'content',
      `${settings.site_name} — ${settings.tagline}. Dicionário e sistema linguístico.`
    );
  }
}

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session || null;
  if (state.session) await loadProfile();

  // O callback roda fora do lock interno do supabase-js (evita deadlock).
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      state.session = session || null;
      if (!session) {
        state.profile = null;
      } else if (!state.profile || state.profile.id !== session.user.id) {
        await loadProfile();
      }
      if (event === 'PASSWORD_RECOVERY') {
        location.hash = '/redefinir';
      }
      document.dispatchEvent(new Event('tz:auth'));
    }, 0);
  });
}

export async function loadProfile() {
  if (!state.session) {
    state.profile = null;
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', state.session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar perfil:', error);
    return null;
  }

  if (data) {
    state.profile = data;
    return data;
  }

  // Rede de segurança: se o trigger de cadastro falhou, cria o perfil.
  const metadata = state.session.user.user_metadata || {};
  const fallbackName = metadata.username || (state.session.user.email || 'usuario').split('@')[0];
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({ id: state.session.user.id, username: fallbackName })
    .select()
    .maybeSingle();

  if (insertError) {
    console.error('Erro ao criar perfil:', insertError);
    return null;
  }

  state.profile = created;
  return created;
}

export async function loadWords() {
  const { data, error } = await supabase.from('words').select('*');
  if (error) throw error;
  state.words = (data || []).sort((a, b) => cmp(a.word, b.word));
  return state.words;
}

export async function loadSettings() {
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (data) state.settings = { ...DEFAULT_SETTINGS, ...data };
  applySettings();
  return state.settings;
}

export async function ensureData(force = false) {
  if (state.dataLoaded && !force) return;
  await Promise.all([loadSettings(), loadWords()]);
  state.dataLoaded = true;
}

export async function refreshWords() {
  await loadWords();
  document.dispatchEvent(new Event('tz:words'));
}

export async function refreshSettings() {
  await loadSettings();
  document.dispatchEvent(new Event('tz:settings'));
}

export async function signOut() {
  await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
}

/** Assina mudanças em uma tabela; devolve função de limpeza. */
export function subscribeTableChanges(table, callback, filter) {
  const channel = supabase
    .channel(`tz-${table}-${Math.random().toString(36).slice(2, 9)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(filter ? { filter } : {})
      },
      callback
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
