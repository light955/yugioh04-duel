const MAX_NOTIFICATIONS = 20;

export class WhisperNotificationCenter {
    constructor({ button, badge, panel, list, emptyMessage, closeButton, onOpenConversation }) {
        this.button = button;
        this.badge = badge;
        this.panel = panel;
        this.list = list;
        this.emptyMessage = emptyMessage;
        this.closeButton = closeButton;
        this.onOpenConversation = onOpenConversation;
        this.notifications = [];
        this.unreadCount = 0;
        this.audioContext = null;
        this.ringTimeoutId = null;

        this.button.addEventListener("click", () => this.setOpen(this.panel.hidden));
        this.closeButton.addEventListener("click", () => this.setOpen(false));
        document.addEventListener("pointerdown", () => this.unlockAudio(), { once: true });
        document.addEventListener("keydown", () => this.unlockAudio(), { once: true });
    }

    notify(message) {
        if (message?.channel !== "whisper" || !message.sender?.id) return;

        this.notifications.unshift({
            senderId: message.sender.id,
            senderName: message.sender.name || "DUELIST",
            text: message.text || "",
            sentAt: message.sentAt || Date.now()
        });
        this.notifications = this.notifications.slice(0, MAX_NOTIFICATIONS);
        if (this.panel.hidden) this.unreadCount += 1;
        this.render();
        this.updateBadge();
        this.ringBell();
        this.playSound();
    }

    setOpen(isOpen) {
        const shouldOpen = Boolean(isOpen);
        this.panel.hidden = !shouldOpen;
        this.button.setAttribute("aria-expanded", String(shouldOpen));
        if (shouldOpen) this.markAllRead();
    }

    markAllRead() {
        this.unreadCount = 0;
        this.updateBadge();
    }

    updateBadge() {
        this.badge.textContent = String(Math.min(this.unreadCount, 99));
        this.badge.hidden = this.unreadCount === 0;
        this.button.classList.toggle("has-unread", this.unreadCount > 0);
        this.button.setAttribute(
            "aria-label",
            this.unreadCount > 0 ? `WHISPER通知 未読${this.unreadCount}件` : "WHISPER通知"
        );
    }

    render() {
        this.list.replaceChildren();
        this.emptyMessage.hidden = this.notifications.length > 0;

        this.notifications.forEach(notification => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "world-whisper-notification-item";

            const heading = document.createElement("span");
            const sender = document.createElement("strong");
            sender.textContent = notification.senderName;
            const time = document.createElement("time");
            const sentAt = new Date(notification.sentAt);
            time.dateTime = sentAt.toISOString();
            time.textContent = sentAt.toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit"
            });
            heading.append(sender, time);

            const text = document.createElement("span");
            text.textContent = notification.text;
            item.append(heading, text);
            item.addEventListener("click", () => {
                this.setOpen(false);
                this.onOpenConversation?.(notification.senderId);
            });
            this.list.append(item);
        });
    }

    ringBell() {
        window.clearTimeout(this.ringTimeoutId);
        this.button.classList.remove("is-ringing");
        void this.button.offsetWidth;
        this.button.classList.add("is-ringing");
        this.ringTimeoutId = window.setTimeout(() => {
            this.button.classList.remove("is-ringing");
        }, 650);
    }

    async unlockAudio() {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!this.audioContext) this.audioContext = new AudioContextClass();
        if (this.audioContext.state === "suspended") {
            try {
                await this.audioContext.resume();
            } catch {
                // ブラウザが音声再生を許可する次の操作まで待つ。
            }
        }
    }

    playSound() {
        const context = this.audioContext;
        if (!context || context.state !== "running") return;

        const startAt = context.currentTime;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
        gain.connect(context.destination);

        [880, 1174.66].forEach((frequency, index) => {
            const oscillator = context.createOscillator();
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(frequency, startAt + index * 0.08);
            oscillator.connect(gain);
            oscillator.start(startAt + index * 0.08);
            oscillator.stop(startAt + 0.32);
        });
    }
}
