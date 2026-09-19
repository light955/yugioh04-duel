import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocket, WebSocketServer } from "ws";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BLOCKED_PATHS = new Set([
    "/package.json",
    "/package-lock.json",
    "/server.js",
    "/render.yaml",
    "/RENDER_DEPLOY.md"
]);
const VALID_AREAS = new Set(["lobby", "shop"]);

let playerSequence = 1;
const players = new Map();
const app = express();

app.disable("x-powered-by");
app.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (
        BLOCKED_PATHS.has(request.path)
        || request.path.startsWith("/node_modules/")
        || request.path.split("/").some(segment => segment.startsWith("."))
    ) {
        response.sendStatus(404);
        return;
    }
    next();
});
app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
});
app.get("/", (_request, response) => response.sendFile(path.join(ROOT_DIRECTORY, "metaverse.html")));
app.use(express.static(ROOT_DIRECTORY, {
    dotfiles: "deny",
    etag: false,
    index: false,
    maxAge: 0,
    setHeaders: response => response.setHeader("Cache-Control", "no-store")
}));
app.use((_request, response) => response.sendStatus(404));

const server = createServer(app);
const webSocketServer = new WebSocketServer({ server, path: "/ws" });

function sendJson(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function getPublicPlayer(player) {
    return {
        id: player.id,
        name: player.name,
        area: player.area,
        position: player.position,
        rotationY: player.rotationY,
        isMoving: player.isMoving
    };
}

function getPublicPlayers() {
    return [...players.values()].map(getPublicPlayer);
}

function broadcast(payload, excludedSocket = null) {
    players.forEach((_player, socket) => {
        if (socket !== excludedSocket) sendJson(socket, payload);
    });
}

function broadcastPresence() {
    broadcast({
        type: "presence",
        onlineCount: players.size,
        players: getPublicPlayers()
    });
}

function clampNumber(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(maximum, Math.max(minimum, number));
}

function sanitizePlayerState(message) {
    const area = VALID_AREAS.has(message.area) ? message.area : null;
    const x = clampNumber(message.position?.x, -50, 50);
    const y = clampNumber(message.position?.y, -2, 12);
    const z = clampNumber(message.position?.z, -50, 100);
    const rotationY = clampNumber(message.rotationY, -Math.PI * 4, Math.PI * 4);
    if (!area || x === null || y === null || z === null || rotationY === null) return null;
    return {
        area,
        position: { x, y, z },
        rotationY,
        isMoving: Boolean(message.isMoving)
    };
}

function sanitizePlayerName(value, fallbackName) {
    const name = Array.from(String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim())
        .slice(0, 16)
        .join("");
    return name || fallbackName;
}

webSocketServer.on("connection", (socket, request) => {
    const fallbackName = `DUELIST-${String(playerSequence).padStart(3, "0")}`;
    const requestUrl = new URL(request.url, "http://localhost");
    const player = {
        id: randomUUID().slice(0, 8),
        name: sanitizePlayerName(requestUrl.searchParams.get("name"), fallbackName),
        area: "lobby",
        position: { x: 0, y: 0.52, z: 0 },
        rotationY: 0,
        isMoving: false
    };
    playerSequence += 1;
    socket.isAlive = true;
    players.set(socket, player);

    sendJson(socket, {
        type: "welcome",
        player: getPublicPlayer(player),
        players: getPublicPlayers().filter(otherPlayer => otherPlayer.id !== player.id),
        onlineCount: players.size
    });
    broadcastPresence();
    console.log(`[ONLINE] ${player.name} connected (${players.size})`);

    socket.on("pong", () => {
        socket.isAlive = true;
    });

    socket.on("message", rawMessage => {
        if (rawMessage.length > 16_384) {
            socket.close(1009, "Message too large");
            return;
        }

        try {
            const message = JSON.parse(rawMessage.toString());
            if (message.type === "ping") {
                sendJson(socket, { type: "pong" });
                return;
            }
            if (message.type !== "player-state") return;

            const nextState = sanitizePlayerState(message);
            if (!nextState) {
                sendJson(socket, { type: "error", message: "INVALID_PLAYER_STATE" });
                return;
            }
            Object.assign(player, nextState);
            broadcast({
                type: "player-state",
                player: getPublicPlayer(player)
            }, socket);
        } catch {
            sendJson(socket, { type: "error", message: "INVALID_MESSAGE" });
        }
    });

    socket.on("close", () => {
        players.delete(socket);
        broadcast({ type: "player-left", playerId: player.id });
        broadcastPresence();
        console.log(`[OFFLINE] ${player.name} disconnected (${players.size})`);
    });
});

const heartbeatTimer = setInterval(() => {
    players.forEach((_player, socket) => {
        if (!socket.isAlive) {
            socket.terminate();
            return;
        }
        socket.isAlive = false;
        socket.ping();
    });
}, 30_000);

server.listen(PORT, HOST, () => {
    console.log(`Duel Metaverse server: http://localhost:${PORT}`);
});

function shutdown() {
    clearInterval(heartbeatTimer);
    webSocketServer.clients.forEach(socket => socket.close(1001, "Server shutdown"));
    server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
