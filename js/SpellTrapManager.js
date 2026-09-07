import { CardActionPanel } from "./CardActionPanel.js?v=1";

export class SpellTrapManager {
    constructor({ field, hand, requireMainPhase, onAnnounce, onDeselect, onCountsChanged, onSendToGraveyard, onShowEffect }) {
        this.field = field;
        this.hand = hand;
        this.requireMainPhase = requireMainPhase;
        this.onAnnounce = onAnnounce;
        this.onDeselect = onDeselect;
        this.onCountsChanged = onCountsChanged;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onShowEffect = onShowEffect;
        this.selectedCard = null;
        this.selectedAction = null;

        this.spellActionPanel = CardActionPanel.createSpell({
            onAction: (action) => this.chooseSpellAction(action),
            onEffect: () => this.onShowEffect?.(this.selectedCard)
        });
        this.trapActionPanel = CardActionPanel.createTrap({
            onAction: (action) => this.chooseTrapAction(action),
            onEffect: () => this.onShowEffect?.(this.selectedCard)
        });
    }

    selectCard(card) {
        this.selectedCard = card;
        this.selectedAction = null;

        if (card.isSpell) {
            this.spellActionPanel.show(card.element);
            this.onAnnounce?.(`【${card.name}】発動するかセットするか選んでください`);
            return;
        }

        if (card.isTrap) {
            this.trapActionPanel.show(card.element);
            this.onAnnounce?.(`【${card.name}】セットまたは効果確認を選んでください`);
        }
    }

    chooseSpellAction(action) {
        const card = this.selectedCard;
        if (!card?.isSpell) return;
        if (!this.requireMainPhase("手札からの魔法カードの発動・セット")) return;

        this.selectedAction = action;
        this.spellActionPanel.hide();
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);

        const actionText = action === "activate" ? "発動" : "セット";
        this.onAnnounce?.(`【${card.name}】${actionText}する魔法・罠ゾーンを選んでください`);
    }

    chooseTrapAction(action) {
        const card = this.selectedCard;
        if (!card?.isTrap || action !== "set") return;
        if (!this.requireMainPhase("罠カードのセット")) return;

        this.selectedAction = action;
        this.trapActionPanel.hide();
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);
        this.onAnnounce?.(`【${card.name}】セットする魔法・罠ゾーンを選んでください`);
    }

    handleZoneClick(zone) {
        const card = this.selectedCard;
        if (!card) return false;
        if (!this.requireMainPhase("手札のカードをフィールドに出す操作")) return true;

        if (!this.selectedAction) {
            this.selectCard(card);
            return true;
        }

        if (zone.canAccept(card)) this.placeCard(zone);
        return true;
    }

    placeCard(zone) {
        const card = this.selectedCard;
        if (!card) return;

        const isActivatingSpell = card.isSpell && this.selectedAction === "activate";
        const isSetting = (card.isSpell && this.selectedAction === "set") || card.isTrap;

        const placedElement = zone.placeCard(card, null, {
            faceDown: isSetting,
            onSetCardClick: (placedZone, placedCard, element) => {
                this.activateSetCard(placedZone, placedCard, element);
            }
        });

        this.hand.removeCard(card);
        this.onCountsChanged?.();
        this.onDeselect?.();

        if (isActivatingSpell) {
            this.onAnnounce?.(`【${card.name}】を発動！`);
            setTimeout(() => {
                this.onSendToGraveyard?.(zone, placedElement, card);
            }, 900);
        } else {
            this.onAnnounce?.(`【${card.name}】をフィールドにセット！`);
        }
    }

    activateSetCard(zone, card, placedElement) {
        if (!placedElement.classList.contains("face-down") || zone.placedCard !== card) return;

        this.onDeselect?.();
        placedElement.classList.remove("face-down");
        placedElement.classList.add("activating-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = `${card.name}（発動中）`;

        const cardType = card.isTrap ? "罠カード" : "魔法カード";
        this.onAnnounce?.(`セットされていた${cardType}【${card.name}】を発動！`);

        setTimeout(() => {
            this.onSendToGraveyard?.(zone, placedElement, card);
        }, 900);
    }

    reset() {
        this.selectedCard = null;
        this.selectedAction = null;
        this.spellActionPanel.hide();
        this.trapActionPanel.hide();
    }
}
