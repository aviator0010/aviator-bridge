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

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ BOT_TOKEN não configurado.");
  process.exit(1);
}

// Retornamos ao polling do Telegram para garantir autonomia completa do servidor
const bot = new TelegramBot(token, { polling: true });

// Lista de endpoints dos servidores centrais de iGaming mapeados
const ENDPOINTS_PROVEDOR = [
  'wss://api.betou.bet.br/socket.io/?EIO=4&transport=websocket',
  'wss://://salsatechnology.com',
  'wss://betou.bet.br/socket.io/?EIO=4&transport=websocket'
];

let endpointIndex = 0;
let currentSocket = null;
let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;
let reconnectDelay = 3000;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

bot.on('message', (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    log("📡 Novo chat registrado via Polling:", chatId);
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      `⚡ Robô Crash Online\n\n🎯 Estratégia focada em alvo 2x+\n📡 Monitoramento em tempo real ativo.`,
      { parse_mode: 'Markdown' }
    );
  }
});

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

  const ultimo = mults;
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

function extrairMultiplicador(rawText) {
  try {
    // Alvos de extração baseados nos padrões purificados de provedores de Crash
    const jsonMatch = rawText.match(/[\{\[].*[\}\]]/);
    if (!jsonMatch) return null;

    const obj = JSON.parse(jsonMatch);
    let payload = Array.isArray(obj) ? obj : obj;

    let multiplier = payload.multiplier || payload.crash_point || payload.value || payload.coef || payload.result;
    
    if (payload.data) {
      multiplier = multiplier || payload.data.multiplier || payload.data.crash_point || payload.data.value;
    }

    multiplier = parseFloat(multiplier);
    if (!multiplier || isNaN(multiplier)) return null;

    return {
      multiplier,
      round_id: payload.round_id || payload.id || payload.round || Date.now().toString()
    };
  } catch {
    return null;
  }
}

function conectarBarramentoProvedor() {
  const urlAtual = ENDPOINTS_PROVEDOR[endpointIndex];
  log("🔌 Conectando ao barramento central:", urlAtual);

  // Injeção de Handshake de iGaming para mascarar o servidor do Render como um nó de gateway legítimo
  currentSocket = new WebSocket(urlAtual, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Origin': 'https://betou.bet.br',
      'Referer': 'https://betou.bet.br',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
    }
  });

  let pingInterval = null;

  currentSocket.on('open', () => {
    log("✅ Integração com o barramento realizada com sucesso!");
    reconnectDelay = 3000;

    // Envia pacotes de Keep-Alive estruturados de 20 em 20 segundos
    pingInterval = setInterval(() => {
      try {
        if (currentSocket.readyState === WebSocket.OPEN) {
          // Protocolo híbrido Engine.io / WS nativo
          currentSocket.send('2'); 
          currentSocket.send(JSON.stringify({ type: 'ping' }));
        }
      } catch {}
    }, 20000);
  });

  currentSocket.on('message', data => {
    const texto = data.toString();

    // Tratamento imediato de Keep-Alive do provedor
    if (texto === '3') {
      currentSocket.send('2');
      return;
    }

    const resultado = extrairMultiplicador(texto);
    if (resultado) {
      log("📊 Rodada detectada em tempo real:", resultado.multiplier);
      analisarRodada(resultado);
    }
  });

  currentSocket.on('error', () => {
    // Silencia logs poluídos de rede e foca na alternância de rotas
  });

  currentSocket.on('close', () => {
    log("🔄 Conexão encerrada pelo barramento. Alternando rota de dados...");
    if (pingInterval) clearInterval(pingInterval);

    // Rotaciona os endpoints caso um caia ou seja bloqueado
    endpointIndex = (endpointIndex + 1) % ENDPOINTS_PROVEDOR.length;

    setTimeout(() => {
      conectarBarramentoProvedor();
    }, reconnectDelay);

    reconnectDelay = Math.min(reconnectDelay + 2000, 15000);
  });
}

app.get('/', (_, res) => {
  res.json({
    status: 'online',
    engine: 'iGaming Provider Bus Monitoring',
    chats_ativos: targetChatIds.size,
    rodadas_processadas: rounds.length
  });
});

conectarBarramentoProvedor();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central de inteligência ativo na porta ${PORT}`);
});
