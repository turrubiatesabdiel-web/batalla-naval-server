// server.js - Express + ws (WebSocket). Usa process.env.PORT para Render.
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // si tienes carpeta public para frontend

app.get('/', (req, res) => {
  res.send('Servidor Batalla Naval funcionando ✔️');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// rooms estructura simple en memoria
const rooms = {}; // { ROOMCODE: { clients: [ws, ws], players: [{fleet:...},{...}], turn: 0 } }

function send(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ }
}

wss.on('connection', (ws, req) => {
  // extraer room desde query ?room=ABC
  const url = new URL(req.url, 'http://localhost');
  const roomCode = url.searchParams.get('room') || 'lobby';

  if (!rooms[roomCode]) rooms[roomCode] = { clients: [], players: [], turn: 0 };

  const room = rooms[roomCode];

  if (room.clients.length >= 2) {
    send(ws, { type: 'error', message: 'Sala llena' });
    ws.close();
    return;
  }

  const playerIndex = room.clients.length;
  room.clients.push(ws);
  room.players[playerIndex] = { fleet: null, hitsReceived: [] };

  send(ws, { type: 'joined', playerIndex });

  // notificar si ya hay 2 jugadores
  if (room.clients.length === 2) {
    room.clients.forEach((c) => send(c, { type: 'bothConnected' }));
  }

  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    // Colocar flota
    if (data.type === 'placeFleet') {
      room.players[playerIndex].fleet = data.fleet || null;
      // si ambos listos, iniciar juego
      const bothReady = room.players.every(p => p && p.fleet);
      if (bothReady) {
        room.turn = 0; // jugador 0 inicia
        room.clients.forEach((c) => send(c, { type: 'gameStart', turn: room.turn }));
      } else {
        send(ws, { type: 'waitingOpponent' });
      }
      return;
    }

    // Disparo
    if (data.type === 'shot') {
      if (room.turn !== playerIndex) {
        send(ws, { type: 'error', message: 'No es tu turno' });
        return;
      }
      const opponentIndex = playerIndex === 0 ? 1 : 0;
      const opponent = room.players[opponentIndex];
      if (!opponent || !opponent.fleet) {
        send(ws, { type: 'error', message: 'Oponente no listo' });
        return;
      }
      const { x, y } = data;
      // evitar disparos repetidos
      if (opponent.hitsReceived && opponent.hitsReceived.some(h => h.x === x && h.y === y)) {
        send(ws, { type: 'error', message: 'Ya se disparó ahí' });
        return;
      }
      let hit = false;
      let sunk = null;
      for (const ship of opponent.fleet) {
        const idx = ship.coords.findIndex(c => c.x === x && c.y === y);
        if (idx !== -1) {
          hit = true;
          ship.coords.splice(idx, 1);
          opponent.hitsReceived.push({ x, y });
          if (ship.coords.length === 0) sunk = ship.name;
          break;
        }
      }

      // enviar resultado a ambos
      room.clients.forEach((c) => send(c, {
        type: 'shotResult',
        shooter: playerIndex,
        x, y, hit, sunk
      }));

      // comprobar victoria
      const remaining = room.players[opponentIndex].fleet.reduce((acc, s) => acc + s.coords.length, 0);
      if (remaining === 0) {
        room.clients.forEach((c) => send(c, { type: 'gameOver', winner: playerIndex }));
        // limpiar sala después
        setTimeout(() => {
          room.clients.forEach(c => { try{ c.close(); } catch {} });
          delete rooms[roomCode];
        }, 3000);
        return;
      }

      // cambiar turno si falló
      if (!hit) room.turn = opponentIndex;
      room.clients.forEach((c) => send(c, { type: 'turn', turn: room.turn }));
      return;
    }

    // chat
    if (data.type === 'chat') {
      room.clients.forEach((c) => send(c, { type: 'chat', from: playerIndex, message: data.message }));
      return;
    }
  });

  ws.on('close', () => {
    // remover cliente de sala
    room.clients = room.clients.filter(c => c !== ws);
    room.players = room.players.filter((p, i) => room.clients[i]); // reindex simple
    room.clients.forEach((c) => send(c, { type: 'opponentLeft' }));
    if (room.clients.length === 0) delete rooms[roomCode];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Servidor WebSocket escuchando en puerto', PORT);
});

