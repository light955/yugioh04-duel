import { CardActionPanel } from "./CardActionPanel.js?v=1";
import { CardSelectionDialog } from "./CardSelectionDialog.js?v=4";

export class SummonManager {
    constructor({ field, hand, turnManager, requireMainPhase, getGraveyardCards, onBanishGraveyardCard, onAnnounce, onDeselect, onCountsChanged, onSendToGraveyard, onPlacedMonsterClick, onMonsterSummoned, onShowEffect }) {
        this.field = field;
        this.hand = hand;
        this.turnManager = turnManager;
        this.requireMainPhase = requireMainPhase;
        this.getGraveyardCards = getGraveyardCards || (() => []);
        this.onBanishGraveyardCard = onBanishGraveyardCard;
        this.onAnnounce = onAnnounce;
        this.onDeselect = onDeselect;
        this.onCountsChanged = onCountsChanged;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onPlacedMonsterClick = onPlacedMonsterClick;
        this.onMonsterSummoned = onMonsterSummoned;
        this.selectedCard = null;
        this.selectedAction = null;
        this.pendingTributeSummon = null;
        this.pendingChaosSummon = null;
        this.chaosSelectionDialog = new CardSelectionDialog();

        this.actionPanel = CardActionPanel.createMonster({
            onAction: (action) => this.chooseAction(action),
            onEffect: () => onShowEffect?.(this.selectedCard)
        });
    }

    selectCard(card) {
        this.selectedCard = card;
        const summonButton = this.actionPanel.query('[data-action="summon"]');
        const setButton = this.actionPanel.query('[data-action="set"]');
        const isChaosSoldier = card.id === "04-031";
        summonButton.querySelector(".action-main").textContent = isChaosSoldier ? "特殊召喚" : "召喚";
        summonButton.querySelector(".action-sub").textContent = isChaosSoldier ? "SPECIAL SUMMON" : "SUMMON";
        setButton.hidden = isChaosSoldier;
        this.actionPanel.show(card.element);
        this.onAnnounce?.(isChaosSoldier
            ? `【${card.name}】を特殊召喚するか効果確認を選んでください`
            : `【${card.name}】召喚するかセットするか選んでください`);
    }

    chooseAction(action) {
        const card = this.selectedCard;
        if (!card?.isMonster) return;
        if (!this.requireMainPhase("モンスターの召喚・セット")) return;

        if (card.id === "04-031") {
            if (action !== "summon") return;
            if (this.turnManager.isSummonRestricted("player")) {
                this.onAnnounce?.("【スケープ・ゴート】を発動したターンは特殊召喚できません");
                return;
            }
            this.startChaosSummon();
            return;
        }

        if (action === "summon" && this.turnManager.isSummonRestricted("player")) {
            this.onAnnounce?.("【スケープ・ゴート】を発動したターンはモンスターを召喚できません（セットは可能です）");
            return;
        }

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
        if (this.pendingChaosSummon) {
            if (zone.canAccept(this.pendingChaosSummon.card)) this.placeChaosMonster(zone);
            return true;
        }
        if (this.pendingTributeSummon) return this.handleTributeSelection(zone);

        if (!this.selectedAction) {
            this.selectCard(this.selectedCard);
            return true;
        }

        if (zone.canAccept(this.selectedCard)) this.placeMonster(zone);
        return true;
    }

    startChaosSummon() {
        const card = this.selectedCard;
        const graveyardMonsters = this.getGraveyardCards().filter(item => item.isMonster);
        const hasLight = graveyardMonsters.some(item => item.attribute === "LIGHT");
        const hasDark = graveyardMonsters.some(item => item.attribute === "DARK");
        const hasEmptyZone = this.field.zones.some(zone => zone.canAccept(card));
        if (!hasLight || !hasDark || !hasEmptyZone) {
            this.onAnnounce?.("【開闢の使者】の特殊召喚には、墓地の光・闇属性モンスター1体ずつと空きモンスターゾーンが必要です");
            return;
        }

        this.actionPanel.hide();
        this.onAnnounce?.("除外する光属性と闇属性のモンスターを1体ずつ選んでください");
        this.chaosSelectionDialog.open({
            cards: graveyardMonsters.filter(item => ["LIGHT", "DARK"].includes(item.attribute)),
            requiredCount: 2,
            maxCount: 2,
            title: card.name,
            confirmLabel: "除外して特殊召喚",
            kicker: "LIGHT + DARK",
            canConfirm: cards => cards.length === 2
                && cards.some(item => item.attribute === "LIGHT")
                && cards.some(item => item.attribute === "DARK"),
            getStatusText: cards => {
                const light = cards.some(item => item.attribute === "LIGHT") ? 1 : 0;
                const dark = cards.some(item => item.attribute === "DARK") ? 1 : 0;
                return `LIGHT ${light}/1・DARK ${dark}/1`;
            },
            onComplete: cards => this.prepareChaosSummon(card, cards)
        });
    }

    prepareChaosSummon(card, materials) {
        if (card !== this.selectedCard || !this.hand.cards.includes(card)) return;
        const graveyardCards = this.getGraveyardCards();
        if (!materials.every(material => graveyardCards.includes(material))) {
            this.onAnnounce?.("特殊召喚のための墓地モンスターを除外できませんでした");
            return;
        }
        materials.forEach(material => this.onBanishGraveyardCard?.(material));

        this.pendingChaosSummon = { card, materials };
        this.selectedAction = "chaos-summon";
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);
        this.onAnnounce?.(`【${card.name}】を特殊召喚するモンスターゾーンを選んでください`);
    }

    placeChaosMonster(zone) {
        const pending = this.pendingChaosSummon;
        const card = pending?.card;
        if (!card || card !== this.selectedCard) return;

        const placedElement = zone.placeCard(card, positionText => {
            this.onAnnounce?.(`【${card.name}】${positionText}に変更！`);
        }, {
            onMonsterClick: (placedZone, placedCard, element, onPositionChange) => {
                this.onPlacedMonsterClick?.(placedZone, placedCard, element, onPositionChange);
            }
        });

        card.controller = "player";
        card.isDefenseMode = false;
        card.wasProperlySummoned = true;
        card.placedTurn = this.turnManager.turnNumber;
        placedElement.title = `${card.name}（特殊召喚・表側攻撃表示）`;
        this.hand.removeCard(card);
        this.turnManager.markSummonPerformed("player");
        this.onCountsChanged?.();
        this.pendingChaosSummon = null;
        this.onDeselect?.();

        const materialNames = pending.materials.map(material => `【${material.name}】`).join("・");
        this.onAnnounce?.(`${materialNames}を除外し、【${card.name}】を特殊召喚！`);
        this.onMonsterSummoned?.({
            card,
            zone,
            placedElement,
            isSet: false,
            summonType: "chaos"
        });
    }

    getRequiredTributeCount(card) {
        if (!card?.isMonster || card.level <= 4) return 0;
        return card.level <= 6 ? 1 : 2;
    }

    getTributeCandidateZones() {
        return this.field.zones.filter(zone => {
            if (!zone.placedCard?.isMonster || zone.placedCard.isEquipCard) return false;
            if (zone.placedCard.cannotBeTributedForAdvanceSummon) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
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
            if (destinations.includes(zone)) {
                pending.stage = "resolving";
                this.completeAdvanceSummon(zone, pending);
            }
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

    async completeAdvanceSummon(destinationZone, pending) {
        const tributeCards = pending.selectedZones.map(zone => zone.placedCard);
        const tributes = pending.selectedZones.map(zone => ({
            zone,
            placedElement: zone.placedElement,
            card: zone.placedCard
        }));

        await Promise.all(tributes.map(({ zone, placedElement, card }) =>
            this.onSendToGraveyard?.(zone, placedElement, card, {
                announce: false,
                reason: "tribute"
            })
        ));

        this.clearTributeSelection();
        this.placeMonster(destinationZone, {
            tributeCount: pending.requiredTributes,
            tributeCards
        });
    }

    placeMonster(zone, advanceSummon = null) {
        const card = this.selectedCard;
        if (!card) return;
        const isSetting = this.selectedAction === "set";

        const placedElement = zone.placeCard(card, (positionText) => {
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
        this.turnManager.markNormalSummonUsed("player", isSetting);
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

        this.onMonsterSummoned?.({
            card,
            zone,
            placedElement,
            isSet: isSetting,
            advanceSummon
        });
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
        this.pendingChaosSummon = null;
        this.selectedCard = null;
        this.selectedAction = null;
        this.actionPanel.hide();
    }
}
