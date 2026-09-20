const NOTIFICATION_DURATION = 4200;
const MAX_VISIBLE_NOTIFICATIONS = 3;

export class WorldNotificationCenter {
    constructor(container) {
        this.container = container;
    }

    show({ type, playerName }) {
        if (!this.container || !playerName) return;
        while (this.container.children.length >= MAX_VISIBLE_NOTIFICATIONS) {
            this.container.firstElementChild?.remove();
        }

        const notification = document.createElement("div");
        notification.className = "world-notification";
        notification.dataset.type = type;

        const mark = document.createElement("span");
        mark.className = "world-notification-mark";
        mark.textContent = type === "joined" ? "+" : "−";
        mark.setAttribute("aria-hidden", "true");

        const message = document.createElement("p");
        const name = document.createElement("strong");
        name.textContent = playerName;
        message.append(name, type === "joined" ? " がロビーに参加しました" : " が退出しました");
        notification.append(mark, message);
        this.container.append(notification);

        requestAnimationFrame(() => notification.classList.add("is-visible"));
        window.setTimeout(() => {
            notification.classList.remove("is-visible");
            window.setTimeout(() => notification.remove(), 220);
        }, NOTIFICATION_DURATION);
    }
}
