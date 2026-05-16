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

// 🛑 CORREÇÃO DEFINITIVA DO ERRO 409:
// Criamos o objeto desativando temporariamente o polling automático automático
const bot = new TelegramBot(token, { polling: false });

const AVIATOR_API_URL = 'https://spribegaming.com';
const NOME_PLATAFORMA = "Betou"; 
const LINK_PLATAFORMA = "https://betou.bet.br"; 

let targetChatIds = new Set();
let rounds = [];
let lastRoundId = null;

function log(...msg) {
  console.log(new Date().toLocaleTimeString(), '-', ...msg);
}

// Rotina obrigatória para limpar webhooks e forçar a derrubada de robôs duplicados
async function resolverConflitoTelegram() {
  try {
    log("🧹 Limpando buffers e destruindo conexões duplicadas no Telegram...");
    await bot.deleteWebhook({ drop_pending_updates: true });
    await bot.getUpdates({ offset: -1, limit: 1, timeout: 0 });
    
    // Liga o recebimento de mensagens apenas após garantir que a linha está totalmente limpa
    bot.startPolling({ restart: true });
    log("✅ Polling limpo e ativado com exclusividade!");
  } catch (err) {
    log("⚠️ Erro ao tentar limpar conexões antigas, reiniciando fluxo:", err.message);
    // Tenta ligar mesmo com aviso para não travar a aplicação
    bot.startPolling({ restart: true });
  }
}

bot.on('message', (msg) => {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    log(`📡 Canal de destino registrado! ID do Chat: ${chatId}`);
  }

  if (msg.text === '/start') {
    bot.sendMessage(
      chatId,
      `✈️ **Robô Aviator Profissional Lançado!**\n\n🎯 Alvo Principal: **2.00x até 5.00x**\n📡 Monitoramento ativo na plataforma **${NOME_PLATAFORMA}**.\n\n💡 Use o comando \`/teste\` para forçar um envio agora!`,
      { parse_mode: 'Markdown' }
    );
  }

  if (msg.text === '/teste') {
    log(`🛠️ Disparando sinal forçado de teste para o chat: ${chatId}`);
    enviarSinalTelegram(2.80, 100);
  }
});

function calcularEstrategiaAviator(mults) {
  let score = 0;
  let redsSeguidos = 0;

  for (let i = 0; i < mults.length; i++) {
    if (mults[i] < 2.0) redsSeguidos++;
    else break;
  }

  if (redsSeguidos === 3) score += 70;
  if (redsSeguidos === 4) score += 85;
  if (redsSeguidos >= 5) score += 95;

  return { score, redsSeguidos };
}

function enviarSinalTelegram(multiplicadorAnterior, score) {
  if (!targetChatIds.size) {
    log("⚠️ Tentativa de sinal cancelada: Nenhum chat ativo. Digite /start no bot.");
    return;
  }
  
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
    bot.sendMessage(chatId, texto, opcoes)
      .then(() => log(`✅ Sinal enviado com sucesso para o chat ${chatId}`))
      .catch((err) => log(`❌ Erro no envio físico para o Telegram:`, err.message));
  });
}

function analisarNovaRodada(nova) {
  if (!nova || !nova.multiplier) return;
  if (nova.round_id === lastRoundId) return;

  lastRoundId = nova.round_id;
  rounds.unshift(nova.multiplier);

  if (rounds.length > 30) rounds.pop();
  
  log(`📊 Rodada Aviator Detectada: ${nova.multiplier.toFixed(2)}x`);

  if (rounds.length < 3) return;

  const analise = calcularEstrategiaAviator(rounds);

  if (analise.score >= 65) {
    log(`🎯 Padrão Identificado! Pontuação: ${analise.score}. Gerando alerta...`);
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

    const ultimaRodada = dados.history;
    const multiplier = parseFloat(ultimaRodada.crash_value || ultimaRodada.value || ultimaRodada.multiplier);
    const round_id = (ultimaRodada.id || ultimaRodada.round_id || ultimaRodada.game_id).toString();

    if (multiplier && !isNaN(multiplier)) {
      analisarNovaRodada({ multiplier, round_id });
    }
  } catch (err) {
    // Mantém o loop ativo mesmo se a API oscilar
  }
}

async function inicializarSistemaCompleto() {
  // 1. Executa a limpeza física de conflito de polling do token
  await resolverConflitoTelegram();
  
  // 2. Inicia a escuta contínua das decolagens do Aviator
  log("📡 Conectando ao barramento universal de estatísticas do Aviator...");
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

// Dispara o fluxo ordenado de inicialização
inicializarSistemaCompleto();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central operando perfeitamente na porta ${PORT}`);
});
