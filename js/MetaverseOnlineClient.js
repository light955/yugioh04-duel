const STATE_SYNC_INTERVAL = 100;
const STATE_REFRESH_INTERVAL = 1500;

export class MetaverseOnlineClient {
    constructor({
        container,
        stateElement,
        countElement,
        playerElement,
        getLocalState,
        onWelcome,
        onPlayerJoined,
        onPlayersSnapshot,
        onPlayerState,
        onPlayerLeft,
        onChatMessage,
        onChatError
    }) {
        this.container = container;
        this.stateElement = stateElement;
        this.countElement = countElement;
        this.playerElement = playerElement;
        this.getLocalState = getLocalState;
        this.onWelcome = onWelcome;
        this.onPlayerJoined = onPlayerJoined;
        this.onPlayersSnapshot = onPlayersSnapshot;
        this.onPlayerState = onPlayerState;
        this.onPlayerLeft = onPlayerLeft;
        this.onChatMessage = onChatMessage;
        this.onChatError = onChatError;
        this.socket = null;
        this.player = null;
        this.retryCount = 0;
        this.retryTimer = null;
        this.syncTimer = null;
        this.lastStateSignature = "";
        this.lastStateSentAt = 0;
        this.shouldReconnect = true;
        this.playerName = "";

        window.addEventListener("online", () => this.connect());
        window.addEventListener("pagehide", () => this.disconnect());
    }

    connect() {
        if (!this.shouldReconnect || !window.WebSocket || !this.playerName) return;
        if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;

        this.clearRetry();
        this.setState("connecting", "CONNECTING");
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const playerName = encodeURIComponent(this.playerName);
        this.socket = new WebSocket(`${protocol}//${location.host}/ws?name=${playerName}`);

        this.socket.addEventListener("open", () => {
            this.retryCount = 0;
            this.lastStateSignature = "";
            this.setState("online", "ONLINE");
        });
        this.socket.addEventListener("message", event => this.handleMessage(event.data));
        this.socket.addEventListener("close", () => {
            this.stopStateSync();
            this.socket = null;
            this.player = null;
            this.onPlayersSnapshot?.([]);
            this.setState("offline", "OFFLINE");
            this.scheduleReconnect();
        });
        this.socket.addEventListener("error", () => {
            this.socket?.close();
        });
    }

    setPlayerName(playerName) {
        this.playerName = String(playerName || "").trim();
        this.playerElement.textContent = this.playerName || "---";
    }

    handleMessage(rawMessage) {
        let message;
        try {
            message = JSON.parse(rawMessage);
        } catch {
            return;
        }

        if (message.type === "welcome") {
            this.player = message.player;
            this.playerElement.textContent = message.player?.name || "UNKNOWN";
            this.countElement.textContent = String(message.onlineCount || 1);
            this.onWelcome?.(message.player);
            this.onPlayersSnapshot?.(message.players || []);
            this.startStateSync();
            this.sendLocalState(true);
            return;
        }
        if (message.type === "presence") {
            this.countElement.textContent = String(message.onlineCount || 0);
            this.onPlayersSnapshot?.(
                (message.players || []).filter(player => player.id !== this.player?.id)
            );
            return;
        }
        if (message.type === "player-joined" && message.player?.id !== this.player?.id) {
            this.onPlayerJoined?.(message.player);
            return;
        }
        if (message.type === "player-state" && message.player?.id !== this.player?.id) {
            this.onPlayerState?.(message.player);
            return;
        }
        if (message.type === "player-left") {
            this.onPlayerLeft?.(message.player || { id: message.playerId });
            return;
        }
        if (message.type === "chat-message") {
            this.onChatMessage?.(message.message);
            return;
        }
        if (message.type === "chat-error") {
            this.onChatError?.(message.code);
        }
    }

    startStateSync() {
        this.stopStateSync();
        this.syncTimer = window.setInterval(() => this.sendLocalState(), STATE_SYNC_INTERVAL);
    }

    stopStateSync() {
        if (!this.syncTimer) return;
        window.clearInterval(this.syncTimer);
        this.syncTimer = null;
    }

    sendLocalState(force = false) {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        const state = this.getLocalState?.();
        if (!state) return;

        const payload = { type: "player-state", ...state };
        const signature = JSON.stringify(payload);
        const now = Date.now();
        if (!force && signature === this.lastStateSignature && now - this.lastStateSentAt < STATE_REFRESH_INTERVAL) {
            return;
        }
        this.socket.send(signature);
        this.lastStateSignature = signature;
        this.lastStateSentAt = now;
    }

    sendChatMessage({ channel, text, targetId }) {
        if (this.socket?.readyState !== WebSocket.OPEN) {
            this.onChatError?.("NOT_CONNECTED");
            return;
        }
        this.socket.send(JSON.stringify({
            type: "chat-message",
            channel,
            text,
            targetId
        }));
    }

    setState(state, label) {
        this.container.dataset.state = state;
        this.stateElement.textContent = label;
    }

    scheduleReconnect() {
        if (!this.shouldReconnect || this.retryTimer) return;
        const delay = Math.min(10_000, 1_500 * (this.retryCount + 1));
        this.retryCount += 1;
        this.retryTimer = window.setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, delay);
    }

    clearRetry() {
        if (!this.retryTimer) return;
        window.clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    disconnect() {
        this.shouldReconnect = false;
        this.clearRetry();
        this.stopStateSync();
        this.socket?.close(1000, "Page closed");
        this.socket = null;
    }
}
