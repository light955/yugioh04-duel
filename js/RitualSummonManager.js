import { CardSelectionDialog } from "./CardSelectionDialog.js?v=4";

export class RitualSummonManager {
    constructor({
        getHandCards,
        getPlayerMonsterZones,
        hasEmptyPlayerMonsterZone,
        canSpecialSummon,
        onReleaseHandCard,
        onReleaseFieldCard,
        onRitualSummon,
        onAnnounce
    } = {}) {
        this.getHandCards = getHandCards || (() => []);
        this.getPlayerMonsterZones = getPlayerMonsterZones || (() => []);
        this.hasEmptyPlayerMonsterZone = hasEmptyPlayerMonsterZone || (() => false);
        this.canSpecialSummon = canSpecialSummon || (() => true);
        this.onReleaseHandCard = onReleaseHandCard;
        this.onReleaseFieldCard = onReleaseFieldCard;
        this.onRitualSummon = onRitualSummon;
        this.onAnnounce = onAnnounce;
        this.selectionDialog = new CardSelectionDialog();
        this.rituals = new Map([
            ["04-026", "04-025"]
        ]);
    }

    canActivate(ritualSpell) {
        if (!this.canSpecialSummon()) {
            this.onAnnounce?.("【スケープ・ゴート】を発動したターンは儀式召喚できません");
            return false;
        }

        const ritualMonster = this.getRitualMonster(ritualSpell);
        if (!ritualMonster) {
            this.onAnnounce?.(`【${ritualSpell.name}】に対応する儀式モンスターが手札にありません`);
            return false;
        }

        const fieldMaterials = this.getPlayerMonsterZones();
        const materials = this.getMaterialCards(ritualMonster, fieldMaterials);
        const totalLevel = materials.reduce((sum, card) => sum + card.level, 0);
        if (totalLevel < ritualMonster.level) {
            this.onAnnounce?.(`【${ritualMonster.name}】の儀式召喚に必要なレベルの素材がありません`);
            return false;
        }

        if (!this.hasEmptyPlayerMonsterZone() && fieldMaterials.length === 0) {
            this.onAnnounce?.("儀式召喚できるモンスターゾーンがありません");
            return false;
        }
        return true;
    }

    resolve(ritualSpell) {
        if (!this.canSpecialSummon()) return Promise.resolve(false);

        const ritualMonster = this.getRitualMonster(ritualSpell);
        const fieldZones = this.getPlayerMonsterZones();
        const materials = this.getMaterialCards(ritualMonster, fieldZones);
        if (!ritualMonster || materials.length === 0) return Promise.resolve(false);

        const requiredLevel = ritualMonster.level;
        const requiresFieldMaterial = !this.hasEmptyPlayerMonsterZone();
        const includesFieldMaterial = cards => cards.some(card =>
            fieldZones.some(zone => zone.placedCard === card)
        );
        this.onAnnounce?.(`【${ritualMonster.name}】の儀式素材を選んでください`);
        return new Promise(resolve => {
            this.selectionDialog.open({
                cards: materials,
                requiredCount: 1,
                maxCount: materials.length,
                title: ritualSpell.name,
                confirmLabel: "儀式召喚",
                kicker: "RITUAL SUMMON",
                canConfirm: cards => this.getTotalLevel(cards) >= requiredLevel
                    && (!requiresFieldMaterial || includesFieldMaterial(cards)),
                getStatusText: cards => {
                    const levelText = `LEVEL ${this.getTotalLevel(cards)} / ${requiredLevel}`;
                    if (!requiresFieldMaterial) return levelText;
                    return `${levelText}・FIELD ${includesFieldMaterial(cards) ? 1 : 0} / 1`;
                },
                onComplete: cards => this.completeRitualSummon(cards, ritualMonster, fieldZones, resolve)
            });
        });
    }

    getRitualMonster(ritualSpell) {
        const monsterId = this.rituals.get(ritualSpell?.id);
        return this.getHandCards().find(card => card.id === monsterId) || null;
    }

    getMaterialCards(ritualMonster, fieldZones = this.getPlayerMonsterZones()) {
        const handMaterials = this.getHandCards()
            .filter(card => card.isMonster && card !== ritualMonster);
        return [...handMaterials, ...fieldZones.map(zone => zone.placedCard).filter(Boolean)];
    }

    getTotalLevel(cards) {
        return cards.reduce((sum, card) => sum + Number(card.level || 0), 0);
    }

    async completeRitualSummon(materials, ritualMonster, fieldZones, resolve) {
        const materialNames = materials.map(card => `【${card.name}】`).join("・");
        await Promise.all(materials.map(card => {
            const zone = fieldZones.find(item => item.placedCard === card);
            return zone
                ? this.onReleaseFieldCard?.(zone)
                : this.onReleaseHandCard?.(card);
        }));

        const summoned = this.onRitualSummon?.(ritualMonster);
        if (summoned) {
            this.onAnnounce?.(`${materialNames}をリリース！【${ritualMonster.name}】を儀式召喚！`);
        } else {
            this.onAnnounce?.(`【${ritualMonster.name}】を儀式召喚できませんでした`);
        }
        resolve(Boolean(summoned));
    }
}
