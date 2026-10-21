import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';
import { getCorsHeaders } from '../_shared/cors.ts';

const ALLOWED_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-3.5-flash',
  'gemini-3.8-flash'
];

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

    // 3. Extract Gemini API key from Edge Function Secrets (lowercase)
    const geminiApiKey = Deno.env.get('gemini_api_key') || Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: gemini_api_key not set in Supabase Vault' }),
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse request payload and enforce limits
    const body = await req.json().catch(() => ({}));
    const rawImage = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!rawImage) {
      return new Response(JSON.stringify({ error: 'Missing imageBase64 data' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // Enforce 7MB payload size limit (~10 million characters in base64)
    if (rawImage.length > 10_000_000) {
      return new Response(JSON.stringify({ error: 'Payload Too Large: imageBase64 exceeds 7MB limit' }), {
        status: 413,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, '');
    const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg';
    
    // Model whitelist check
    const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
    const modelToUse = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'gemini-2.5-flash';

    const systemPrompt = `You are an expert botanist, food specialist, and market produce expert specializing in fresh foods, ingredients, seafood, meats, herbs, fruits, and mushrooms found in Southeast Asian morning markets.
Analyze the food product in this image and return a JSON object with:
- "name_en": Clear English name of the product (e.g. "Chicken Drumsticks", "Lemongrass", "Garlic", "Crab", "Bitter Gourd").
- "name_ru": Clear Russian name of the product (e.g. "Куриные голени", "Лемонграсс", "Чеснок", "Краб", "Горькая тыква").
- "name_kh": Authentic Khmer script name followed by pronunciation transcription in English in brackets (e.g. "ភ្លៅមាន់ (Phlov Moan)", "ស្លឹកគ្រៃ (Sloek Krey)", "ខ្ទឹមស (Khtem Sor)").
- "category": MUST be one of these exact 9 categories:
  ["Овощи", "Корнеплоды", "Фрукты", "Зелень и травы", "Корни и пряности", "Морепродукты и рыба", "Мясо и птица", "Соусы и бакалея", "Грибы"]
- "form": The form/state of the item, MUST be one of:
  ["Целый", "Пучок", "Корень", "Стручок", "Нарезка", "Филе", "Фарш", "Очищенный", "Сушеный", "Молотый", "Паста", "Маринованный", "Замороженный", "Бутылка"]. For bottled/jarred sauces, oils, soy/fish sauce and liquid condiments in "Соусы и бакалея", use "Бутылка" (or "Паста" for thick pastes). NEVER use "Жидкий" or "Соус".
- "description": Short helpful description in Russian (1-2 sentences about taste, culinary use, or how to pick it at the market).

Return ONLY raw valid JSON, no markdown code block fences.`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData.error?.message || `Gemini API error (${response.status})`;
      return new Response(JSON.stringify({ error: errMsg }), {
        status: response.status,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      return new Response(JSON.stringify({ error: 'Empty response from Gemini' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const cleanText = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleanText);

    return new Response(
      JSON.stringify({ result: parsed }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[gemini-vision error]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
