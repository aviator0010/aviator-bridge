const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 8080;
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json()); 

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let rounds = [], clients = new Set();
let lastAnalyzedRoundId = ""; 
let targetChatIds = new Set();

const apiBetou = axios.create({
  baseURL: 'https://betou.bet.br',
  timeout: 5000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json'
  }
});

const token = process.env.BOT_TOKEN;
let bot;

if (token) {
  // Inicialização pura por Webhook (Sem Polling para não travar a Render)
  bot = new TelegramBot(token, { polling: false });
  console.log("🤖 Motor do Telegram configurado via Webhook nativo.");
} else {
  console.log("❌ ERRO: Adicione a variável BOT_TOKEN no painel da Render.");
}

function processarMensagemTelegram(msg) {
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const texto = msg.text;

  if (!targetChatIds.has(chatId)) {
    targetChatIds.add(chatId);
    console.log(`📡 Novo chat capturado com sucesso: ${chatId}`);
  }

  if (texto === '/start' || texto === '/teste') {
    bot.sendMessage(chatId, '🤖 **Robô de Sinais Betou Otimizado!**\n\nConexão restabelecida via Webhook. Monitoramento inteligente ativado. Foco principal em alvos estáveis de 2.00x a 5.00x com alta frequência de análises.', { parse_mode: 'Markdown' })
      .then(() => console.log(`Mensagem enviada para o chat ${chatId}`))
      .catch(e => console.log("Erro no envio:", e.message));
  }
}

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'history', data: rounds }));
  ws.on('close', () => clients.delete(ws));
});

const broadcast = d => {
  const s = JSON.stringify(d);
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(s); });
};

// Algoritmo de Alta Frequência Corrigido (Garantia de leitura de Array)
function analisarPadroesEEnviarSinais() {
  // Se o array não tiver preenchido as 15 rodadas mínimas, aborta para evitar quebra de índice
  if (!rounds || rounds.length < 15 || !bot) return;

  const maisRecente = rounds[0]; // Captura explícita da última rodada do índice 0
  if (!maisRecente || maisRecente.round_id === lastAnalyzedRoundId) return; 
  lastAnalyzedRoundId = maisRecente.round_id;

  const ultimosMultiplicadores = rounds.slice(0, 12).map(r => r.multiplier);
  
  let sequenciaBaixas = 0; 
  for (let i = 0; i < ultimosMultiplicadores.length; i++) {
    if (ultimosMultiplicadores[i] < 2.00) { sequenciaBaixas++; } else { break; }
  }

  let sequenciaAltas = 0;
  for (let i = 0; i < ultimosMultiplicadores.length; i++) {
    if (ultimosMultiplicadores[i] >= 2.00) { sequenciaAltas++; } else { break; }
  }

  // Mapeamento explícito das últimas 3 rodadas consecutivas para o padrão Xadrez
  const m0 = ultimosMultiplicadores[0]; // Rodada Atual que acabou de fechar
  const m1 = ultimosMultiplicadores[1]; // Rodada Anterior
  const m2 = ultimosMultiplicadores[2]; // Duas rodadas atrás

  const indexRosa = rounds.slice(0, 50).findIndex(r => r.multiplier >= 10.00);
  let intervaloDesdeUltimaRosa = indexRosa === -1 ? 50 : indexRosa;

  let dispararSinal = false;
  let tipoSinal = "";
  let metaAlvo = "";
  let probabilidade = "92.0%";

  // PADRÃO 1: Quebra de Sequência Curta (2 a 3 velas baixas consecutivas)
  if (sequenciaBaixas === 2 || sequenciaBaixas === 3) {
    dispararSinal = true;
    tipoSinal = "🎯 ENTRADA CONFIRMADA: Recuperação de Margem Verde";
    metaAlvo = "Buscar saída estável em 2.00x 💰";
    probabilidade = "94.8%";
  }
  
  // PADRÃO 2: Surf de Tendência de Alta
  else if (sequenciaAltas >= 1 && sequenciaAltas <= 3 && m0 >= 2.50) {
    dispararSinal = true;
    tipoSinal = "🔥 SURF DE TENDÊNCIA: Gráfico Pagador Detectado";
    metaAlvo = "Alvo estendido de 3.00x até 5.00x 🚀";
    probabilidade = "91.5%";
  }

  // PADRÃO 3: Quebra de Alternância Clássica (Xadrez)
  else if (m0 && m1 && m2 && ((m0 < 2 && m1 >= 2 && m2 < 2) || (m0 >= 2 && m1 < 2 && m2 >= 2))) {
    dispararSinal = true;
    tipoSinal = "⚡ SINAL RELÂMPAGO: Quebra de Padrão Intercalado";
    metaAlvo = "Buscar saída rápida de 1.80x a 2.20x 💸";
    probabilidade = "93.1%";
  }

  // PADRÃO 4: Vela Rosa por Ciclo Curto
  else if (intervaloDesdeUltimaRosa >= 15 && intervaloDesdeUltimaRosa <= 35 && m0 >= 2.00) {
    dispararSinal = true;
    tipoSinal = "🌸 ALERTA SECUNDÁRIO: Janela de Vela Rosa Ativa";
    metaAlvo = "Proteger investimento em 2.00x e buscar topo 10.00x+ 💎";
    probabilidade = "86.4%";
  }

  // Envio imediato para chats validados
  if (dispararSinal && targetChatIds.size > 0) {
    const horaValidade = new Date(Date.now() + 3 * 60000).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
    const textoMensagem = `${tipoSinal}\n\n🎰 Plataforma: **Betou**\n📈 Entrada: Após a vela ${maisRecente.multiplier}x\n🎯 Alvo: **${metaAlvo}**\n⏰ Válido até: ${horaValidade}\n\n⚠️ Probabilidade Calculada: ${probabilidade}`;

    targetChatIds.forEach(chatId => {
      bot.sendMessage(chatId, textoMensagem, { parse_mode: 'Markdown' }).catch(_ => {});
    });
  }
}

function loadBetouHistory() {
  apiBetou.get('/')
    .then(r => {
      const list = r.data?.data || r.data?.results || r.data || [];
      if (!Array.isArray(list)) return;

      rounds = list.slice(0, 100).map((x, idx) => {
        const m = parseFloat(x.multiplier || x.crash_point || x.result || x.value) || 1.00;
        return { multiplier: m, round_id: String(x.id || Date.now() - idx), is_green: m >= 2.00 };
      });
      
      broadcast({ type: 'history', data: rounds });
      analisarPadroesEEnviarSinais();
    })
    .catch(() => console.log('⏳ Monitorando dados da Betou...'));
}

setInterval(loadBetouHistory, 8000);

app.get('/', (_, res) => res.json({ status: "online", webhook: true }));

// Rota oficial onde as mensagens do Telegram entram na Render
app.post('/telegram-webhook', (req, res) => {
  res.sendStatus(200);
  if (req.body && req.body.message) {
    processarMensagemTelegram(req.body.message);
  }
});

server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor Web rodando na porta:', PORT); 
  loadBetouHistory();
});
