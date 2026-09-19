export class Card {
    constructor(element, cardData) {
        this.element = element;
        this.faceHtml = element.innerHTML;
        this.id = cardData.id || "";
        this.name = cardData.name || "カード";
        this.description = cardData.description || "効果テキストは登録されていません。";
        this.subTypes = cardData.subTypes || [];
        this.isToken = Boolean(cardData.isToken || this.subTypes.includes("トークン"));
        this.cannotBeTributedForAdvanceSummon = Boolean(cardData.cannotBeTributedForAdvanceSummon);
        this.attribute = cardData.attribute || "";
        this.race = cardData.race || "";
        this.level = Number(cardData.level) || 0;
        this.atk = Number(cardData.atk) || 0;
        this.originalAtk = this.atk;
        this.def = Number(cardData.def) || 0;
        this.originalDef = this.def;
        this.cannotNormalSummon = this.subTypes.includes("特殊召喚") || this.subTypes.includes("儀式");
        this.isMonster = element.classList.contains("monster-card");
        this.isSpell = element.classList.contains("spell-card");
        this.isTrap = element.classList.contains("trap-card");
        this.isDefenseMode = false;
        this.placedTurn = null;
        this.lastPositionChangeTurn = null;
        this.positionLockedUntilTurn = null;
        this.lastAttackTurn = null;
        this.lastDeclaredAttackTurn = null;
        this.cannotAttackTurn = null;
        this.extraAttackAvailableTurn = null;
        this.extraAttackUsedTurn = null;
        this.spellCounters = 0;
        this.lastEffectTurn = null;
        this.isEquipCard = false;
        this.equippedTo = null;
        this.wasProperlySummoned = false;
        this.owner = "player";
        this.controller = "player";
    }

    select() {
        this.element.classList.add("selected");
    }

    deselect() {
        this.element.classList.remove("selected");
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
