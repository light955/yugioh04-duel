import { Zone } from "./Zone.js?v=1";

export class DuelField {
    constructor(onZoneClick) {
        this.zones = [];
        this.initZones(onZoneClick);
    }

    initZones(onZoneClick) {
        const slotElements = document.querySelectorAll(".zone-slot");
        slotElements.forEach(element => {
            const zone = new Zone(element);
            this.zones.push(zone);

            element.addEventListener("click", (event) => {
                event.stopPropagation();
                if (onZoneClick) onZoneClick(zone);
            });
        });
    }

    highlightValidZones(card) {
        this.zones.forEach(zone => {
            if (zone.canAccept(card)) {
                zone.highlight();
            }
        });
    }

    clearAllHighlights() {
        this.zones.forEach(zone => zone.clearHighlight());
    }
}
