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

const token = process.env.BOT_TOKEN;

if (!token) {
  console.log("❌ BOT_TOKEN não configurado.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

const SOCKETS = [
  'wss://betou.bet.br/ws/games/crash',
  'wss://betou.bet.br/socket.io/?EIO=4&transport=websocket',
  'wss://betou.bet.br/ws',
  'wss://betou.bet.br/websocket'
];

let socketIndex = 0;
let currentSocket = null;

let targetChatIds = new Set();

let rounds = [];
let lastRoundId = null;

let reconnectDelay = 5000;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

function registrarChat(msg) {
  if (!msg || !msg.chat) return;

  const chatId = msg.chat.id;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    log("📡 Novo chat:", chatId);
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      `⚡ Robô Crash Online\n\n🎯 Estratégia focada em alvo 2x+\n📡 Monitoramento em tempo real ativo.`,
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

  const media =
    ultimos10.reduce((a, b) => a + b, 0) / ultimos10.length;

  if (media >= 1.8) score += 10;

  const ultimo = mults[0];

  if (ultimo >= 1.5 && ultimo < 2) score += 10;

  return {
    score,
    redsSeguidos,
    media
  };
}

function enviarSinal(tipo, entrada, score) {
  if (!targetChatIds.size) return;

  const horario = new Date().toLocaleTimeString('pt-BR');

  const texto =
`🎯 ${tipo}

📈 Entrada confirmada
💰 Alvo: 2.00x+
🧠 Score de confiança: ${score}/100
⏰ ${horario}

⚠️ Gestão recomendada:
- Entrada moderada
- Stop após sequência negativa`;

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
    enviarSinal(
      "SINAL CONFIRMADO",
      nova.multiplier,
      analise.score
    );
  }
}

function extrairMultiplicador(data) {
  try {
    const obj = JSON.parse(data);

    let multiplier = null;

    multiplier =
      obj.multiplier ||
      obj.crash_point ||
      obj.value ||
      obj.coef ||
      obj.result;

    if (obj.data) {
      multiplier =
        multiplier ||
        obj.data.multiplier ||
        obj.data.crash_point ||
        obj.data.value ||
        obj.data.coef;
    }

    multiplier = parseFloat(multiplier);

    if (!multiplier || isNaN(multiplier)) return null;

    return {
      multiplier,
      round_id:
        obj.round_id ||
        obj.id ||
        obj.round ||
        Date.now().toString()
    };

  } catch {
    return null;
  }
}

function iniciarSocket() {

  const url = SOCKETS[socketIndex];

  log("🔌 Tentando conectar:", url);

  currentSocket = new WebSocket(url);

  let pingInterval = null;

  currentSocket.on('open', () => {

    log("✅ Conectado:", url);

    reconnectDelay = 5000;

    pingInterval = setInterval(() => {

      try {

        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.send('ping');
        }

      } catch {}

    }, 15000);

  });

  currentSocket.on('message', raw => {

    const texto = raw.toString();

    const resultado = extrairMultiplicador(texto);

    if (resultado) {
      log("📊 Rodada:", resultado.multiplier);
      analisarRodada(resultado);
    }

  });

  currentSocket.on('error', err => {
    log("❌ Erro socket");
  });

  currentSocket.on('close', () => {

    log("🔄 Socket fechado");

    if (pingInterval) clearInterval(pingInterval);

    socketIndex++;

    if (socketIndex >= SOCKETS.length) {
      socketIndex = 0;
    }

    setTimeout(() => {
      iniciarSocket();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay + 2000, 20000);

  });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({
    status: 'online'
  }));
});

app.post('/telegram-webhook', (req, res) => {

  res.sendStatus(200);

  if (req.body && req.body.message) {
    registrarChat(req.body.message);
  }

});

app.get('/', (_, res) => {

  res.json({
    status: 'online',
    chats: targetChatIds.size,
    rounds: rounds.length
  });

});

iniciarSocket();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor ativo na porta ${PORT}`);
});
