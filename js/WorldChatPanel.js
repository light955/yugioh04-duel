const MAX_LOG_MESSAGES = 100;
const CHANNEL_LABELS = {
    global: "GLOBAL",
    area: "AREA",
    whisper: "WHISPER"
};

export class WorldChatPanel {
    constructor({
        element,
        launcher,
        unreadElement,
        logElement,
        form,
        input,
        targetRow,
        targetSelect,
        channelButtons,
        closeButton,
        onSend
    }) {
        this.element = element;
        this.launcher = launcher;
        this.unreadElement = unreadElement;
        this.logElement = logElement;
        this.form = form;
        this.input = input;
        this.targetRow = targetRow;
        this.targetSelect = targetSelect;
        this.channelButtons = [...channelButtons];
        this.closeButton = closeButton;
        this.onSend = onSend;
        this.currentPlayer = null;
        this.players = new Map();
        this.channel = "global";
        this.unreadCount = 0;
        this.isOpen = !window.matchMedia("(max-width: 600px)").matches;

        this.channelButtons.forEach(button => {
            button.addEventListener("click", () => this.setChannel(button.dataset.chatChannel));
        });
        this.launcher.addEventListener("click", () => this.setOpen(true));
        this.closeButton.addEventListener("click", () => this.setOpen(false));
        this.form.addEventListener("submit", event => this.submit(event));
        window.addEventListener("keydown", event => this.handleKeyDown(event));
        this.setChannel("global");
        this.setOpen(this.isOpen);
    }

    setCurrentPlayer(player) {
        this.currentPlayer = player || null;
    }

    setPlayers(players = []) {
        const selectedPlayerId = this.targetSelect.value;
        this.players.clear();
        players.forEach(player => {
            if (player?.id && player.id !== this.currentPlayer?.id) this.players.set(player.id, player);
        });
        this.renderPlayerOptions(selectedPlayerId);
    }

    addPlayer(player) {
        if (!player?.id || player.id === this.currentPlayer?.id) return;
        this.players.set(player.id, player);
        this.renderPlayerOptions(this.targetSelect.value || player.id);
    }

    removePlayer(playerId) {
        if (!playerId) return;
        const selectedPlayerId = this.targetSelect.value;
        this.players.delete(playerId);
        this.renderPlayerOptions(selectedPlayerId === playerId ? "" : selectedPlayerId);
    }

    renderPlayerOptions(preferredPlayerId = "") {
        this.targetSelect.replaceChildren();
        const players = [...this.players.values()].sort((left, right) =>
            String(left.name).localeCompare(String(right.name), "ja")
        );
        if (players.length === 0) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "送信相手がいません";
            this.targetSelect.append(option);
            this.targetSelect.disabled = true;
            return;
        }

        players.forEach(player => {
            const option = document.createElement("option");
            option.value = player.id;
            option.textContent = player.name || "DUELIST";
            this.targetSelect.append(option);
        });
        this.targetSelect.disabled = false;
        if (preferredPlayerId && this.players.has(preferredPlayerId)) {
            this.targetSelect.value = preferredPlayerId;
        }
    }

    setChannel(channel) {
        if (!CHANNEL_LABELS[channel]) return;
        this.channel = channel;
        this.channelButtons.forEach(button => {
            const isSelected = button.dataset.chatChannel === channel;
            button.classList.toggle("is-selected", isSelected);
            button.setAttribute("aria-pressed", String(isSelected));
        });
        this.targetRow.hidden = channel !== "whisper";
        this.input.placeholder = channel === "whisper" ? "メッセージを送る" : `${CHANNEL_LABELS[channel]}に発言`;
        this.updateMessageVisibility();
    }

    openWhisper(playerId) {
        this.setChannel("whisper");
        if (playerId && this.players.has(playerId)) this.targetSelect.value = playerId;
        this.setOpen(true, true);
    }

    setOpen(isOpen, focusInput = false) {
        this.isOpen = Boolean(isOpen);
        this.element.hidden = !this.isOpen;
        this.launcher.hidden = this.isOpen;
        this.launcher.setAttribute("aria-expanded", String(this.isOpen));
        if (this.isOpen) {
            this.unreadCount = 0;
            this.updateUnreadCount();
            if (focusInput) this.input.focus();
        }
    }

    submit(event) {
        event.preventDefault();
        const text = this.input.value.trim();
        if (!text) return;
        const targetId = this.channel === "whisper" ? this.targetSelect.value : null;
        if (this.channel === "whisper" && !targetId) {
            this.addSystemMessage("送信相手を選択してください");
            return;
        }
        this.onSend?.({ channel: this.channel, text, targetId });
        this.input.value = "";
    }

    addMessage(message) {
        if (!message?.sender || !CHANNEL_LABELS[message.channel]) return;
        const row = document.createElement("article");
        row.className = "world-chat-message";
        row.dataset.channel = message.channel;

        const heading = document.createElement("div");
        const channel = document.createElement("span");
        channel.textContent = this.getMessageChannelLabel(message);
        const playerName = document.createElement("strong");
        playerName.textContent = message.sender.name || "DUELIST";
        const time = document.createElement("time");
        time.dateTime = new Date(message.sentAt).toISOString();
        time.textContent = new Date(message.sentAt).toLocaleTimeString("ja-JP", {
            hour: "2-digit",
            minute: "2-digit"
        });
        heading.append(channel, playerName, time);

        const body = document.createElement("p");
        body.textContent = message.text;
        row.append(heading, body);
        this.appendLogRow(row);

        if (!this.isOpen && message.sender.id !== this.currentPlayer?.id) {
            this.unreadCount += 1;
            this.updateUnreadCount();
        }
    }

    addSystemMessage(text) {
        const row = document.createElement("p");
        row.className = "world-chat-system-message";
        row.dataset.channel = this.channel;
        row.textContent = text;
        this.appendLogRow(row);
    }

    getMessageChannelLabel(message) {
        if (message.channel !== "whisper") return CHANNEL_LABELS[message.channel];
        return message.sender.id === this.currentPlayer?.id
            ? `TO ${message.recipient?.name || "DUELIST"}`
            : "WHISPER";
    }

    appendLogRow(row) {
        this.updateRowVisibility(row);
        this.logElement.append(row);
        while (this.logElement.children.length > MAX_LOG_MESSAGES) {
            this.logElement.firstElementChild?.remove();
        }
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    updateMessageVisibility() {
        [...this.logElement.children].forEach(row => this.updateRowVisibility(row));
        this.logElement.scrollTop = this.logElement.scrollHeight;
    }

    updateRowVisibility(row) {
        row.hidden = this.channel !== "global" && row.dataset.channel !== this.channel;
    }

    updateUnreadCount() {
        this.unreadElement.textContent = String(Math.min(this.unreadCount, 99));
        this.unreadElement.hidden = this.unreadCount === 0;
    }

    handleKeyDown(event) {
        if (!document.body.classList.contains("world-entered")) return;
        if (event.key === "Enter" && document.activeElement !== this.input) {
            event.preventDefault();
            this.setOpen(true, true);
            return;
        }
        if (event.key === "Escape" && document.activeElement === this.input) {
            this.input.blur();
        }
    }
}
