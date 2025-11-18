const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
app.get("/", (req, res) => {
    res.send("Servidor Batalla Naval funcionando ✔️");
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let rooms = {};

io.on("connection", (socket) => {
    console.log("Nuevo jugador conectado:", socket.id);

    socket.on("joinRoom", (roomId) => {
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = { players: [] };
        }

        rooms[roomId].players.push(socket.id);

        io.to(roomId).emit("playersUpdate", rooms[roomId].players);
    });

    socket.on("attack", ({ roomId, x, y }) => {
        socket.to(roomId).emit("enemyAttack", { x, y });
    });

    socket.on("hit", (roomId) => {
        socket.to(roomId).emit("hitConfirm");
    });

    socket.on("miss", (roomId) => {
        socket.to(roomId).emit("missConfirm");
    });

    socket.on("disconnect", () => {
        for (const roomId in rooms) {
            rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
            io.to(roomId).emit("playersUpdate", rooms[roomId].players);
        }
        console.log("Jugador desconectado:", socket.id);
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log("Servidor WebSocket escuchando en puerto", PORT);
});



