const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const http = require('http');
const puppeteer = require('puppeteer'); // Alvo principal da mudança técnica

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
      `⚡ Robô Crash Online\n\n🎯 Estratégia focada em alvo 2x+\n📡 Monitoramento em tempo real via Browser ativo.`,
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

// Expõe a função do Node para ser chamada diretamente de dentro do navegador do Puppeteer
async function registrarRodadaDoBrowser(multiplier, id) {
  const multFloat = parseFloat(multiplier);
  if (!multFloat || isNaN(multFloat)) return;

  const resultado = {
    multiplier: multFloat,
    round_id: id || Date.now().toString()
  };

  log("📊 Rodada em tempo real via Browser:", resultado.multiplier);
  analisarRodada(resultado);
}

async function iniciarMonitoramentoNavegador() {
  log("🌐 Inicializando navegador virtual anti-bloqueio...");

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const page = await browser.newPage();
    
    // Define um User-Agent real para não ser pego pelo Cloudflare
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Torna a função do Node visível para o JavaScript da página
    await page.exposeFunction('enviarRodadaAoNode', registrarRodadaDoBrowser);

    // Injeta a lógica de escuta direto no protótipo do WebSocket antes da página carregar
    await page.evaluateOnNewDocument(() => {
      const OriginalWebSocket = window.WebSocket;
      
      window.WebSocket = function (url, protocols) {
        const ws = new OriginalWebSocket(url, protocols);
        
        ws.addEventListener('message', (event) => {
          try {
            const dadosTexto = event.data;
            
            // Regra genérica para capturar estruturas de multiplicador em JSON
            if (dadosTexto.includes('multiplier') || dadosTexto.includes('crash_point') || dadosTexto.includes('coef')) {
              const jsonMatch = dadosTexto.match(/[\{\[].*[\}\]]/);
              if (jsonMatch) {
                const obj = JSON.parse(jsonMatch[0]);
                let dados = Array.isArray(obj) ? obj[1] || obj[0] : obj;
                
                let m = dados.multiplier || dados.crash_point || dados.coef || dados.value;
                let id = dados.round_id || dados.id || dados.round;
                
                if (m) window.enviarRodadaAoNode(m, id);
              }
            }
          } catch (e) {}
        });
        
        return ws;
      };
      
      window.WebSocket.prototype = OriginalWebSocket.prototype;
    });

    log("🔗 Acessando a plataforma Betou...");
    await page.goto('https://betou.bet.br', { waitUntil: 'networkidle2', timeout: 60000 });
    log("✅ Navegador conectado e monitorando tráfego interno!");

    // Trata fechamento inesperado do navegador recomeçando o processo
    browser.on('disconnected', () => {
      log("🔄 Navegador fechado inesperadamente. Reiniciando...");
      setTimeout(iniciarMonitoramentoNavegador, 5000);
    });

  } catch (err) {
    log("❌ Erro ao subir estrutura do navegador:", err.message);
    setTimeout(iniciarMonitoramentoNavegador, 10000);
  }
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

iniciarMonitoramentoNavegador();

server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 Servidor central ativo na porta ${PORT}`);
});
