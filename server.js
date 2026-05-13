// server.js — Servidor Universal de Rodadas para o Railway
const express = require('express');
const cors    = require('cors');
const WebSocket = require('ws');
const http    = require('http');
const axios   = require('axios');

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
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

const broadcast = d => {
  const s = JSON.stringify(d);
  clients.forEach(ws => { try { if (ws.readyState === 1) ws.send(s); } catch(_){} });
};

// Coleta as rodadas de forma estável através de uma API Espelho Global de Crash
function loadGlobalHistory() {
  axios.get('dev-partners.com')
    .then(r => {
      const list = r.data || [];
      rounds = list.slice(0, 100).map((x, index) => ({
        multiplier: parseFloat(x.multiplier || x.crash_point) || 1.00,
        round_id: String(x.id || Date.now() - index),
        timestamp: new Date().toISOString(),
        is_green: parseFloat(x.multiplier || x.crash_point) >= 2.00,
      }));
      console.log('✅ Histórico atualizado com sucesso:', rounds.length, 'rodadas');
      
      // Envia as atualizações para os seus usuários conectados
      broadcast({ type: 'history', data: rounds });
    })
    .catch(e => console.log('⚠️ Falha temporária na API Espelho, tentando novamente...'));
}

// Configura o robô para buscar novos resultados automaticamente a cada 8 segundos
setInterval(loadGlobalHistory, 8000);

app.get('/',       (_, res) => res.json({ ok: true, server: 'Active', rounds: rounds.length }));
app.get('/rounds', (_, res) => res.json(rounds));
app.get('/rodadas', (_, res) => res.json(rounds));

server.listen(PORT, '0.0.0.0', () => { 
  console.log('🚀 Servidor rodando com estabilidade na porta:', PORT); 
  loadGlobalHistory();
});
