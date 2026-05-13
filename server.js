// Server.js — Simplificado para o Railway
const express = require('express');
const cors    = require('cors');
const WebSocket = require('ws');
const http    = require('http');

const PORT = process.env.PORT || 8080;
const app  = express();
app.use(cors({ origin: '*' }));

const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

let rounds = [], clients = new Set();
let phase = 'betting', mult = 1.00;

wss.on('connection', ws => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'history', data: rounds }));
  ws.send(JSON.stringify({ type: 'phase', phase, multiplier: mult }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

const broadcast = d => {
  const s = JSON.stringify(d);
  clients.forEach(ws => { try { if (ws.readyState === 1) ws.send(s); } catch(_){} });
};

// Conexão direta e segura via WebSocket nativo
function connectBlaze() {
  const wsUrl = 'wss://blaze.com';
  
  const ws = new WebSocket(wsUrl, {
    headers: {
      'User-Agent': process.env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://blaze.com',
      'Accept-Language': 'pt-BR,pt;q=0.9'
    }
  });

  ws.on('open', () => {
    console.log('✅ Conexão estabelecida com a Blaze!');
    ws.send('420["cmd",{"id":"subscribe","payload":{"room":"crash_games"}}]');
  });

  ws.on('message', raw => {
    const m = raw.toString();
    if (m === '2') { ws.send('3'); return; }
    if (!m.startsWith('42')) return;
    try {
      const [ev, d] = JSON.parse(m.slice(2));
      if (ev !== 'data' || !d?.status) return;
      if (d.status === 'waiting') {
        phase = 'betting'; mult = 1;
        broadcast({ type: 'phase', phase, multiplier: mult });
      } else if (d.status === 'rolling') {
        phase = 'flying'; mult = parseFloat(d.current_multiplier) || 1;
        broadcast({ type: 'phase', phase, multiplier: mult });
      } else if (d.status === 'complete') {
        const r = {
          multiplier: parseFloat(d.crash_point) || 1,
          round_id: String(d.id || Date.now()),
          timestamp: new Date().toISOString(),
          is_green: parseFloat(d.crash_point) >= 2,
        };
        rounds = [r, ...rounds].slice(0, 500);
        phase = 'crashed'; mult = r.multiplier;
        broadcast({ type: 'round', data: r });
        broadcast({ type: 'phase', phase, multiplier: mult });
        console.log('Rodada coletada:', r.multiplier + 'x');
      }
    } catch(_) {}
  });

  ws.on('close', (code) => { 
    console.log(`⚠️ Desconectado (Código: ${code}). Reconectando em 5s...`); 
    setTimeout(connectBlaze, 5000); 
  });

  ws.on('error', e => {
    console.log('❌ Erro na conexão:', e.message);
  });
}

app.get('/',       (_, res) => res.json({ ok: true, rounds: rounds.length, clients: clients.size }));
app.get('/rounds', (_, res) => res.json(rounds));
app.get('/rodadas', (_, res) => res.json(rounds));
app.get('/status', (_, res) => res.json({ phase, multiplier: mult, total: rounds.length }));

server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor ativo na porta:', PORT); 
  connectBlaze(); 
});
