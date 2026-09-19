export class OpponentHand {
    constructor(containerSelector, { createCard } = {}) {
        this.container = document.querySelector(containerSelector);
        this.countTag = this.container?.querySelector(".hand-title span:last-child") || null;
        this.cardsContainer = this.container?.querySelector(".hand-cards") || null;
        this.createCard = createCard;
        this.cards = [];
        this.isRevealed = false;
        this.updateCount();
    }

    addCard(cardData) {
        if (!this.cardsContainer || !cardData) return;

        this.cards.push(cardData);
        this.render();
        this.updateCount();
    }

    clear() {
        this.cards = [];
        this.render();
        this.updateCount();
    }

    removeCard(cardData) {
        const index = this.cards.indexOf(cardData);
        if (index < 0) return false;

        this.cards.splice(index, 1);
        this.render();
        this.updateCount();
        return true;
    }

    setRevealed(isRevealed) {
        this.isRevealed = Boolean(isRevealed);
        this.container?.classList.toggle("test-revealed", this.isRevealed);
        this.render();
    }

    render() {
        if (!this.cardsContainer) return;
        const elements = this.cards.map(cardData => {
            if (this.isRevealed && this.createCard) {
                const card = this.createCard(cardData);
                card.element.classList.add("opponent-revealed-hand-card");
                card.element.title = `相手の手札: ${card.name}`;
                return card.element;
            }

            const cardBack = document.createElement("div");
            cardBack.className = "card-back";
            cardBack.title = "相手の手札";
            return cardBack;
        });
        this.cardsContainer.replaceChildren(...elements);
    }

    updateCount() {
        if (this.countTag) {
            this.countTag.textContent = `(${this.cards.length}枚)`;
        }
    }
}
