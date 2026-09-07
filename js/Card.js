export class Card {
    constructor(element, cardData = {}) {
        this.element = element;
        this.faceHtml = element.innerHTML;
        this.name = cardData.name || element.querySelector(".card-header-mini span")?.textContent || "カード";
        this.description = cardData.description || "効果テキストは登録されていません。";
        this.subTypes = cardData.subTypes || [];
        this.attribute = cardData.attribute || "";
        this.race = cardData.race || "";
        this.level = Number(cardData.level) || 0;
        this.atk = Number(cardData.atk) || 0;
        this.def = Number(cardData.def) || 0;
        this.cannotNormalSummon = this.subTypes.includes("特殊召喚") || this.subTypes.includes("儀式");
        this.isMonster = element.classList.contains("monster-card");
        this.isSpell = element.classList.contains("spell-card");
        this.isTrap = element.classList.contains("trap-card");
        this.isDefenseMode = false;
        this.placedTurn = null;
        this.lastPositionChangeTurn = null;
        this.lastAttackTurn = null;
    }

    select() {
        this.element.classList.add("selected");
    }

    deselect() {
        this.element.classList.remove("selected");
    }

    toggleBattlePosition(placedElement, onPositionChange) {
        if (!this.isMonster) return;

        this.setBattlePosition(placedElement, !this.isDefenseMode, onPositionChange);
    }

    setBattlePosition(placedElement, useDefenseMode, onPositionChange) {
        if (!this.isMonster) return;

        this.isDefenseMode = useDefenseMode;
        if (this.isDefenseMode) {
            placedElement.classList.add("defense-mode");
            if (onPositionChange) onPositionChange("守備表示");
        } else {
            placedElement.classList.remove("defense-mode");
            if (onPositionChange) onPositionChange("攻撃表示");
        }
    }
}
