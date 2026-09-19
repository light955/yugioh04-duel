export class OpponentSpellManager {
    constructor({
        field,
        hand,
        createCard,
        onChainResponse,
        onDestroyZone,
        onSendToGraveyard,
        onFieldChanged,
        onStateChange,
        onAnnounce
    } = {}) {
        this.field = field;
        this.hand = hand;
        this.createCard = createCard;
        this.onChainResponse = onChainResponse;
        this.onDestroyZone = onDestroyZone;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onFieldChanged = onFieldChanged;
        this.onStateChange = onStateChange;
        this.onAnnounce = onAnnounce;
        this.isResolving = false;
        this.equipmentEffects = new Map();
        this.effectHandlers = new Map([
            ["OP-029", context => this.resolveSmashingGround(context)],
            ["OP-030", context => this.resolveSmashingGround(context)],
            ["OP-031", context => this.resolveUnitedWeStand(context)],
            ["OP-032", context => this.resolveMagePower(context)]
        ]);
    }

    async activateFirstAvailable() {
        const cardData = this.hand?.cards.find(card => this.canActivate(card));
        const zone = this.getEmptySpellTrapZone();
        if (!cardData || !zone || !this.createCard) return false;

        const card = this.createCard(cardData);
        if (!card) return false;

        card.owner = "opponent";
        card.controller = "opponent";
        const placedElement = zone.placeCard(card);
        placedElement.classList.add("opponent-spell-trap", "activating-card");
        placedElement.title = `${card.name}（発動中）`;
        this.hand.removeCard(cardData);
        this.onFieldChanged?.();
        this.setResolving(true);
        this.onAnnounce?.(`相手は手札から魔法カード【${card.name}】を発動！`);

        let effectResult = false;
        try {
            await this.onChainResponse?.({ card, zone, placedElement });
            await this.wait(420);
            const handler = this.effectHandlers.get(card.id);
            effectResult = await handler?.({ card, zone, placedElement }) || false;
            await this.wait(220);
        } finally {
            if (effectResult?.keepOnField && zone.placedCard === card) {
                placedElement.classList.remove("activating-card");
                placedElement.title = `${card.name}（装備中）`;
            } else if (zone.placedCard === card) {
                await this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
            }
            this.onFieldChanged?.();
            this.setResolving(false);
        }
        return true;
    }

    canActivate(card) {
        if (!this.effectHandlers.has(card?.id) || !this.getEmptySpellTrapZone()) return false;
        if (["OP-031", "OP-032"].includes(card.id)) {
            return this.getOpponentFaceUpMonsterZones().length > 0;
        }
        return this.getPlayerFaceUpMonsterZones().length > 0;
    }

    async resolveSmashingGround() {
        const targetZone = this.getHighestDefenseMonsterZone();
        if (!targetZone) {
            this.onAnnounce?.("【地砕き】で破壊できる表側表示モンスターはいません");
            return false;
        }

        const targetName = targetZone.placedCard?.name || "モンスター";
        const destroyed = await this.onDestroyZone?.(targetZone);
        this.onAnnounce?.(destroyed
            ? `【地砕き】の効果で守備力が最も高い【${targetName}】を破壊しました`
            : "【地砕き】の対象となるモンスターはフィールドを離れていました");
        return Boolean(destroyed);
    }

    resolveUnitedWeStand({ card, zone }) {
        const targetZone = this.getStrongestOpponentMonsterZone();
        const targetCard = targetZone?.placedCard;
        if (!targetCard) return false;

        this.equipmentEffects.set(card, {
            type: "united-we-stand",
            sourceCard: card,
            sourceZone: zone,
            targetCard,
            appliedAtkBonus: 0,
            appliedDefBonus: 0
        });
        this.updateContinuousEffects();
        this.onFieldChanged?.();
        this.onAnnounce?.(`相手は【団結の力】を【${targetCard.name}】に装備しました`);
        return { keepOnField: true, targetCard };
    }

    resolveMagePower({ card, zone }) {
        const targetZone = this.getStrongestOpponentMonsterZone();
        const targetCard = targetZone?.placedCard;
        if (!targetCard) return false;

        this.equipmentEffects.set(card, {
            type: "mage-power",
            sourceCard: card,
            sourceZone: zone,
            targetCard,
            appliedAtkBonus: 0,
            appliedDefBonus: 0
        });
        this.updateContinuousEffects();
        this.onFieldChanged?.();
        this.onAnnounce?.(`相手は【魔導師の力】を【${targetCard.name}】に装備しました`);
        return { keepOnField: true, targetCard };
    }

    updateContinuousEffects() {
        for (const relation of this.equipmentEffects.values()) {
            const sourceZone = this.findZoneByCard(relation.sourceCard);
            const targetZone = this.findZoneByCard(relation.targetCard);
            if (!sourceZone || !targetZone) continue;

            const bonus = relation.type === "united-we-stand"
                ? this.getOpponentFaceUpMonsterZones().length * 800
                : relation.type === "mage-power"
                    ? this.getOpponentSpellTrapZones().length * 500
                    : 0;
            relation.targetCard.atk = Math.max(
                0,
                relation.targetCard.atk - relation.appliedAtkBonus + bonus
            );
            relation.targetCard.def = Math.max(
                0,
                relation.targetCard.def - relation.appliedDefBonus + bonus
            );
            relation.appliedAtkBonus = bonus;
            relation.appliedDefBonus = bonus;
            this.updateStatsDisplay(relation.targetCard, targetZone.placedElement);
        }
    }

    async handleCardLeavesField(card) {
        const sourceRelation = this.equipmentEffects.get(card);
        if (sourceRelation) {
            this.removeEquipmentBonus(sourceRelation);
            this.equipmentEffects.delete(card);
            this.onFieldChanged?.();
            return;
        }

        const targetRelations = [...this.equipmentEffects.values()]
            .filter(relation => relation.targetCard === card);
        for (const relation of targetRelations) {
            this.equipmentEffects.delete(relation.sourceCard);
            const sourceZone = this.findZoneByCard(relation.sourceCard);
            if (sourceZone) {
                await this.onSendToGraveyard?.(
                    sourceZone,
                    sourceZone.placedElement,
                    relation.sourceCard,
                    { announce: false }
                );
            }
        }
        if (targetRelations.length > 0) this.onFieldChanged?.();
    }

    removeEquipmentBonus(relation) {
        const targetZone = this.findZoneByCard(relation.targetCard);
        if (!targetZone) return;

        relation.targetCard.atk = Math.max(0, relation.targetCard.atk - relation.appliedAtkBonus);
        relation.targetCard.def = Math.max(0, relation.targetCard.def - relation.appliedDefBonus);
        relation.appliedAtkBonus = 0;
        relation.appliedDefBonus = 0;
        this.updateStatsDisplay(relation.targetCard, targetZone.placedElement);
    }

    getStrongestOpponentMonsterZone() {
        return this.getOpponentFaceUpMonsterZones()
            .sort((a, b) => Number(b.placedCard.atk) - Number(a.placedCard.atk))[0] || null;
    }

    getOpponentFaceUpMonsterZones() {
        return this.field.zones.filter(zone => {
            const card = zone.placedCard;
            if (!card?.isMonster || card.isEquipCard) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            if (zone.placedElement?.classList.contains("face-down")) return false;

            const isOpponentZone = Boolean(zone.element.closest(".opponent-field"));
            const isOpponentExtraZone = zone.element.classList.contains("zone-emz")
                && card.controller === "opponent";
            return (isOpponentZone && card.controller === "opponent") || isOpponentExtraZone;
        });
    }

    getOpponentSpellTrapZones() {
        return this.field.zones.filter(zone => {
            const card = zone.placedCard;
            const isSpellTrapZone = zone.element.classList.contains("zone-spell")
                || zone.element.classList.contains("zone-field");
            return Boolean(zone.element.closest(".opponent-field"))
                && isSpellTrapZone
                && (card?.isSpell || card?.isTrap || card?.isEquipCard);
        });
    }

    findZoneByCard(card) {
        return this.field.zones.find(zone => zone.placedCard === card) || null;
    }

    updateStatsDisplay(card, placedElement) {
        const stats = placedElement?.querySelectorAll(".card-footer-mini span");
        if (stats?.[0]) stats[0].textContent = `ATK ${card.atk}`;
        if (stats?.[1]) stats[1].textContent = `DEF ${card.def}`;
    }

    getHighestDefenseMonsterZone() {
        return this.getPlayerFaceUpMonsterZones()
            .sort((a, b) => Number(b.placedCard.def) - Number(a.placedCard.def))[0] || null;
    }

    getPlayerFaceUpMonsterZones() {
        return this.field.zones.filter(zone => {
            const card = zone.placedCard;
            if (!card?.isMonster || card.isEquipCard) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            if (zone.placedElement?.classList.contains("face-down")) return false;

            const isPlayerZone = Boolean(zone.element.closest(".you-field"));
            const isPlayerExtraZone = zone.element.classList.contains("zone-emz")
                && card.controller !== "opponent";
            return (isPlayerZone && card.controller !== "opponent") || isPlayerExtraZone;
        });
    }

    getEmptySpellTrapZone() {
        return this.field.zones.find(zone =>
            zone.element.closest(".opponent-field")
            && zone.element.classList.contains("zone-spell")
            && !zone.isOccupied
        ) || null;
    }

    setResolving(isResolving) {
        this.isResolving = isResolving;
        this.onStateChange?.(isResolving);
    }

    wait(milliseconds) {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }
}
