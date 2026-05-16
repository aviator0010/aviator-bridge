const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const { io } = require('socket.io-client'); // Alterado para socket.io-client
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

// URL unificada do Socket.io do site alvo
const SOCKET_URL = 'wss://betou.bet.br'; 

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

// Filtra e normaliza os dados recebidos do evento do servidor
function processarDadosEvento(data) {
  try {
    if (!data) return null;
    
    // Procura propriedades comuns em payloads de cassino
    let multiplier = data.multiplier || data.crash_point || data.value || data.coef || data.result;
    
    if (data.data) {
      multiplier = multiplier || data.data.multiplier || data.data.crash_point || data.data.value;
    }

    multiplier = parseFloat(multiplier);
    if (!multiplier || isNaN(multiplier)) return null;

    return {
      multiplier,
      round_id: data.round_id || data.id || data.round || Date.now().toString()
    };
  } catch (err) {
    return null;
  }
}

function iniciarSocket() {
  log("🔌 Conectando ao barramento Socket.io...");

  // Configuração com headers simulando um navegador para evitar bloqueio automático
  currentSocket = io(SOCKET_URL, {
    path: '/socket.io/',
    transports: ['websocket'],
    forceNew: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 5000,
    extraHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://betou.bet.br',
      'Referer': 'https://betou.bet.br'
    }
  });

  currentSocket.on('connect', () => {
    log("✅ Conectado com sucesso via Socket.io!");
    
    // ALERTA: Muitas plataformas exigem que você envie um evento de "subscrição" ao conectar.
    // Se o robô conectar mas não receber mensagens, descomente a linha abaixo e ajuste o nome do evento.
    // currentSocket.emit('join', { room: 'crash' }); 
  });

  // Ouvinte genérico de eventos para capturar as rodadas independente do nome do evento do site
  currentSocket.onAny((evento, data) => {
    // Ignora eventos internos do socket.io
    if (['connect', 'disconnect', 'connect_error'].includes(evento)) return;

    const resultado = processarDadosEvento(data);
    if (resultado) {
      log(`📊 Rodada detectada [Evento: ${evento}]:`, resultado.multiplier);
      analisarRodada(resultado);
    }
  });

  currentSocket.on('connect_error', (err) => {
    log("❌ Erro na estrutura do socket:", err.message);
  });

  currentSocket.on('disconnect', (reason) => {
    log("🔄 Socket desconectado. Motivo:", reason);
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
  log(`🚀 Servidor proxy ativo na porta ${PORT}`);
});
