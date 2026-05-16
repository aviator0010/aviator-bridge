const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws'); // Mantido o 'ws' que já estava instalado no seu projeto
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

// URL estruturada para o formato correto que o Socket.io do site espera receber
const SOCKET_URL = 'wss://betou.bet.br/socket.io/?EIO=4&transport=websocket';

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

function extrairMultiplicador(textoLimpo) {
  try {
    // Tenta capturar qualquer estrutura JSON válida dentro da mensagem do Socket.io
    const jsonMatch = textoLimpo.match(/[\{\[].*[\}\]]/);
    if (!jsonMatch) return null;

    const obj = JSON.parse(jsonMatch[0]);
    
    // Se for um array (padrão do Socket.io eventos: ["nome_evento", dados])
    let dados = Array.isArray(obj) ? obj[1] : obj;
    if (!dados) return null;

    let multiplier = dados.multiplier || dados.crash_point || dados.value || dados.coef || dados.result;
    
    if (dados.data) {
      multiplier = multiplier || dados.data.multiplier || dados.data.crash_point || dados.data.value;
    }

    multiplier = parseFloat(multiplier);
    if (!multiplier || isNaN(multiplier)) return null;

    return {
      multiplier,
      round_id: dados.round_id || dados.id || dados.round || Date.now().toString()
    };
  } catch {
    return null;
  }
}

function iniciarSocket() {
  log("🔌 Tentando conectar ao barramento seguro:", SOCKET_URL);

  // Criando a conexão WS nativa injetando Headers de simulação de navegador web real
  currentSocket = new WebSocket(SOCKET_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Origin': 'https://betou.bet.br',
      'Referer': 'https://betou.bet.br'
    }
  });

  let pingInterval = null;

  currentSocket.on('open', () => {
    log("✅ Conectado com sucesso ao site!");
    reconnectDelay = 5000;

    // Protocolo Socket.io: Envia o código "2" periodimanete para manter a sessão ativa
    pingInterval = setInterval(() => {
      try {
        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.send('2'); 
        }
      } catch {}
    }, 25000);
  });

  currentSocket.on('message', raw => {
    const texto = raw.toString();

    // Protocolo Socket.io: Se receber "3", responde com o ping de volta
    if (texto === '3') {
      currentSocket.send('2');
      return;
    }

    const resultado = extrairMultiplicador(texto);
    if (resultado) {
      log("📊 Rodada em tempo real detectada:", resultado.multiplier);
      analisarRodada(resultado);
    }
  });

  currentSocket.on('error', err => {
    log("❌ Erro de conexão física no Socket. O servidor pode estar instável.");
  });

  currentSocket.on('close', () => {
    log("🔄 Conexão encerrada. Tentando reconectar...");
    if (pingInterval) clearInterval(pingInterval);

    setTimeout(() => {
      iniciarSocket();
    }, reconnectDelay);

    // Ajuste dinâmico de tempo de espera para evitar sobrecarga
    reconnectDelay = Math.min(reconnectDelay + 2000, 20000);
  });
}

wss.on('connection', ws => {
  ws.send(JSON.stringify({ status: 'online' }));
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
  log(`🚀 Servidor de monitoramento rodando na porta ${PORT}`);
});
