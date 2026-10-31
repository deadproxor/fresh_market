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

    // 3. Handle GET: Retrieve all admin settings
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value, updated_at');

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const settingsMap: Record<string, any> = {};
      if (Array.isArray(data)) {
        for (const item of data) {
          settingsMap[item.key] = item.value;
        }
      }

      return new Response(JSON.stringify({ success: true, settings: settingsMap }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // 4. Handle POST / PUT: Upsert admin settings
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = await req.json().catch(() => ({}));
      const settings = body.settings;

      if (!settings || typeof settings !== 'object') {
        return new Response(JSON.stringify({ error: 'Payload must include settings object' }), {
          status: 400,
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const upsertRows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? value : { value },
        updated_at: new Date().toISOString(),
        updated_by: user.id
      }));

      if (upsertRows.length > 0) {
        const { error: upsertError } = await supabase
          .from('admin_settings')
          .upsert(upsertRows, { onConflict: 'key' });

        if (upsertError) {
          return new Response(JSON.stringify({ error: upsertError.message }), {
            status: 500,
            headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Settings saved' }), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: `Method ${req.method} not allowed` }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});

