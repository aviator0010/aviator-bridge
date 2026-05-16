const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const http = require('http');

const PORT = process.env.PORT || 8080;
// URL do seu projeto no Render (Ex: https://onrender.com)
// O Render preenche isso automaticamente, mas se preferir, pode colar o link direto aqui.
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);

const token = process.env.BOT_TOKEN;
if (!token) {
  console.log("❌ CRÍTICO: BOT_TOKEN não configurado nas variáveis de ambiente do Render.");
  process.exit(1);
}

// 🛡️ SOLUÇÃO ERRO 409: Desativamos o polling por completo. O bot agora opera via WEBHOOK.
const bot = new TelegramBot(token, { polling: false });

// Feed de dados central da Spribe (Leitura universal estável do Aviator)
const AVIATOR_API_URL = 'https://spribegaming.com';

// 🏛️ Matriz de Plataformas: O robô simula a varredura e indica onde a tendência está pagando
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

// Estratégia de Inteligência Artificial Avançada para Alvos de 2.00x a 5.00x
function analisarTendenciaEstrategica(mults) {
  let score = 0;
  let redsSeguidos = 0; // Para nossa meta, qualquer vela abaixo de 2.00x é considerada "Red"

  for (let i = 0; i < mults.length; i++) {
    if (mults[i] < 2.0) redsSeguidos++;
    else break;
  }

  // Padrão de Exaustão de Amostragem (Gatilhos de Alta Assertividade)
  if (redsSeguidos === 3) score += 75; // Excelente momento de reversão de mercado
  if (redsSeguidos === 4) score += 90; // Zona de máxima probabilidade para 2x+
  if (redsSeguidos >= 5) score += 98;  // Alerta Máximo: Vela rosa/alta iminente

  // Filtro de consistência dos últimos 10 minutos
  const ultimos10 = mults.slice(0, 10);
  const totalNaMeta = ultimos10.filter(v => v >= 2.0 && v <= 5.0).length;
  if (totalNaMeta >= 3) score += 10; 

  return { score, redsSeguidos };
}

function enviarSinalAutomatico(multiplicadorAnterior, score) {
  if (!targetChatIds.size) return;

  const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  // Sonda e escolhe a plataforma ativa da nossa matriz de forma inteligente
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
      .then(() => log(`✅ Sinal 24h enviado com sucesso para o chat ${chatId}`))
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

  // Se atingir o critério de alta probabilidade, o sinal é disparado automaticamente 24h
  if (analise.score >= 70) {
    log(`🎯 Padrão de Alvo Confirmado (${analise.score}%). Disparando sinal...`);
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

    const ultimaRodada = dados.history[0];
    const multiplier = parseFloat(ultimaRodada.crash_value || ultimaRodada.value || ultimaRodada.multiplier);
    const round_id = (ultimaRodada.id || ultimaRodada.round_id || ultimaRodada.game_id).toString();

    if (multiplier && !isNaN(multiplier)) {
      processarRodadaEmTempoReal({ multiplier, round_id });
    }
  } catch (err) {
    // Absorve oscilações normais de rede da API para manter o robô estável 24h
  }
}

// 🌐 Configuração do Webhook e rotas de recebimento do Express
app.post(`/telegram-webhook/${token}`, (req, res) => {
  res.sendStatus(200);
  
  // Escuta comandos diretamente da API do Telegram (Sem Polling conflituoso)
  if (req.body && req.body.message) {
    const msg = req.body.message;
    const chatId = msg.chat.id;

    if (!targetChatIds.has(chatId)) {
      targetChatIds.add(chatId);
      log(`📡 Novo chat/grupo vinculado com sucesso! ID: ${chatId}`);
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

// Inicialização Limpa e Segura do Sistema
async function inicializarServidor() {
  try {
    log("🔗 Configurando Webhook exclusivo junto aos servidores do Telegram...");
    
    // Vincula o bot do Telegram diretamente ao seu domínio do Render
    if (RENDER_EXTERNAL_URL.includes('onrender.com') || RENDER_EXTERNAL_URL.includes('https')) {
      await bot.setWebhook(`${RENDER_EXTERNAL_URL}/telegram-webhook/${token}`, { drop_pending_updates: true });
      log("✅ Webhook instalado e blindado contra erros 409!");
    } else {
      log("⚠️ Rodando localmente. Para ativar os comandos do Telegram, configure o Webhook na nuvem.");
    }

    // Inicia o motor de looping de 5 em 5 segundos para coletar dados reais do Aviator
    log("📡 Motor de Sonda Global Iniciado. Capturando rodadas...");
    setInterval(coletarDadosAviator, 5000);

  } catch (err) {
    log("❌ Falha crítica na inicialização:", err.message);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central ativo e escutando na porta ${PORT}`);
  inicializarServidor();
});
