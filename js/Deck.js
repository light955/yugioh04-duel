export class Deck {
    constructor(cards = []) {
        this.cards = [...cards];

    }

    get count() {
        return this.cards.length;
    }

    draw() {
        if (this.cards.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * this.cards.length);
        return this.cards.splice(randomIndex, 1)[0];
    }

    remove(card) {
        const index = this.cards.indexOf(card);
        if (index < 0) return null;
        return this.cards.splice(index, 1)[0];
    }
}
