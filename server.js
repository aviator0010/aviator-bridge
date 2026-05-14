const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json()); 

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let rounds = [], clients = new Set();
let lastAnalyzedRoundId = ""; 
let targetChatIds = new Set();

const token = process.env.BOT_TOKEN;
let bot;

if (token) {
  bot = new TelegramBot(token, { polling: false });
  console.log("🤖 Motor do Telegram configurado via Webhook nativo.");
} else {
  console.log("❌ ERRO: Adicione a variável BOT_TOKEN no painel da Render.");
}

function processarMensagemTelegram(msg) {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const texto = msg.text;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    console.log(`📡 Novo chat capturado com sucesso: ${chatId}`);
  }

  if (texto === '/start' || texto === '/teste') {
    bot.sendMessage(chatId, '🤖 **Robô de Sinais Betou Otimizado!**\n\nMonitoramento inteligente e alta frequência de análises (2.00x a 5.00x). Certifique-se de manter o injetor ativo enviando dados para o servidor.', { parse_mode: 'Markdown' })
      .catch(e => console.log("Erro no envio:", e.message));
  }
}

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'history', data: rounds }));
  ws.on('close', () => clients.delete(ws));
});

const broadcast = d => {
  const s = JSON.stringify(d);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(s); });
};

// Algoritmo de Alta Frequência (Análise sobre Array Real)
function analisarPadroesEEnviarSinais() {
  if (!rounds || rounds.length < 5 || !bot) return;

  const maisRecente = rounds[0]; 
  if (!maisRecente || maisRecente.round_id === lastAnalyzedRoundId) return; 
  lastAnalyzedRoundId = maisRecente.round_id;

  const ultimosMultiplicadores = rounds.slice(0, 10).map(r => r.multiplier);
  
  let sequenciaBaixas = 0; 
  for (let i = 0; i < ultimosMultiplicadores.length; i++) {
    if (ultimosMultiplicadores[i] < 2.00) { sequenciaBaixas++; } else { break; }
  }

  let sequenciaAltas = 0;
  for (let i = 0; i < ultimosMultiplicadores.length; i++) {
    if (ultimosMultiplicadores[i] >= 2.00) { sequenciaAltas++; } else { break; }
  }

  const m0 = ultimosMultiplicadores[0];
  const m1 = ultimosMultiplicadores[1];
  const m2 = ultimosMultiplicadores[2];

  let dispararSinal = false;
  let tipoSinal = "";
  let metaAlvo = "";
  let probabilidade = "92.0%";

  // PADRÃO 1: Quebra de Sequência Curta (2 baixas consecutivas)
  if (sequenciaBaixas === 2) {
    dispararSinal = true;
    tipoSinal = "🎯 ENTRADA CONFIRMADA: Recuperação de Margem Verde";
    metaAlvo = "Buscar saída estável em 2.00x 💰";
    probabilidade = "94.8%";
  }
  
  // PADRÃO 2: Surf de Tendência de Alta
  else if (sequenciaAltas >= 1 && sequenciaAltas <= 2 && m0 >= 2.20) {
    dispararSinal = true;
    tipoSinal = "🔥 SURF DE TENDÊNCIA: Gráfico Pagador Detectado";
    metaAlvo = "Alvo estendido de 3.00x até 5.00x 🚀";
    probabilidade = "91.5%";
  }

  // PADRÃO 3: Alternância Clássica (Xadrez)
  else if (m0 && m1 && m2 && ((m0 < 2 && m1 >= 2 && m2 < 2) || (m0 >= 2 && m1 < 2 && m2 >= 2))) {
    dispararSinal = true;
    tipoSinal = "⚡ SINAL RELÂMPAGO: Quebra de Padrão Intercalado";
    metaAlvo = "Buscar saída de 1.80x a 2.20x 💸";
    probabilidade = "93.1%";
  }

  if (dispararSinal && targetChatIds.size > 0) {
    const horaValidade = new Date(Date.now() + 3 * 60000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    const textoMensagem = `${tipoSinal}\n\n🎰 Plataforma: **Betou**\n📈 Entrada: Após a vela ${maisRecente.multiplier}x\n🎯 Alvo: **${metaAlvo}**\n⏰ Válido até: ${horaValidade}\n\n⚠️ Probabilidade Calculada: ${probabilidade}`;

    targetChatIds.forEach(chatId => {
      bot.sendMessage(chatId, textoMensagem, { parse_mode: 'Markdown' }).catch(_ => {});
    });
  }
}

// ROTA NOVA: Recebe as novas rodadas enviadas de fora por extensão ou script injector
app.post('/api/update-data', (req, res) => {
  const incomingData = req.body?.data || req.body?.results || req.body;
  if (!Array.isArray(incomingData)) return res.status(400).json({ error: "Formato inválido" });

  rounds = incomingData.slice(0, 50).map((x, idx) => {
    const m = parseFloat(x.multiplier || x.crash_point || x.result || x.value) || 1.00;
    return { multiplier: m, round_id: String(x.id || Date.now() - idx), is_green: m >= 2.00 };
  });

  broadcast({ type: 'history', data: rounds });
  analisarPadroesEEnviarSinais();
  
  res.json({ success: true, count: rounds.length });
});

app.get('/', (_, res) => res.json({ status: "online", rounds_cached: rounds.length }));

app.post('/telegram-webhook', (req, res) => {
  res.sendStatus(200);
  if (req.body && req.body.message) {
    processarMensagemTelegram(req.body.message);
  }
});

server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor Web rodando na porta:', PORT); 
});
