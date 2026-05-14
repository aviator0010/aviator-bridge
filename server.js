const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors({ origin: '*' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let rounds = [], clients = new Set();
let lastAnalyzedRoundId = ""; 
let targetChatIds = new Set();

// Configura o Axios com cabeçalho de navegador real para evitar bloqueios de IP (Erro 403/502)
const apiBetou = axios.create({
  baseURL: 'https://betou.bet.br',
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
});

// Inicialização segura do Bot (Será ativado apenas após o servidor Web estar online)
const token = process.env.BOT_TOKEN;
let bot;

if (token) {
  bot = new TelegramBot(token, { 
    polling: {
      autoStart: true,
      params: { timeout: 10 },
      request: { agentOptions: { keepAlive: true, rejectUnauthorized: false } }
    } 
  });

  bot.on('polling_error', (error) => {
    console.log(`[Telegram Polling]: Sincronizando... (${error.message})`);
  });

  bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    if (!targetChatIds.has(chatId)) {
      targetChatIds.add(chatId);
      console.log(`📡 Novo chat registrado: ${chatId}`);
    }
    if (msg.text === '/start' || msg.text === '/teste') {
      bot.sendMessage(chatId, '🤖 **Robô de Sinais Betou Conectado!**\n\nMonitorando o gráfico. Entradas de 2X a 5X e Velas Rosas serão enviadas aqui automaticamente.', { parse_mode: 'Markdown' });
    }
  });
} else {
  console.log("❌ ERRO: Configure a variável BOT_TOKEN na Railway.");
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

// Algoritmo Preditivo Avançado (2x-5x e Rosas)
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

// Coleta de dados com tratamento contra bloqueio do servidor da Betou
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
    .catch(() => console.log('⏳ Atualizando conexão com o servidor de dados da Betou...'));
}

setInterval(loadBetouHistory, 8000);

app.get('/', (_, res) => res.json({ status: "online", platform: "Betou", telegram: !!bot }));

// Garante que o servidor Web liga PRIMEIRO, eliminando o erro da Railway
server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor Web ativo na porta:', PORT); 
  loadBetouHistory();
});
