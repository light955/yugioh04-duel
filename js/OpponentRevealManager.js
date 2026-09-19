export class OpponentRevealManager {
    constructor({ field, hand, buttonSelector = "#toggle-opponent-reveal", onAnnounce } = {}) {
        this.field = field;
        this.hand = hand;
        this.button = document.querySelector(buttonSelector);
        this.onAnnounce = onAnnounce;
        this.isRevealed = false;
        this.bind();
    }

    bind() {
        this.button?.addEventListener("click", event => {
            event.stopPropagation();
            this.setRevealed(!this.isRevealed);
        });
    }

    setRevealed(isRevealed) {
        this.isRevealed = Boolean(isRevealed);
        document.body.classList.toggle("opponent-cards-revealed", this.isRevealed);
        this.hand?.setRevealed(this.isRevealed);
        this.refreshFieldCards();

        if (this.button) {
            this.button.classList.toggle("active", this.isRevealed);
            this.button.setAttribute("aria-pressed", String(this.isRevealed));
            this.button.querySelector(".opponent-reveal-label").textContent = this.isRevealed
                ? "HIDE CARDS"
                : "REVEAL";
            this.button.title = this.isRevealed
                ? "相手カードのテスト公開を終了"
                : "相手の手札と伏せカードをテスト公開";
        }
        this.onAnnounce?.(this.isRevealed
            ? "テスト表示: 相手の手札と伏せカードを公開しました"
            : "テスト表示: 相手カードを非公開に戻しました");
    }

    refreshFieldCards() {
        this.field?.zones.forEach(zone => {
            const card = zone.placedCard;
            const element = zone.placedElement;
            if (!card || !element) return;

            const isOpponentField = Boolean(zone.element.closest(".opponent-field"));
            const isOpponentExtraZone = zone.element.classList.contains("zone-emz")
                && card.controller === "opponent";
            if (!isOpponentField && !isOpponentExtraZone) return;

            const isFaceDown = element.classList.contains("face-down");
            if (this.isRevealed && isFaceDown) {
                element.innerHTML = card.faceHtml;
                element.classList.add("debug-face-revealed");
                element.title = `相手の伏せカード: ${card.name}`;
            } else if (element.classList.contains("debug-face-revealed")) {
                element.classList.remove("debug-face-revealed");

                // 公開中にカードが発動・反転した場合は、表側の表示をそのまま残す。
                if (isFaceDown) {
                    element.innerHTML = "";
                    element.title = card.isMonster ? "相手のセットモンスター" : "相手のセットカード";
                }
            }
        });
    }
}
