const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const { io } = require('socket.io-client');
const http = require('http');

const PORT = process.env.PORT || 8080;

const app = reportService = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ BOT_TOKEN não configurado.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

// URL limpa da plataforma para conexão direta com o barramento do socket
const BASE_URL = 'https://betou.bet.br';

let currentSocket = null;
let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;

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

function extrairMultiplicador(dados) {
  if (!dados) return null;
  try {
    let payload = dados;
    
    // Desembrulha arrays comuns enviados pelo Socket.io
    if (Array.isArray(dados)) {
      payload = dados.find(item => typeof item === 'object') || dados[1] || dados[0];
    }

    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }

    let multiplier = payload.multiplier || payload.crash_point || payload.value || payload.coef || payload.result;
    
    if (payload.data) {
      multiplier = multiplier || payload.data.multiplier || payload.data.crash_point || payload.data.value || payload.data.coef;
    }

    multiplier = parseFloat(multiplier);
    if (!multiplier || isNaN(multiplier)) return null;

    return {
      multiplier,
      round_id: payload.round_id || payload.id || payload.round || Date.now().toString()
    };
  } catch (err) {
    return null;
  }
}

function iniciarSocket() {
  log("🔌 Conectando ao barramento Socket.io...");

  // Passa headers idênticos aos de um navegador para burlar o bloqueio inicial do Render
  currentSocket = io(BASE_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    secure: true,
    rejectUnauthorized: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 4000,
    extraHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': BASE_URL,
      'Referer': BASE_URL + '/'
    }
  });

  currentSocket.on('connect', () => {
    log("✅ Conectado com sucesso à Betou!");
    
    // Envia comandos de escuta caso a sala do crash exija registro prévio
    currentSocket.emit('join', { room: 'crash' });
    currentSocket.emit('subscribe', 'crash');
  });

  // Captura absolutamente qualquer evento transmitido pelo servidor da casa de apostas
  currentSocket.onAny((evento, dados) => {
    if (['connect', 'disconnect', 'connect_error', 'error'].includes(evento)) return;

    const resultado = extrairMultiplicador(dados);
    if (resultado) {
      log(`📊 Rodada capturada [Canal: ${evento}]:`, resultado.multiplier);
      analisarRodada(resultado);
    }
  });

  currentSocket.on('connect_error', (err) => {
    log("⚠️ Tentando transpor bloqueio de porta física... Erro atual:", err.message);
  });

  currentSocket.on('disconnect', (motivo) => {
    log("🔄 Conexão interrompida pelo servidor. Motivo:", motivo);
  });
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
    chats: targetChatIds.size,
    rounds: rounds.length
  });
});

iniciarSocket();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central operando na porta ${PORT}`);
});
