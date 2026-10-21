// Supabase Edge Functions CORS Headers Helper
const ALLOWED_ORIGINS = [
  'http://localhost:3030',
  'http://127.0.0.1:3030',
  'https://deadproxor.github.io'
];

export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.github.io');
  const allowOrigin = isAllowed ? origin : (ALLOWED_ORIGINS[0] || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
