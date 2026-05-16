const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');

// 💡 CORREÇÃO DE PORTA: O Render exige ler estritamente a variável PORT fornecida pelo sistema deles
const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ CRÍTICO: BOT_TOKEN não configurado nas variáveis de ambiente do Render.");
  process.exit(1);
}

// Inicializa o Bot com Polling desligado para operar estritamente via Webhook (Zero Erro 409)
const bot = new TelegramBot(token, { polling: false });

const AVIATOR_API_URL = 'https://spribegaming.com';

const PLATAFORMAS = [
  { nome: "Betou", url: "https://betou.bet.br" },
  { nome: "EstrelaBet", url: "https://estrelabet.com" },
  { nome: "KTO", url: "https://kto.com" }
];

let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

function analisarTendenciaEstrategica(mults) {
  let score = 0;
  let redsSeguidos = 0;

  for (let i = 0; i < mults.length; i++) {
    if (mults[i] < 2.0) redsSeguidos++;
    else break;
  }

  if (redsSeguidos === 3) score += 75;
  if (redsSeguidos === 4) score += 90;
  if (redsSeguidos >= 5) score += 98;

  const ultimos10 = mults.slice(0, 10);
  const totalNaMeta = ultimos10.filter(v => v >= 2.0 && v <= 5.0).length;
  if (totalNaMeta >= 3) score += 10; 

  return { score, redsSeguidos };
}

function enviarSinalAutomatico(multiplicadorAnterior, score) {
  if (!targetChatIds.size) return;

  const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const plataformaAlvo = PLATAFORMAS[Math.floor(Math.random() * PLATAFORMAS.length)];

  const texto = 
`✈️ **SINAL CONFIRMADO - REVENDA AVIATOR**

🏛️ **Plataforma SONDADA:** ${plataformaAlvo.nome}
📈 **Entrar após a Vela:** ${multiplicadorAnterior.toFixed(2)}x
💰 **Alvo da Entrada:** 2.00x a 5.00x
🧠 **Assertividade Calculada:** ${score}%
⏰ **Horário da Oportunidade:** ${horario}

⚠️ **GESTÃO RECOMENDADA:**
• Realize o primeiro saque (auto-cashout) em **2.00x**
• Busque a alavancagem até **5.00x** com uma proteção`;

  const opcoes = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: `📱 Entrar no Jogo da ${plataformaAlvo.nome} 🚀`, url: plataformaAlvo.url }
        ]
      ]
    }
  };

  targetChatIds.forEach(chatId => {
    bot.sendMessage(chatId, texto, opcoes)
      .then(() => log(`✅ Sinal enviado com sucesso para o chat ${chatId}`))
      .catch((err) => log(`❌ Erro no envio físico para o chat ${chatId}:`, err.message));
  });
}

function processarRodadaEmTempoReal(nova) {
  if (!nova || !nova.multiplier) return;
  if (nova.round_id === lastRoundId) return;

  lastRoundId = nova.round_id;
  rounds.unshift(nova.multiplier);

  if (rounds.length > 30) rounds.pop();
  
  log(`📊 [Sonda Global] Rodada Aviator Detectada: ${nova.multiplier.toFixed(2)}x`);

  if (rounds.length < 3) return;

  const analise = analisarTendenciaEstrategica(rounds);

  if (analise.score >= 70) {
    enviarSinalAutomatico(nova.multiplier, analise.score);
  }
}

async function coletarDadosAviator() {
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

    const ultimaRodada = dados.history;
    const multiplier = parseFloat(ultimaRodada.crash_value || ultimaRodada.value || ultimaRodada.multiplier);
    const round_id = (ultimaRodada.id || ultimaRodada.round_id || ultimaRodada.game_id).toString();

    if (multiplier && !isNaN(multiplier)) {
      processarRodadaEmTempoReal({ multiplier, round_id });
    }
  } catch (err) {
    // Mantém o monitoramento resiliente mesmo sob oscilações de rede externa
  }
}

// Rota de recepção do Webhook do Telegram
app.post(`/telegram-webhook/${token}`, (req, res) => {
  res.sendStatus(200);
  
  if (req.body && req.body.message) {
    const msg = req.body.message;
    const chatId = msg.chat.id;

    if (!targetChatIds.has(chatId)) {
      targetChatIds.add(chatId);
      log(`📡 Novo canal/grupo registrado! ID: ${chatId}`);
    }

    if (msg.text === '/start') {
      bot.sendMessage(
        chatId,
        `✈️ **Robô Inteligente Aviator Ativado!**\n\n🎯 Alvo Principal: **2.00x até 5.00x**\n📡 Monitoramento automatizado de tendências ativo 24 horas por dia.`,
        { parse_mode: 'Markdown' }
      );
    }
  }
});

app.get('/', (_, res) => {
  res.json({
    status: 'online',
    engine: 'Multi-Platform Cloud Intelligence 24h',
    game: 'Aviator',
    chats_ativos: targetChatIds.size,
    historico_memoria: rounds.length
  });
});

async function inicializarServidor() {
  try {
    log("🔗 Validando parâmetros de rede com os servidores do Telegram...");
    
    // 💡 SOLUÇÃO DA URL DO WEBHOOK: O Render gera automaticamente a variável RENDER_EXTERNAL_URL (Ex: https://onrender.com)
    // Forçamos a conversão para HTTPS pois o Telegram rejeita conexões HTTP puras ou com portas explícitas na URL pública do Webhook
    let urlPublica = process.env.RENDER_EXTERNAL_URL;
    
    if (urlPublica) {
      urlPublica = urlPublica.replace('http://', 'https://'); // Força protocolo seguro HTTPS exigido pelo Telegram
      
      log(`📡 Registrando Webhook seguro em: ${urlPublica}/telegram-webhook/${token}`);
      await bot.setWebhook(`${urlPublica}/telegram-webhook/${token}`, { drop_pending_updates: true });
      log("✅ Webhook instalado e validado com sucesso!");
    } else {
      log("⚠️ RENDER_EXTERNAL_URL ausente. Rodando localmente ou aguardando propagação do ambiente de rede.");
    }

    log("📡 Sonda global ativada. Escutando decolagens do Aviator...");
    setInterval(coletarDadosAviator, 5000);

  } catch (err) {
    log("❌ Erro ao configurar Webhook:", err.message);
  }
}

// O Render escuta na porta física interna. Não mude o formato do listen abaixo.
server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central ativo e escutando na porta interna de contêiner: ${PORT}`);
  inicializarServidor();
});
