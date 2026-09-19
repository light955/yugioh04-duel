export class Zone {
    constructor(element) {
        this.element = element;
        this.originalContent = element.querySelector(".slot-content");
        this.placedCard = null;
        this.placedElement = null;
    }

    get isOccupied() {
        return this.placedCard !== null || this.element.classList.contains("occupied");
    }

    highlight() {
        this.element.classList.add("selectable-target");
    }

    clearHighlight() {
        this.element.classList.remove("selectable-target");
    }

    canAccept(card) {
        if (this.isOccupied) return false;

        const isPlayerMonster = this.element.closest(".you-field") && this.element.classList.contains("zone-monster");
        const isEMZ = this.element.classList.contains("zone-emz");
        const isPlayerSpell = this.element.closest(".you-field") && this.element.classList.contains("zone-spell");
        const isPlayerField = this.element.closest(".you-field") && this.element.classList.contains("zone-field");

        if (card.isMonster) {
            return isPlayerMonster || isEMZ;
        }

        if (card.isSpell || card.isTrap) {
            if (card.name.includes("フィールド") || card.element.title.includes("フィールド")) {
                return isPlayerField;
            }
            return isPlayerSpell;
        }

        return false;
    }

    placeCard(card, onPositionChange, options = {}) {
        if (this.originalContent) {
            this.originalContent.style.display = "none";
        }

        const placedElement = document.createElement("div");
        placedElement.className = card.element.className;
        placedElement.classList.remove("selected");
        placedElement.classList.add("placed-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = card.isMonster ? `${card.name} (クリックで表示形式変更)` : card.name;

        if (options.faceDown) {
            placedElement.classList.add("face-down");
            placedElement.innerHTML = "";
            placedElement.title = `${card.name}（セット中）`;

            if (card.isMonster) {
                card.isDefenseMode = true;
                placedElement.classList.add("defense-mode");
                placedElement.title = `${card.name}（裏側守備表示）`;
            }
        }

        if (card.isMonster && options.onMonsterClick) {
            placedElement.addEventListener("click", (event) => {
                event.stopPropagation();
                options.onMonsterClick(this, card, placedElement, onPositionChange);
            });
        }

        if (options.faceDown && (card.isSpell || card.isTrap) && options.onSetCardClick) {
            placedElement.addEventListener("click", (event) => {
                event.stopPropagation();
                options.onSetCardClick(this, card, placedElement);
            });
        }

        this.element.appendChild(placedElement);
        this.element.classList.add("occupied");
        this.placedCard = card;
        this.placedElement = placedElement;

        return placedElement;
    }

    clearPlacedCard(placedElement) {
        if (placedElement) {
            placedElement.remove();
        }
        this.placedCard = null;
        this.placedElement = null;
        this.element.classList.remove("occupied");
        if (this.originalContent) {
            this.originalContent.style.display = "";
        }
    }
}
