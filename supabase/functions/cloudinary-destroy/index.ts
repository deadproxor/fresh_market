import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // 1. Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Validate Authorization header and ensure user has 'admin' role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid session token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const role = user.app_metadata?.role;
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Extract Cloudinary configuration from Edge Function Secrets (lowercase)
    const cloudName = Deno.env.get('cloudinary_cloud_name') || Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const cloudApiKey = Deno.env.get('cloudinary_api_key') || Deno.env.get('CLOUDINARY_API_KEY');
    const cloudApiSecret = Deno.env.get('cloudinary_api_secret') || Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !cloudApiKey || !cloudApiSecret) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: cloudinary_cloud_name, cloudinary_api_key or cloudinary_api_secret not set in Supabase Vault' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse request payload
    const body = await req.json().catch(() => ({}));
    const publicId = typeof body.public_id === 'string' ? body.public_id.trim() : '';
    if (!publicId) {
      return new Response(JSON.stringify({ error: 'Invalid or missing public_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Generate secure SHA-1 signature on server
    const timestamp = Math.floor(Date.now() / 1000);
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${cloudApiSecret}`;
    const msgUint8 = new TextEncoder().encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // 6. Invoke Cloudinary Destroy API
    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', cloudApiKey);
    formData.append('signature', signature);

    const cloudinaryRes = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
      {
        method: 'POST',
        body: formData
      }
    );

    const resultData = await cloudinaryRes.json().catch(() => ({}));
    if (!cloudinaryRes.ok) {
      return new Response(
        JSON.stringify({ error: resultData.error?.message || 'Cloudinary destroy API error' }),
        { status: cloudinaryRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ result: 'ok', data: resultData }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
