export class ToastNotification {
    constructor() {
        this.element = document.createElement("div");
        this.element.className = "duel-toast";
        document.body.appendChild(this.element);
        this.timeoutId = null;
    }

    show(message, duration = 2200) {
        this.element.textContent = message;
        this.element.classList.add("show");

        clearTimeout(this.timeoutId);

        this.timeoutId = setTimeout(() => {
            this.element.classList.remove("show");
        }, duration);
    }
}
