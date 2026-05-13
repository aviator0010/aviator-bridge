// server.js — Cole no Railway e dê Deploy
// HTTP + WebSocket na MESMA porta (obrigatório no Railway)
// Dependências: express cors ws axios
const express = require('express');
const cors    = require('cors');
const WebSocket = require('ws');
const http    = require('http');
const axios   = require('axios');

const PORT = process.env.PORT || 3000;
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

function loadHistory() {
  axios.get('https://blaze.com/api/crash_games/recent?per_page=100')
    .then(r => {
      const list = r.data?.data || [];
      rounds = list.map(x => ({
        multiplier: parseFloat(x.crash_point) || 1,
        round_id: String(x.id),
        timestamp: x.created_at || new Date().toISOString(),
        is_green: parseFloat(x.crash_point) >= 2,
      }));
      console.log('Histórico:', rounds.length, 'rodadas');
    })
    .catch(e => console.log('Histórico falhou:', e.message));
}

function connectBlaze() {
  const ws = new WebSocket(
    'wss://blaze.com/realtimesocket/socket.io/?EIO=3&transport=websocket'
  );
  ws.on('open', () => {
    console.log('✅ Blaze conectada');
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
        console.log('Rodada:', r.multiplier + 'x');
      }
    } catch(_) {}
  });
  ws.on('close', () => { console.log('Blaze fechou, reconectando...'); setTimeout(connectBlaze, 5000); });
  ws.on('error', e => console.log('Erro:', e.message));
}

app.get('/',       (_, res) => res.json({ ok: true, rounds: rounds.length, clients: clients.size }));
app.get('/rounds', (_, res) => res.json(rounds));
app.get('/status', (_, res) => res.json({ phase, multiplier: mult, total: rounds.length }));

server.listen(PORT, () => { console.log('Porta:', PORT); loadHistory(); connectBlaze(); });
