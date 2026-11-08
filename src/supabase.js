import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const configured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('SEU-PROJETO') &&
  !SUPABASE_URL.includes('abcdefgh')
);

export const isConfigured = () => configured;

/**
 * O supabase-js consome e limpa o hash da URL ao processar links de
 * recuperação/confirmação. Guardamos o valor original para o roteador
 * conseguir levar a pessoa até a tela de nova senha.
 */
export const initialHash = typeof location !== 'undefined' ? location.hash : '';

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    })
  : null;

/** URL base do site, usada nos redirecionamentos de e-mail do Supabase. */
export function appUrl() {
  const path = location.pathname.replace(/\/index\.html?$/i, '/');
  return `${location.origin}${path}`;
}
