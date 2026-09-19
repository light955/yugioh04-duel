import { Card } from "./Card.js?v=10";

export class Hand {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.countTag = this.container ? this.container.querySelector(".hand-title span:last-child") : null;
        this.cardsContainer = this.container ? this.container.querySelector(".hand-cards") : null;
        this.cards = [];
        this.boundElements = new WeakSet();
        this.updateCount();
    }

    addCardFromData(cardData, onCardClick) {
        if (!this.cardsContainer || !cardData) return;

        const card = this.createCard(cardData);
        if (!card) return;

        return this.addCard(card, onCardClick);
    }

    addCard(card, onCardClick) {
        if (!this.cardsContainer || !card || this.cards.includes(card)) return null;

        const { element } = card;
        this.cards.push(card);

        if (!this.boundElements.has(element)) {
            element.addEventListener("click", (event) => {
                event.stopPropagation();
                if (onCardClick) onCardClick(card);
            });
            this.boundElements.add(element);
        }

        element.classList.remove("selected");
        this.cardsContainer.appendChild(element);
        this.updateCount();
        return card;
    }

    createCard(cardData) {
        if (!cardData) return null;

        const element = document.createElement("div");
        element.className = `hand-card ${this.getCardClass(cardData)}`;
        element.title = cardData.name;
        element.innerHTML = this.createCardHtml(cardData);

        return new Card(element, cardData);
    }

    clear() {
        this.cards = [];
        if (this.cardsContainer) {
            this.cardsContainer.innerHTML = "";
        }
        this.updateCount();
    }

    getCardClass(cardData) {
        if (cardData.cardType === "monster") return "monster-card";
        if (cardData.cardType === "spell") return "spell-card";
        if (cardData.cardType === "trap") return "trap-card";
        return "monster-card";
    }

    createCardHtml(cardData) {
        if (cardData.cardType === "monster") {
            return `
                <div class="card-header-mini">
                    <span>${cardData.name}</span>
                    <span class="card-level-mini">★${cardData.level || "-"}</span>
                </div>
                <div class="card-illustration-mini">${this.getCardIcon(cardData)}</div>
                <div class="card-footer-mini">
                    <span>ATK ${cardData.atk ?? "-"}</span>
                    <span>DEF ${cardData.def ?? "-"}</span>
                </div>
            `;
        }

        const typeLabel = cardData.cardType === "spell" ? "魔法" : "罠";
        const typeText = cardData.cardType === "spell" ? "SPELL" : "TRAP";
        const subType = cardData.subTypes ? cardData.subTypes[0] : typeLabel;

        return `
            <div class="card-header-mini">
                <span>${cardData.name}</span>
                <span style="color: ${cardData.cardType === "spell" ? "#1dd1a1" : "#e056fd"}; font-size: 0.55rem;">[${typeLabel}]</span>
            </div>
            <div class="card-illustration-mini">${this.getCardIcon(cardData)}</div>
            <div class="card-footer-mini">
                <span>${subType}</span>
                <span>${typeText}</span>
            </div>
        `;
    }

    getCardIcon(cardData) {
        if (cardData.cardType === "spell") return "✦";
        if (cardData.cardType === "trap") return "◇";
        if (cardData.attribute === "LIGHT") return "☀";
        if (cardData.attribute === "DARK") return "☾";
        if (cardData.attribute === "WATER") return "≈";
        if (cardData.attribute === "EARTH") return "◆";
        return "★";
    }

    removeCard(card) {
        this.cards = this.cards.filter(item => item !== card);
        card.element.remove();
        this.updateCount();
    }

    updateCount() {
        if (this.countTag) {
            this.countTag.textContent = `(${this.cards.length}枚)`;
        }
    }
}
