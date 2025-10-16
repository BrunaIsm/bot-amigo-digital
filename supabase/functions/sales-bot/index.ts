import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, folderId } = await req.json();
    console.log('Received query:', query);
    console.log('Folder ID:', folderId);

    // Get credentials from secrets
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!serviceAccountJson || !lovableApiKey) {
      throw new Error('Missing required secrets');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    console.log('Service account loaded for:', serviceAccount.client_email);

    // Get OAuth token
    const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const now = Math.floor(Date.now() / 1000);
    const jwtClaimSet = btoa(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    }));

    // Import key and sign
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(serviceAccount.private_key),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(`${jwtHeader}.${jwtClaimSet}`)
    );

    const jwt = `${jwtHeader}.${jwtClaimSet}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const { access_token } = await tokenResponse.json();
    console.log('OAuth token obtained');

    // List spreadsheets in folder
    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const { files } = await driveResponse.json();
    console.log(`Found ${files?.length || 0} spreadsheets`);

    if (!files || files.length === 0) {
      throw new Error('No spreadsheets found in folder');
    }

    // Read all spreadsheets
    let allData = 'data,id_transacao,produto,categoria,regiao,quantidade,preco_unitario,receita_total,mes_origem\n';
    
    for (const file of files) {
      console.log(`Reading: ${file.name}`);
      
      const sheetsResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/A1:H`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );

      const { values } = await sheetsResponse.json();
      
      if (values && values.length > 1) {
        // Skip header row
        for (let i = 1; i < values.length; i++) {
          const row = values[i];
          if (row.length >= 8) {
            allData += `${row.join(',')},${file.name}\n`;
          }
        }
      }
    }

    console.log('Data consolidated, sending to AI');

    // Query Gemini via Lovable AI
    const systemPrompt = `Você é o 'Alpha Insights Sales Bot', um analista de dados de vendas sênior.
Analise o CSV fornecido e responda à pergunta do usuário.

Contexto: Alpha Insights é uma varejista de tecnologia.

Estrutura do CSV:
- data: Data da transação
- id_transacao: ID único
- produto: Nome do produto
- categoria: Categoria
- regiao: Região de venda
- quantidade: Unidades vendidas
- preco_unitario: Preço por unidade
- receita_total: Receita total
- mes_origem: Mês de origem

Instruções:
1. Base sua análise EXCLUSIVAMENTE nos dados do CSV
2. Realize cálculos necessários (somas, médias, percentuais)
3. Seja claro e objetivo em português brasileiro
4. Apresente valores em R$ quando apropriado
5. Use emojis para melhor visualização (📊 📈 💰 🏆)`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Pergunta: ${query}\n\n--- DADOS ---\n${allData}` }
        ],
        temperature: 0.2
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const answer = aiData.choices[0].message.content;

    console.log('Analysis complete');

    return new Response(
      JSON.stringify({ answer }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}