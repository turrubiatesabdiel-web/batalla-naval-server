const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Jugador conectado");

  ws.on("message", (message) => {
    console.log("Mensaje recibido:", message);
    // Reenviar a todos los jugadores
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on("close", () => {
    console.log("Jugador desconectado");
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log("Servidor WebSocket escuchando en puerto " + port);
});
