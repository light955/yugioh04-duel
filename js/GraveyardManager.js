import { GraveyardViewer } from "./GraveyardViewer.js?v=3";

export class GraveyardManager {
    constructor({
        field,
        ownerSelector = ".you-field",
        enableViewer = true,
        viewerOptions = {},
        onBeforeOpen,
        onCountsChanged,
        onAnnounce
    } = {}) {
        this.field = field;
        this.onCountsChanged = onCountsChanged;
        this.onAnnounce = onAnnounce;
        this.cards = [];
        this.zone = this.field.zones.find(zone =>
            zone.element.closest(ownerSelector) && zone.element.classList.contains("zone-graveyard")
        );
        this.viewer = enableViewer
            ? new GraveyardViewer({
                getCards: () => this.cards,
                onBeforeOpen,
                graveyardSelector: `${ownerSelector} .zone-graveyard`,
                ...viewerOptions
            })
            : null;
    }

    get count() {
        return this.cards.length;
    }

    send(sourceZone, placedElement, card, { announce = true } = {}) {
        sourceZone.clearPlacedCard(placedElement);
        this.add(card, { announce });
    }

    add(card, { announce = true } = {}) {
        this.cards.push(card);

        if (this.zone) {
            this.showTopCard(card);
        }

        this.viewer?.render();
        this.onCountsChanged?.();
        if (announce) this.onAnnounce?.(`【${card.name}】を墓地へ送りました`);
    }

    remove(card) {
        const index = this.cards.indexOf(card);
        if (index < 0) return false;

        this.cards.splice(index, 1);
        if (this.zone) {
            this.zone.element.querySelector(".graveyard-card")?.remove();
            if (this.cards.length > 0) {
                this.showTopCard(this.cards[this.cards.length - 1]);
            } else {
                this.zone.element.classList.remove("occupied");
                if (this.zone.originalContent) this.zone.originalContent.style.display = "";
            }
        }

        this.viewer?.render();
        this.onCountsChanged?.();
        return true;
    }

    showTopCard(card) {
        if (this.zone.originalContent) {
            this.zone.originalContent.style.display = "none";
        }

        this.zone.element.querySelector(".graveyard-card")?.remove();

        const cardElement = document.createElement("div");
        cardElement.className = "graveyard-card";
        cardElement.title = `墓地: ${card.name}`;

        const cardName = document.createElement("span");
        cardName.className = "graveyard-top-name";
        cardName.textContent = card.name;

        const stackCount = document.createElement("span");
        stackCount.className = "graveyard-stack-count";
        stackCount.textContent = this.count;

        cardElement.append(cardName, stackCount);
        this.zone.element.appendChild(cardElement);
        this.zone.element.classList.add("occupied");
    }
}
