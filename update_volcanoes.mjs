// update_volcanoes.mjs
// Executado diariamente pelo GitHub Actions para atualizar volcano-status.json usando o Gemini Flash
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("ERRO: GEMINI_API_KEY não configurada nos Secrets do repositório.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

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

Retorne ESTRITAMENTE um objeto JSON válido (sem tags markdown \`\`\`json) no seguinte formato exato com suporte multilíngue (pt-br, en, es, id):
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

async function run() {
    try {
        console.log("Consultando modelos disponíveis na Google AI para esta chave...");
        let selectedModel = "gemini-2.0-flash";

        try {
            const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const listData = await listRes.json();
            if (listData.models && Array.isArray(listData.models)) {
                console.log("Modelos disponíveis para sua chave:", listData.models.map(m => m.name.replace("models/", "")).join(", "));
                const found = listData.models.find(m => 
                    m.supportedGenerationMethods?.includes("generateContent") && 
                    m.name.includes("flash")
                );
                if (found) {
                    selectedModel = found.name.replace("models/", "");
                }
            } else if (listData.error) {
                console.error("Erro da Google ao listar modelos:", listData.error);
            }
        } catch (e) {
            console.warn("Não foi possível listar modelos dinamicamente, usando fallback:", e.message);
        }

        console.log(`Usando modelo ativo: ${selectedModel}`);
        const model = genAI.getGenerativeModel({
            model: selectedModel,
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const result = await model.generateContent(PROMPT);
        let text = result.response.text().trim();

        if (text.startsWith('```json')) text = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
        else if (text.startsWith('```')) text = text.replace(/^```\s*/, '').replace(/```$/, '').trim();

        const data = JSON.parse(text);
        const outputPath = path.resolve('volcano-status.json');
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Sucesso! Arquivo volcano-status.json atualizado com ${Object.keys(data.volcanoes || {}).length} vulcões.`);
    } catch (err) {
        console.error("Falha ao atualizar status dos vulcões:", err);
        process.exit(1);
    }
}

run();
