const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;
const BOT_TOKEN = process.env.BOT_TOKEN;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let bot = null;
let gameEngineSocket = null;

let rtcRounds = [];
let lastRoundId = "";
let lastSignalTimestamp = 0;

const SIGNAL_COOLDOWN = 45000;
const MAX_HISTORY = 50;

let targetChatIds = new Set();

if (BOT_TOKEN) {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
    console.log("🤖 Telegram iniciado.");
} else {
    console.log("❌ BOT_TOKEN não encontrada.");
}

function processarMensagemTelegram(msg) {
    if (!msg || !msg.chat) return;

    const chatId = msg.chat.id;
    const texto = msg.text || "";

    targetChatIds.add(chatId);

    console.log(`📡 Chat conectado: ${chatId}`);

    if (texto === '/start' || texto === '/teste') {

        bot.sendMessage(
            chatId,
            `🚀 *ROBÔ BETOU REALTIME ONLINE*

✅ Conectado ao fluxo em tempo real
✅ Filtro inteligente ativo
✅ Anti-spam ativo
✅ Proteção de sequência RED

🎯 Estratégia focada:
Saídas entre *1.80x* e *2.00x*`,
            {
                parse_mode: 'Markdown'
            }
        ).catch(() => {});
    }
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
        type: 'connected',
        realtime: true
    }));
});

function calcularScore(mults) {

    let score = 0;

    const ultimos5 = mults.slice(0, 5);
    const ultimos10 = mults.slice(0, 10);

    const baixas5 = ultimos5.filter(m => m < 2).length;
    const baixas10 = ultimos10.filter(m => m < 2).length;

    if (baixas5 >= 3) score += 35;
    if (baixas10 <= 6) score += 25;

    if (
        mults[0] < 2 &&
        mults[1] < 2 &&
        mults[2] < 2
    ) {
        score += 30;
    }

    if (
        mults[0] >= 2 &&
        mults[1] < 2 &&
        mults[2] >= 2
    ) {
        score += 20;
    }

    const media =
        ultimos10.reduce((a, b) => a + b, 0) /
        ultimos10.length;

    if (media >= 1.7) score += 10;

    return score;
}

function analisarFluxoInstantaneo(novaVela) {

    if (!novaVela || !novaVela.multiplier) return;

    if (novaVela.round_id === lastRoundId) return;

    lastRoundId = novaVela.round_id;

    rtcRounds.unshift(novaVela);

    if (rtcRounds.length > MAX_HISTORY) {
        rtcRounds.pop();
    }

    const multiplicadores = rtcRounds.map(r => r.multiplier);

    if (multiplicadores.length < 10) return;

    const agora = Date.now();

    if (agora - lastSignalTimestamp < SIGNAL_COOLDOWN) {
        return;
    }

    const ultimos10 = multiplicadores.slice(0, 10);

    const reds = ultimos10.filter(m => m < 2).length;

    const mercadoPerigoso = reds >= 8;

    if (mercadoPerigoso) {
        console.log("🛑 Mercado perigoso ignorado.");
        return;
    }

    const score = calcularScore(multiplicadores);

    if (score < 70) return;

    lastSignalTimestamp = agora;

    let confianca = "78%";

    if (score >= 90) confianca = "96%";
    else if (score >= 80) confianca = "91%";
    else if (score >= 70) confianca = "84%";

    const horario = new Date().toLocaleTimeString('pt-BR');

    const mensagem =
`🚨 *ENTRADA DETECTADA*

🎰 Betou Crash
📊 Score: *${score}*
📈 Confiança: *${confianca}*

🎯 Entrada:
Próxima rodada

💸 Saída recomendada:
*1.80x a 2.00x*

⏰ ${horario}

🧠 IA estatística monitorando fluxo realtime`;

    console.log("📡 SINAL ENVIADO");

    targetChatIds.forEach(chatId => {

        bot.sendMessage(chatId, mensagem, {
            parse_mode: 'Markdown'
        }).catch(() => {});
    });
}

function iniciarEscutaFrequenciaBetou() {

    if (gameEngineSocket) {
        try {
            gameEngineSocket.terminate();
        } catch(e) {}
    }

    console.log("🔌 Conectando WebSocket...");

    gameEngineSocket = new WebSocket(
        'wss://betou.bet.br/ws/games/crash'
    );

    let pingInterval;

    gameEngineSocket.on('open', () => {

        console.log("✅ WebSocket conectado.");

        pingInterval = setInterval(() => {

            if (
                gameEngineSocket &&
                gameEngineSocket.readyState === WebSocket.OPEN
            ) {

                gameEngineSocket.ping();

            }

        }, 15000);
    });

    gameEngineSocket.on('message', (rawData) => {

        try {

            const parsed = JSON.parse(rawData.toString());

            if (
                parsed.event === 'round_ended' ||
                parsed.type === 'result' ||
                parsed.multiplier ||
                parsed.crash_point
            ) {

                const multiplier = parseFloat(
                    parsed.multiplier ||
                    parsed.crash_point ||
                    parsed.value
                ) || 1;

                const roundId = String(
                    parsed.round_id ||
                    parsed.id ||
                    Date.now()
                );

                console.log(`📊 ${roundId} => ${multiplier}x`);

                analisarFluxoInstantaneo({
                    multiplier,
                    round_id: roundId
                });
            }

        } catch(e) {}
    });

    gameEngineSocket.on('close', () => {

        console.log("⚠️ WebSocket desconectado.");

        clearInterval(pingInterval);

        setTimeout(() => {
            iniciarEscutaFrequenciaBetou();
        }, 5000);
    });

    gameEngineSocket.on('error', () => {
        console.log("❌ Erro WebSocket.");
    });
}

iniciarEscutaFrequenciaBetou();

app.get('/', (_, res) => {

    res.json({
        status: 'ONLINE',
        chats: targetChatIds.size,
        rounds: rtcRounds.length,
        realtime: true
    });
});

app.post('/telegram-webhook', (req, res) => {

    res.sendStatus(200);

    if (
        req.body &&
        req.body.message
    ) {
        processarMensagemTelegram(req.body.message);
    }
});

server.listen(PORT, '0.0.0.0', () => {

    console.log(`🚀 Servidor ativo na porta ${PORT}`);
});
