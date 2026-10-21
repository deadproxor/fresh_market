import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { getCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  const cors = getCorsHeaders(req);

  // 1. Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // 2. Validate Authorization header and ensure user has 'admin' role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' }
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
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const role = user.app_metadata?.role;
    if (role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin role required' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 3. Extract Cloudinary configuration from Edge Function Secrets (lowercase)
    const cloudName = Deno.env.get('cloudinary_cloud_name') || Deno.env.get('CLOUDINARY_CLOUD_NAME');
    const cloudApiKey = Deno.env.get('cloudinary_api_key') || Deno.env.get('CLOUDINARY_API_KEY');
    const cloudApiSecret = Deno.env.get('cloudinary_api_secret') || Deno.env.get('CLOUDINARY_API_SECRET');

    if (!cloudName || !cloudApiKey || !cloudApiSecret) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: cloudinary secrets not set in Supabase Vault' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse and validate request payload
    const body = await req.json().catch(() => ({}));
    const publicId = typeof body.public_id === 'string' ? body.public_id.trim() : '';

    if (!publicId || publicId.length > 255 || publicId.includes('..') || publicId.startsWith('/') || !/^[a-zA-Z0-9_\-\/]+$/.test(publicId)) {
      return new Response(JSON.stringify({ error: 'Invalid public_id parameter' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Ensure publicId is scoped to project media folders
    const allowedPrefixes = ['freshmarket/', 'products/'];
    const customFolder = Deno.env.get('cloudinary_folder') || Deno.env.get('CLOUDINARY_FOLDER');
    if (customFolder) allowedPrefixes.push(`${customFolder.replace(/^\/+|\/+$/g, '')}/`);

    const hasAllowedPrefix = allowedPrefixes.some((pfx) => publicId.startsWith(pfx));
    if (!hasAllowedPrefix) {
      return new Response(JSON.stringify({ error: 'Forbidden: public_id must reside within allowed project folders' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' }
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
        { status: cloudinaryRes.status, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ result: 'ok', data: resultData }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[cloudinary-destroy error]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
