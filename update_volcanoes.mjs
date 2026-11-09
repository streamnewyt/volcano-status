// update_volcanoes.mjs
// Atualizador diário resiliente usando chamada direta à API REST do Google Gemini
import fs from 'fs';
import path from 'path';
import dns from 'node:dns';

// Força IPv4 no Node para evitar bug clássico de conexão (fetch failed / hang) nos runners do GitHub Actions
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("ERRO: GEMINI_API_KEY não configurada nos Secrets do repositório.");
    process.exit(1);
}

const VOLCANO_LIST = [
    "Popocatépetl", "Kilauea", "Fuego", "Poas", "Etna", "Stromboli", 
    "Cumbre Vieja", "Aso", "Sakurajima", "Semeru", "Lewotolo", "Tambora", 
    "Dukono", "Fagradalsfjall", "Katla", "Yellowstone", "Krakatau", "Spurr", 
    "Santa María", "Bromo", "Campi Flegrei", "Svartsengi", "Tokachi", 
    "Whakaari / White Island", "Kirishima"
];

const PROMPT = `Você é um vulcanólogo assistente internacional.
Consulte as fontes oficiais mais recentes (Smithsonian Global Volcanism Program, USGS, INGV, JMA, PVMBG, IMO, CENAPRED, INSIVUMEH, GeoNet).
Para os seguintes vulcões:
${VOLCANO_LIST.join(', ')}

Retorne ESTRITAMENTE um objeto JSON válido no seguinte formato com suporte multilíngue (pt-br, en, es, id):
{
  "lastUpdated": "${new Date().toISOString()}",
  "volcanoes": {
    "NomeDoVulcao": {
      "alert": {
        "pt-br": "Nível de alerta em português (ex: AMARELO, LARANJA, VERMELHO, VERDE)",
        "en": "Alert level in English (ex: YELLOW, ORANGE, RED, GREEN)",
        "es": "Nivel de alerta en español (ex: AMARILLO, NARANJA, ROJO, VERDE)",
        "id": "Tingkat peringatan dalam bahasa Indonesia (ex: WASPADA, SIAGA, AWAS, NORMAL)"
      },
      "color": "Cor em hexadecimal: VERDE = #2ecc71, AMARELO = #f1c40f, LARANJA = #e67e22, VERMELHO = #e74c3c",
      "status": {
        "pt-br": "Resumo de 1 frase (máx 25 palavras) em português da atividade mais recente",
        "en": "1-sentence summary (max 25 words) in English of latest observed activity",
        "es": "Resumen de 1 frase (máx 25 palabras) en español de la actividad reciente",
        "id": "Ringkasan 1 kalimat (maks 25 kata) dalam bahasa Indonesia tentang aktivitas terbaru"
      },
      "report_date": "Data do relatório oficial (ex: DD/MM/AAAA)",
      "source": "Observatório oficial (ex: INGV, USGS, PVMBG, Smithsonian)"
    }
  }
}
Importante: Seja preciso e sóbrio; não invente erupções para vulcões calmos.`;

const MODELS_TO_TRY = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-pro-latest"
];

async function generateWithFallback() {
    for (const model of MODELS_TO_TRY) {
        console.log(`Tentando gerar dados com o modelo: ${model}...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: PROMPT }] }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                }),
                signal: AbortSignal.timeout(35000) // Timeout de 35s por modelo para não travar
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    console.log(`Sucesso com o modelo: ${model}!`);
                    return text;
                }
            } else {
                const errText = await res.text();
                console.warn(`Modelo ${model} retornou HTTP ${res.status}: ${errText.substring(0, 150)}`);
            }
        } catch (e) {
            console.warn(`Erro na tentativa de ${model}:`, e.message);
        }
    }
    throw new Error("Nenhum modelo da lista respondeu com sucesso.");
}

async function run() {
    try {
        const rawJsonText = await generateWithFallback();
        
        let cleaned = rawJsonText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        else if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```\s*/, '').replace(/```$/, '').trim();

        const data = JSON.parse(cleaned);
        const outputPath = path.resolve('volcano-status.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Sucesso final! volcano-status.json atualizado com ${Object.keys(data.volcanoes || {}).length} vulcões.`);
    } catch (err) {
        console.error("Falha geral ao atualizar status dos vulcões:", err);
        process.exit(1);
    }
}

run();
