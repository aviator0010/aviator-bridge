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

// =====================================
// TELEGRAM
// =====================================

const token = process.env.BOT_TOKEN;

let bot = null;

if (token) {
  bot = new TelegramBot(token, { polling: false });
  console.log('🤖 Telegram iniciado.');
} else {
  console.log('❌ BOT_TOKEN não encontrado.');
}

// =====================================
// DADOS GLOBAIS
// =====================================

let targetChatIds = new Set();

let rtcRounds = [];
let lastRoundId = '';

let activeSocket = null;
let activeEndpoint = null;

let reconnectTimeout = null;

// =====================================
// ENDPOINTS
// =====================================

const ENDPOINTS = [
  'wss://betou.bet.br/socket.io/?EIO=4&transport=websocket',
  'wss://betou.bet.br/ws',
  'wss://betou.bet.br/websocket',
  'wss://betou.bet.br/socket/websocket',
  'wss://betou.bet.br/graphql',
  'wss://betou.bet.br/games',
  'wss://betou.bet.br/crash',
  'wss://betou.bet.br/ws/games/crash'
];

// =====================================
// TELEGRAM
// =====================================

function processarMensagemTelegram(msg) {

  if (!msg || !msg.chat) return;

  const chatId = msg.chat.id;
  const texto = msg.text || '';

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);

    console.log(`📡 Novo chat registrado: ${chatId}`);
  }

  if (texto === '/start') {

    bot.sendMessage(
      chatId,
`🚀 *ROBÔ BETOU TEMPO REAL*

✅ Sistema Online
✅ Scanner Inteligente
✅ Reconexão Automática
✅ Leitura em Tempo Real
✅ Filtro Anti-Red
✅ Alvos somente acima de 2.00x

📡 Endpoint:
${activeEndpoint || 'Procurando...'}`,
      {
        parse_mode: 'Markdown'
      }
    ).catch(() => {});
  }

  if (texto === '/status') {

    bot.sendMessage(
      chatId,
`📊 *STATUS*

🔌 Endpoint:
${activeEndpoint || 'Nenhum'}

📈 Rodadas:
${rtcRounds.length}

👥 Chats:
${targetChatIds.size}`,
      {
        parse_mode: 'Markdown'
      }
    ).catch(() => {});
  }
}

// =====================================
// EXTRAÇÃO DE MULTIPLICADOR
// =====================================

function extrairMultiplicador(obj) {

  if (!obj) return null;

  const campos = [
    'multiplier',
    'crash_point',
    'value',
    'crash',
    'coef',
    'coeficiente',
    'payout'
  ];

  for (const campo of campos) {

    if (obj[campo] !== undefined) {

      const n = parseFloat(obj[campo]);

      if (!isNaN(n) && n >= 1) {
        return n;
      }
    }
  }

  return null;
}

// =====================================
// PROCESSAMENTO DE RODADA
// =====================================

function processarRodada(multiplier, roundId) {

  if (!multiplier) return;

  if (roundId === lastRoundId) return;

  lastRoundId = roundId;

  rtcRounds.unshift({
    multiplier,
    roundId,
    time: Date.now()
  });

  if (rtcRounds.length > 50) {
    rtcRounds.pop();
  }

  console.log(`📊 ${roundId} => ${multiplier}x`);

  analisarSinais();
}

// =====================================
// ANÁLISE
// =====================================

function analisarSinais() {

  if (rtcRounds.length < 6) return;

  const mults = rtcRounds.map(r => r.multiplier);

  let baixasSeguidas = 0;

  for (let i = 0; i < mults.length; i++) {

    if (mults[i] < 2) {
      baixasSeguidas++;
    } else {
      break;
    }
  }

  const ultimas10 = mults.slice(0, 10);

  const reds = ultimas10.filter(v => v < 2).length;

  const verdesFortes = ultimas10.filter(v => v >= 10).length;

  const mercadoPerigoso = reds >= 7;

  const mercadoEsticado = verdesFortes >= 2;

  let sinal = null;

  // =====================================
  // GATILHO 1
  // =====================================

  if (
    baixasSeguidas === 3 &&
    !mercadoPerigoso &&
    !mercadoEsticado
  ) {

    sinal = {
      tipo: '🎯 ENTRADA CONFIRMADA',
      alvo: '2.00x',
      leitura: 'Recuperação de tendência detectada'
    };
  }

  // =====================================
  // GATILHO 2
  // =====================================

  else if (
    mults[0] >= 2 &&
    mults[1] < 2 &&
    mults[2] >= 2 &&
    !mercadoPerigoso
  ) {

    sinal = {
      tipo: '⚡ PADRÃO INTERCALADO',
      alvo: '2.00x',
      leitura: 'Mercado alternando comportamento'
    };
  }

  // =====================================
  // GATILHO 3
  // =====================================

  else if (
    baixasSeguidas >= 4 &&
    reds <= 6
  ) {

    sinal = {
      tipo: '🔥 POSSÍVEL EXPLOSÃO',
      alvo: '2.20x',
      leitura: 'Mercado pressionado após sequência baixa'
    };
  }

  // =====================================
  // GATILHO 4
  // =====================================

  else if (
    mults[0] < 2 &&
    mults[1] < 2 &&
    mults[2] >= 2 &&
    mults[3] >= 2 &&
    !mercadoPerigoso
  ) {

    sinal = {
      tipo: '📈 ESTABILIZAÇÃO DETECTADA',
      alvo: '2.00x',
      leitura: 'Fluxo estabilizando acima de 2x'
    };
  }

  if (!sinal) return;

  enviarSinalTelegram(sinal);
}

// =====================================
// ENVIO TELEGRAM
// =====================================

function enviarSinalTelegram(sinal) {

  if (!bot) return;

  if (targetChatIds.size <= 0) return;

  const horario = new Date().toLocaleTimeString('pt-BR');

  const ultima = rtcRounds[0];

  const texto =
`${sinal.tipo}

🎰 Jogo: *Betou Crash*

📈 Última vela:
${ultima.multiplier}x

🎯 Alvo:
${sinal.alvo}

🧠 Leitura:
${sinal.leitura}

⏰ Horário:
${horario}

📡 Endpoint:
${activeEndpoint || 'desconhecido'}
`;

  targetChatIds.forEach(chatId => {

    bot.sendMessage(chatId, texto, {
      parse_mode: 'Markdown'
    }).catch(() => {});
  });
}

// =====================================
// TENTATIVA DE CONEXÃO
// =====================================

function tentarConexao(endpointIndex = 0) {

  if (endpointIndex >= ENDPOINTS.length) {

    console.log('❌ Nenhum endpoint respondeu.');

    setTimeout(() => {
      tentarConexao(0);
    }, 15000);

    return;
  }

  const endpoint = ENDPOINTS[endpointIndex];

  console.log(`🔍 Testando endpoint: ${endpoint}`);

  let ws;

  try {

    ws = new WebSocket(endpoint);

  } catch (e) {

    console.log(`❌ Erro ao criar socket: ${endpoint}`);

    return tentarConexao(endpointIndex + 1);
  }

  let encontrouFluxo = false;

  ws.on('open', () => {

    console.log(`✅ Conectado em: ${endpoint}`);

    try {

      ws.send(JSON.stringify({
        type: 'ping'
      }));

    } catch (e) {}
  });

  ws.on('message', raw => {

    const texto = raw.toString();

    console.log(`📩 RAW: ${texto.substring(0, 300)}`);

    try {

      // SOCKET.IO
      if (texto.startsWith('42')) {

        const limpo = texto.slice(2);

        const parsed = JSON.parse(limpo);

        if (Array.isArray(parsed)) {

          const data = parsed[1];

          const mult = extrairMultiplicador(data);

          if (mult) {

            encontrouFluxo = true;

            activeSocket = ws;
            activeEndpoint = endpoint;

            processarRodada(
              mult,
              String(data.round_id || data.id || Date.now())
            );
          }
        }

        return;
      }

      // JSON NORMAL
      const parsed = JSON.parse(texto);

      const mult = extrairMultiplicador(parsed);

      if (mult) {

        encontrouFluxo = true;

        activeSocket = ws;
        activeEndpoint = endpoint;

        processarRodada(
          mult,
          String(parsed.round_id || parsed.id || Date.now())
        );
      }

      // ARRAY DE HISTÓRICO
      if (Array.isArray(parsed)) {

        parsed.forEach(item => {

          const m = extrairMultiplicador(item);

          if (m) {

            encontrouFluxo = true;

            processarRodada(
              m,
              String(item.round_id || item.id || Date.now())
            );
          }
        });
      }

    } catch (e) {}
  });

  ws.on('error', () => {

    console.log(`❌ Falha: ${endpoint}`);
  });

  ws.on('close', () => {

    console.log(`🔒 Fechado: ${endpoint}`);

    if (activeEndpoint === endpoint) {

      activeEndpoint = null;

      clearTimeout(reconnectTimeout);

      reconnectTimeout = setTimeout(() => {
        tentarConexao(0);
      }, 5000);
    }
  });

  setTimeout(() => {

    if (!encontrouFluxo && activeEndpoint !== endpoint) {

      try {
        ws.terminate();
      } catch (e) {}

      tentarConexao(endpointIndex + 1);
    }

  }, 12000);
}

// =====================================
// WEBHOOK TELEGRAM
// =====================================

app.post('/telegram-webhook', (req, res) => {

  res.sendStatus(200);

  if (req.body && req.body.message) {
    processarMensagemTelegram(req.body.message);
  }
});

// =====================================
// STATUS
// =====================================

app.get('/', (_, res) => {

  res.json({
    status: 'online',
    endpoint: activeEndpoint,
    rounds: rtcRounds.length,
    chats: targetChatIds.size
  });
});

// =====================================
// START
// =====================================

server.listen(PORT, '0.0.0.0', () => {

  console.log(`🚀 Servidor iniciado na porta ${PORT}`);

  tentarConexao(0);
});
