import { CardActionPanel } from "./CardActionPanel.js?v=1";

export class SummonManager {
    constructor({ field, hand, turnManager, requireMainPhase, onAnnounce, onDeselect, onCountsChanged, onSendToGraveyard, onPlacedMonsterClick, onShowEffect }) {
        this.field = field;
        this.hand = hand;
        this.turnManager = turnManager;
        this.requireMainPhase = requireMainPhase;
        this.onAnnounce = onAnnounce;
        this.onDeselect = onDeselect;
        this.onCountsChanged = onCountsChanged;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onPlacedMonsterClick = onPlacedMonsterClick;
        this.selectedCard = null;
        this.selectedAction = null;
        this.pendingTributeSummon = null;

        this.actionPanel = CardActionPanel.createMonster({
            onAction: (action) => this.chooseAction(action),
            onEffect: () => onShowEffect?.(this.selectedCard)
        });
    }

    selectCard(card) {
        this.selectedCard = card;
        this.actionPanel.show(card.element);
        this.onAnnounce?.(`【${card.name}】召喚するかセットするか選んでください`);
    }

    chooseAction(action) {
        const card = this.selectedCard;
        if (!card?.isMonster) return;
        if (!this.requireMainPhase("モンスターの召喚・セット")) return;

        if (card.cannotNormalSummon) {
            this.onAnnounce?.(`【${card.name}】は通常召喚・セットできません`);
            return;
        }

        if (this.turnManager.hasNormalSummoned) {
            this.onDeselect?.();
            this.onAnnounce?.("このターンはすでに通常召喚しています");
            return;
        }

        this.selectedAction = action;
        const requiredTributes = this.getRequiredTributeCount(card);
        if (requiredTributes > 0) {
            this.startTributeSelection(requiredTributes);
            return;
        }

        this.actionPanel.hide();
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);

        const actionText = action === "summon" ? "召喚" : "セット";
        this.onAnnounce?.(`【${card.name}】${actionText}するモンスターゾーンを選んでください`);
    }

    handleZoneClick(zone) {
        if (!this.selectedCard) return false;
        if (!this.requireMainPhase("手札のカードをフィールドに出す操作")) return true;
        if (this.pendingTributeSummon) return this.handleTributeSelection(zone);

        if (!this.selectedAction) {
            this.selectCard(this.selectedCard);
            return true;
        }

        if (zone.canAccept(this.selectedCard)) this.placeMonster(zone);
        return true;
    }

    getRequiredTributeCount(card) {
        if (!card?.isMonster || card.level <= 4) return 0;
        return card.level <= 6 ? 1 : 2;
    }

    getTributeCandidateZones() {
        return this.field.zones.filter(zone => {
            if (!zone.placedCard?.isMonster) return false;
            return Boolean(zone.element.closest(".you-field")) || zone.element.classList.contains("zone-emz");
        });
    }

    startTributeSelection(requiredTributes) {
        const candidates = this.getTributeCandidateZones();
        if (candidates.length < requiredTributes) {
            const actionText = this.selectedAction === "set" ? "アドバンスセット" : "アドバンス召喚";
            this.onAnnounce?.(`【${this.selectedCard.name}】の${actionText}にはモンスターが${requiredTributes}体必要です`);
            return;
        }

        this.actionPanel.hide();
        this.field.clearAllHighlights();
        this.pendingTributeSummon = {
            card: this.selectedCard,
            action: this.selectedAction,
            requiredTributes,
            selectedZones: [],
            stage: "select-tributes"
        };

        candidates.forEach(zone => zone.element.classList.add("tribute-target"));
        this.onAnnounce?.(`生け贄にするモンスターを${requiredTributes}体選んでください`);
    }

    handleTributeSelection(zone) {
        const pending = this.pendingTributeSummon;
        if (!pending) return false;

        if (pending.stage === "select-tributes") {
            const candidates = this.getTributeCandidateZones();
            if (!candidates.includes(zone)) return true;

            const selectedIndex = pending.selectedZones.indexOf(zone);
            if (selectedIndex >= 0) {
                pending.selectedZones.splice(selectedIndex, 1);
                zone.element.classList.remove("tribute-selected");
                zone.element.classList.add("tribute-target");
                return true;
            }

            pending.selectedZones.push(zone);
            zone.element.classList.remove("tribute-target");
            zone.element.classList.add("tribute-selected");

            if (pending.selectedZones.length === pending.requiredTributes) {
                pending.stage = "select-zone";
                this.field.zones.forEach(item => item.element.classList.remove("tribute-target"));
                this.getAdvanceSummonDestinationZones(pending).forEach(item => item.highlight());
                this.onAnnounce?.(`【${pending.card.name}】を出すモンスターゾーンを選んでください`);
            }
            return true;
        }

        if (pending.stage === "select-zone") {
            const destinations = this.getAdvanceSummonDestinationZones(pending);
            if (destinations.includes(zone)) this.completeAdvanceSummon(zone, pending);
            return true;
        }

        return false;
    }

    getAdvanceSummonDestinationZones(pending) {
        return this.field.zones.filter(zone => {
            const isOwnMonsterZone = Boolean(zone.element.closest(".you-field")) && zone.element.classList.contains("zone-monster");
            const isExtraMonsterZone = zone.element.classList.contains("zone-emz");
            if (!isOwnMonsterZone && !isExtraMonsterZone) return false;
            return !zone.isOccupied || pending.selectedZones.includes(zone);
        });
    }

    completeAdvanceSummon(destinationZone, pending) {
        pending.selectedZones.forEach(zone => {
            this.onSendToGraveyard?.(zone, zone.placedElement, zone.placedCard, { announce: false });
        });

        this.clearTributeSelection();
        this.placeMonster(destinationZone, { tributeCount: pending.requiredTributes });
    }

    placeMonster(zone, advanceSummon = null) {
        const card = this.selectedCard;
        if (!card) return;
        const isSetting = this.selectedAction === "set";

        zone.placeCard(card, (positionText) => {
            this.onAnnounce?.(`【${card.name}】${positionText}に変更！`);
        }, {
            faceDown: isSetting,
            onMonsterClick: (placedZone, placedCard, element, onPositionChange) => {
                if (this.pendingTributeSummon) {
                    this.handleTributeSelection(placedZone);
                } else {
                    this.onPlacedMonsterClick?.(placedZone, placedCard, element, onPositionChange);
                }
            }
        });

        card.placedTurn = this.turnManager.turnNumber;
        this.turnManager.markNormalSummonUsed();
        this.hand.removeCard(card);
        this.onCountsChanged?.();
        this.onDeselect?.();

        if (advanceSummon) {
            const actionText = isSetting ? "アドバンスセット" : "アドバンス召喚";
            this.onAnnounce?.(`${advanceSummon.tributeCount}体をリリースして【${card.name}】を${actionText}！`);
        } else if (isSetting) {
            this.onAnnounce?.(`【${card.name}】を裏側守備表示でセット！`);
        } else {
            this.onAnnounce?.(`「出でよ！【${card.name}】！！」召喚成功！`);
        }
    }

    clearTributeSelection() {
        this.field.zones.forEach(zone => {
            zone.element.classList.remove("tribute-target", "tribute-selected");
            zone.clearHighlight();
        });
        this.pendingTributeSummon = null;
    }

    reset() {
        this.clearTributeSelection();
        this.selectedCard = null;
        this.selectedAction = null;
        this.actionPanel.hide();
    }
}
