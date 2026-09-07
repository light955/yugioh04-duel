import { GraveyardViewer } from "./GraveyardViewer.js?v=1";

export class GraveyardManager {
    constructor({ field, onBeforeOpen, onCountsChanged, onAnnounce } = {}) {
        this.field = field;
        this.onCountsChanged = onCountsChanged;
        this.onAnnounce = onAnnounce;
        this.cards = [];
        this.zone = this.field.zones.find(zone =>
            zone.element.closest(".you-field") && zone.element.classList.contains("zone-graveyard")
        );
        this.viewer = new GraveyardViewer({
            getCards: () => this.cards,
            onBeforeOpen
        });
    }

    get count() {
        return this.cards.length;
    }

    send(sourceZone, placedElement, card, { announce = true } = {}) {
        sourceZone.clearPlacedCard(placedElement);
        this.cards.push(card);

        if (this.zone) {
            this.viewer.showTopCard(this.zone, card, this.count);
        }

        this.viewer.render();
        this.onCountsChanged?.();
        if (announce) this.onAnnounce?.(`【${card.name}】を墓地へ送りました`);
    }
}
