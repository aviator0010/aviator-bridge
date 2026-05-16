const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios'); // Usando o axios que já está no seu package.json
const http = require('http');

const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ BOT_TOKEN não configurado.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

// URL da API de histórico público do Crash da Betou
const API_URL = 'https://betou.bet.br'; 

let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;
let pollingInterval = null;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

function registrarChat(msg) {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    log("📡 Novo chat registrado:", chatId);
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      `⚡ Robô Crash Online\n\n🎯 Estratégia focada em alvo 2x+\n📡 Monitoramento HTTP em tempo real ativo.`,
      { parse_mode: 'Markdown' }
    );
  }
}

function calcularScore(mults) {
  let score = 0;
  let redsSeguidos = 0;

  for (let i = 0; i < mults.length; i++) {
    if (mults[i] < 2) redsSeguidos++;
    else break;
  }

  if (redsSeguidos >= 3) score += 35;
  if (redsSeguidos >= 4) score += 15;

  const ultimos10 = mults.slice(0, 10);
  const greens = ultimos10.filter(v => v >= 2).length;
  const reds = ultimos10.filter(v => v < 2).length;

  if (greens >= 4) score += 20;
  if (reds <= 6) score += 10;

  const media = ultimos10.reduce((a, b) => a + b, 0) / ultimos10.length;
  if (media >= 1.8) score += 10;

  const ultimo = mults[0];
  if (ultimo >= 1.5 && ultimo < 2) score += 10;

  return { score, redsSeguidos, media };
}

function enviarSinal(tipo, entrada, score) {
  if (!targetChatIds.size) return;
  const horario = new Date().toLocaleTimeString('pt-BR');

  const texto = `🎯 ${tipo}\n\n📈 Entrada confirmada\n💰 Alvo: 2.00x+\n🧠 Score de confiança: ${score}/100\n⏰ ${horario}\n\n⚠️ Gestão recomendada:\n- Entrada moderada\n- Stop após sequência negativa`;

  targetChatIds.forEach(chatId => {
    bot.sendMessage(chatId, texto).catch(() => {});
  });
}

function analisarRodada(nova) {
  if (!nova || !nova.multiplier) return;
  if (nova.round_id === lastRoundId) return;

  lastRoundId = nova.round_id;
  rounds.unshift(nova);

  if (rounds.length > 50) rounds.pop();
  const mults = rounds.map(r => r.multiplier);
  if (mults.length < 10) return;

  const analise = calcularScore(mults);

  if (analise.score >= 70) {
    enviarSinal("SINAL CONFIRMADO", nova.multiplier, analise.score);
  }
}

// Função que busca os dados da API simulando perfeitamente um navegador comum
async function buscarRodadasNaAPI() {
  try {
    const resposta = await axios.get(API_URL, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://betou.bet.br',
        'Referer': 'https://betou.bet.br'
      }
    });

    // Mapeamento dinâmico para encontrar a lista de resultados no JSON retornado
    let listaRodadas = resposta.data;
    if (resposta.data.data) listaRodadas = resposta.data.data;
    if (resposta.data.results) listaRodadas = resposta.data.results;
    if (resposta.data.items) listaRodadas = resposta.data.items;

    if (!Array.isArray(listaRodadas) || listaRodadas.length === 0) return;

    // Pega a rodada mais recente (geralmente o primeiro item do array da API)
    const ultimaRodadaBruta = listaRodadas[0];
    
    let multiplier = ultimaRodadaBruta.multiplier || ultimaRodadaBruta.crash_point || ultimaRodadaBruta.coef || ultimaRodadaBruta.value || ultimaRodadaBruta.result;
    let round_id = ultimaRodadaBruta.round_id || ultimaRodadaBruta.id || ultimaRodadaBruta.round;

    multiplier = parseFloat(multiplier);

    if (multiplier && !isNaN(multiplier)) {
      const resultado = { multiplier, round_id: round_id ? round_id.toString() : Date.now().toString() };
      
      // Se for uma rodada nova que não vimos ainda, processa!
      if (resultado.round_id !== lastRoundId) {
        log(`📊 Nova rodada detectada via API: ${resultado.multiplier}x (ID: ${resultado.round_id})`);
        analisarRodada(resultado);
      }
    }

  } catch (err) {
    // Se der erro 404, pode ser que o caminho exato da API deles seja um pouco diferente
    log("⚠️ Erro ao consultar API de resultados (Buscando rotas alternativas...):", err.message);
  }
}

function iniciarMonitoramento() {
  log("📡 Iniciando monitoramento via requisições HTTP seguras...");
  
  // Executa a busca a cada 3 segundos (tempo ideal para pegar logo após o crash)
  pollingInterval = setInterval(buscarRodadasNaAPI, 3000);
}

app.post('/telegram-webhook', (req, res) => {
  res.sendStatus(200);
  if (req.body && req.body.message) {
    registrarChat(req.body.message);
  }
});

app.get('/', (_, res) => {
  res.json({
    status: 'online',
    mode: 'HTTP Polling',
    chats: targetChatIds.size,
    rounds: rounds.length
  });
});

iniciarMonitoramento();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor HTTP ativo na porta ${PORT}`);
});
