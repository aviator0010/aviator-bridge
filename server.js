const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio'); // Adicionado para raspagem limpa de dados da interface
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

// URL da página onde roda o Crash da plataforma
const TARGET_URL = 'https://betou.bet.br'; 

let targetChatIds = new Set();
let rounds = [];
let lastMultiplier = null;
let pollingInterval = null;

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
      `⚡ Robô Crash Online\n\n🎯 Estratégia focada em alvo 2x+\n📡 Monitoramento Inteligente Ativo.`,
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

  rounds.unshift(nova);
  if (rounds.length > 50) rounds.pop();

  const mults = rounds.map(r => r.multiplier);
  if (mults.length < 10) return;

  const analise = calcularScore(mults);

  if (analise.score >= 70) {
    enviarSinal("SINAL CONFIRMADO", nova.multiplier, analise.score);
  }
}

async function rasparHistoricoDaTela() {
  try {
    // Carrega o HTML cru da página fingindo ser um navegador Windows comum
    const { data } = await axios.get(TARGET_URL, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(data);
    let multiplicadoresEncontrados = [];

    // Busca classes e blocos de texto que contenham o formato de multiplicador (Ex: 1.50x ou 2.10x)
    $('div, span, p').each((_, elemento) => {
      const texto = $(elemento).text().trim().toLowerCase();
      if (texto.endsWith('x') && !texto.includes(' ') && texto.length <= 7) {
        const num = parseFloat(texto.replace('x', ''));
        if (!isNaN(num) && num >= 1.00 && !multiplicadoresEncontrados.includes(num)) {
          multiplicadoresEncontrados.push(num);
        }
      }
    });

    if (multiplicadoresEncontrados.length === 0) return;

    // A rodada mais recente é o primeiro multiplicador listado na tela
    const ultimoMultDaTela = multiplicadoresEncontrados[0];

    // Se mudou o multiplicador em relação ao loop anterior, significa que uma nova rodada acabou!
    if (ultimoMultDaTela !== lastMultiplier) {
      lastMultiplier = ultimoMultDaTela;
      log(`📊 Nova rodada identificada na tela do jogo: ${ultimoMultDaTela}x`);
      
      analisarRodada({
        multiplier: ultimoMultDaTela,
        round_id: Date.now().toString()
      });
    }

  } catch (err) {
    log("⚠️ Conexão flutuante com a interface. Tentando novamente no próximo ciclo...");
  }
}

function iniciarMonitoramento() {
  log("📡 Sistema de Scraper de interface ativado. Monitorando tela do Crash...");
  
  // Executa a leitura da tela do jogo a cada 4 segundos
  pollingInterval = setInterval(rasparHistoricoDaTela, 4000);
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
    mode: 'HTML Scraper',
    chats: targetChatIds.size,
    rounds: rounds.length
  });
});

iniciarMonitoramento();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central operando perfeitamente na porta ${PORT}`);
});
