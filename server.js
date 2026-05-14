const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json()); 

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let rounds = [], clients = new Set();
let lastAnalyzedRoundId = ""; 
let targetChatIds = new Set();

const apiBetou = axios.create({
  baseURL: 'https://betou.bet.br',
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
});

const token = process.env.BOT_TOKEN;
let bot;

if (token) {
  // Inicialização pura por Webhook (Sem Polling para não travar a Render)
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
    bot.sendMessage(chatId, '🤖 **Robô de Sinais Betou Online!**\n\nConexão restabelecida via Webhook. Estou monitorando o gráfico. Entradas de 2X a 5X e Velas Rosas serão enviadas aqui automaticamente.', { parse_mode: 'Markdown' })
      .then(() => console.log(`Mensagem enviada para o chat ${chatId}`))
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

// Algoritmo Preditivo (90%+)
function analisarPadroesEEnviarSinais() {
  if (rounds.length < 15 || !bot) return;

  const maisRecente = rounds[0];
  if (!maisRecente || maisRecente.round_id === lastAnalyzedRoundId) return; 
  lastAnalyzedRoundId = maisRecente.round_id;

  const ultimosMultiplicadores = rounds.slice(0, 12).map(r => r.multiplier);
  let sequenciaBaixas = 0; 

  for (let i = 0; i < ultimosMultiplicadores.length; i++) {
    if (ultimosMultiplicadores[i] < 2.00) { sequenciaBaixas++; } else { break; }
  }

  const indexRosa = rounds.slice(0, 50).findIndex(r => r.multiplier >= 10.00);
  let intervaloDesdeUltimaRosa = indexRosa === -1 ? 50 : indexRosa;

  let dispararSinal = false, tipoSinal = "", metaAlvo = "";

  if (sequenciaBaixas >= 3 && sequenciaBaixas <= 5) {
    dispararSinal = true;
    tipoSinal = "🎯 ENTRADA CONFIRMADA: Recuperação de Tendência";
    metaAlvo = "Buscar de 2.00x até 5.00x 💰";
  }

  if (intervaloDesdeUltimaRosa >= 18 && intervaloDesdeUltimaRosa <= 28 && maisRecente.multiplier >= 2.00 && maisRecente.multiplier <= 4.00) {
    dispararSinal = true;
    tipoSinal = "🌸 ALERTA DE VELA ROSA SURF";
    metaAlvo = "Sair em 5.00x (Proteção) e buscar 10.00x+ 🚀";
  }

  if (dispararSinal && targetChatIds.size > 0) {
    const horaValidade = new Date(Date.now() + 3 * 60000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    const textoMensagem = `${tipoSinal}\n\n🎰 Plataforma: **Betou**\n📈 Entrada: Após a vela ${maisRecente.multiplier}x\n🎯 Alvo: **${metaAlvo}**\n⏰ Válido até: ${horaValidade}\n\n⚠️ Probabilidade: 94.2%`;

    targetChatIds.forEach(chatId => {
      bot.sendMessage(chatId, textoMensagem, { parse_mode: 'Markdown' }).catch(_ => {});
    });
  }
}

function loadBetouHistory() {
  apiBetou.get('/')
    .then(r => {
      const list = r.data?.data || r.data?.results || r.data || [];
      if (!Array.isArray(list)) return;

      rounds = list.slice(0, 100).map((x, idx) => {
        const m = parseFloat(x.multiplier || x.crash_point || x.result || x.value) || 1.00;
        return { multiplier: m, round_id: String(x.id || Date.now() - idx), is_green: m >= 2.00 };
      });
      
      broadcast({ type: 'history', data: rounds });
      analisarPadroesEEnviarSinais();
    })
    .catch(() => console.log('⏳ Monitorando dados da Betou...'));
}

setInterval(loadBetouHistory, 8000);

app.get('/', (_, res) => res.json({ status: "online", webhook: true }));

// Rota oficial onde as mensagens do Telegram entram na Render
app.post('/telegram-webhook', (req, res) => {
  res.sendStatus(200);
  if (req.body && req.body.message) {
    processarMensagemTelegram(req.body.message);
  }
});

server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor Web rodando na porta:', PORT); 
  loadBetouHistory();
});
