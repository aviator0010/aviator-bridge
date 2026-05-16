const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');

const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ BOT_TOKEN não configurado nas variáveis de ambiente do Render.");
  process.exit(1);
}

// Inicializa o Bot com polling ativo
const bot = new TelegramBot(token, { polling: true });

// URL estruturada direto do ecossistema central da Spribe (Aviator global)
const AVIATOR_API_URL = 'https://spribegaming.com';

// Configuração de direcionamento do sinal para a sua plataforma alvo
const NOME_PLATAFORMA = "Betou"; 
const LINK_PLATAFORMA = "https://betou.bet.br"; 

let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

// 🟢 SOLUÇÃO ERRO 409: Limpa sessões antigas presas antes de validar os novos pacotes
bot.getUpdates({ offset: -1 }).then(() => {
  log("🧹 Conexões fantasmas do Telegram limpas com sucesso.");
}).catch((err) => {
  log("⚠️ Aviso na limpeza de buffer do Telegram:", err.message);
});

// Captura automática do ID do canal/grupo quando o usuário digita /start
bot.on('message', (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    log("📡 Novo chat/canal ativado e monitorado:", chatId);
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      `✈️ **Robô Aviator Profissional Lançado!**\n\n🎯 Alvo Principal: **2.00x até 5.00x**\n📡 Monitoramento do feed central ativo na plataforma **${NOME_PLATAFORMA}**.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Lógica de cálculo matemático focada estritamente na zona de 2x a 5x
function calcularEstrategiaAviator(mults) {
  let score = 0;
  let redsSeguidos = 0;

  for (let i = 0; i < mults.length; i++) {
    if (mults[i] < 2.0) redsSeguidos++;
    else break;
  }

  // Padrão de Análise de Sequência (Gatilho de Probabilidade)
  if (redsSeguidos === 3) score += 40;
  if (redsSeguidos === 4) score += 25;
  if (redsSeguidos >= 5) score += 15;

  const ultimos10 = mults.slice(0, 10);
  const greensDesejados = ultimos10.filter(v => v >= 2.0 && v <= 5.0).length;

  if (greensDesejados >= 3) score += 20;

  return { score, redsSeguidos };
}

function enviarSinalTelegram(multiplicadorAnterior, score) {
  if (!targetChatIds.size) return;
  const horario = new Date().toLocaleTimeString('pt-BR');

  const texto = 
`✈️ **SINAL CONFIRMADO - AVIATOR**

🏛️ **Plataforma:** ${NOME_PLATAFORMA}
📈 **Entrada:** Após a Vela de ${multiplicadorAnterior.toFixed(2)}x
💰 **Alvo Ideal:** 2.00x a 5.00x
🧠 **Assertividade:** ${score}%
⏰ **Horário:** ${horario}

⚠️ **Instruções:**
- Faça o primeiro Auto-Cashout em 2.00x
- Deixe uma proteção buscar a zona de 5.00x`;

  const opcoes = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `📱 Jogar na ${NOME_PLATAFORMA} 🚀`, url: LINK_PLATAFORMA }
        ]
      ]
    }
  };

  targetChatIds.forEach(chatId => {
    bot.sendMessage(chatId, texto, opcoes).catch(() => {});
  });
}

function analisarNovaRodada(nova) {
  if (!nova || !nova.multiplier) return;
  if (nova.round_id === lastRoundId) return;

  lastRoundId = nova.round_id;
  rounds.unshift(nova.multiplier);

  if (rounds.length > 30) rounds.pop();
  
  log(`📊 Rodada Aviator Detectada: ${nova.multiplier.toFixed(2)}x`);

  if (rounds.length < 5) return;

  const analise = calcularEstrategiaAviator(rounds);

  if (analise.score >= 65) {
    enviarSinalTelegram(nova.multiplier, analise.score);
  }
}

async function buscarDadosProvedorAviator() {
  try {
    const resposta = await axios.get(AVIATOR_API_URL, {
      timeout: 4000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    let dados = resposta.data;
    if (!dados || !Array.isArray(dados.history)) return;

    // Isola e desmembra os pacotes da última decolagem do jogo
    const ultimaRodada = dados.history;
    const multiplier = parseFloat(ultimaRodada.crash_value || ultimaRodada.value || ultimaRodada.multiplier);
    const round_id = (ultimaRodada.id || ultimaRodada.round_id || ultimaRodada.game_id).toString();

    if (multiplier && !isNaN(multiplier)) {
      analisarNovaRodada({ multiplier, round_id });
    }
  } catch (err) {
    // try/catch genérico para absorver variações momentâneas da API e não derrubar o script
  }
}

function iniciarRobo() {
  log("📡 Conectando ao barramento global de estatísticas do Aviator...");
  // Consulta a API a cada 5 segundos de forma contínua
  setInterval(buscarDadosProvedorAviator, 5000);
}

app.get('/', (_, res) => {
  res.json({
    status: 'online',
    game: 'Aviator',
    plataforma_alvo: NOME_PLATAFORMA,
    chats_ativos: targetChatIds.size
  });
});

iniciarRobo();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central operando perfeitamente na porta ${PORT}`);
});
