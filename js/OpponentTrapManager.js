export class OpponentTrapManager {
    constructor({ field, getTurnNumber, onDamage, onDestroyZone, onSendToGraveyard, onChainResponse, onStateChange, onAnnounce } = {}) {
        this.field = field;
        this.getTurnNumber = getTurnNumber;
        this.onDamage = onDamage;
        this.onDestroyZone = onDestroyZone;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onChainResponse = onChainResponse;
        this.onStateChange = onStateChange;
        this.onAnnounce = onAnnounce;
        this.isResolving = false;
        this.wabokuProtectedTurn = null;
    }

    async respondToPlayerAttack(attacker) {
        const trapZone = this.getAttackResponseTrapZone();
        if (!trapZone || !attacker?.card || attacker.zone.placedCard !== attacker.card) return false;

        if (["OP-035", "OP-036"].includes(trapZone.placedCard.id)) {
            return this.activateMagicCylinder(trapZone, attacker);
        }
        if (trapZone.placedCard.id === "OP-037") {
            return this.activateWidespreadRuin(trapZone);
        }
        if (trapZone.placedCard.id === "OP-038") {
            return this.activateWaboku(trapZone);
        }
        return false;
    }

    getAttackResponseTrapZone() {
        const turnNumber = this.getTurnNumber?.();
        return this.field.zones
            .filter(zone =>
                zone.element.closest(".opponent-field")
                && zone.element.classList.contains("zone-spell")
                && ["OP-035", "OP-036", "OP-037", "OP-038"].includes(zone.placedCard?.id)
                && zone.placedElement?.classList.contains("face-down")
                && zone.placedCard.placedTurn !== turnNumber
            )
            .sort((a, b) => this.getAttackTrapPriority(b.placedCard) - this.getAttackTrapPriority(a.placedCard))[0] || null;
    }

    getAttackTrapPriority(card) {
        if (["OP-035", "OP-036"].includes(card?.id)) return 3;
        if (card?.id === "OP-037") return 2;
        return 1;
    }

    async activateMagicCylinder(zone, attacker) {
        const card = zone.placedCard;
        const placedElement = zone.placedElement;
        if (!card || !placedElement || attacker.zone.placedCard !== attacker.card) return false;

        this.setResolving(true);
        placedElement.classList.remove("face-down");
        placedElement.classList.add("activating-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = `${card.name}（発動中）`;
        this.onAnnounce?.(`相手はセットされていた罠カード【${card.name}】を発動！`);

        await this.onChainResponse?.({ card, zone, placedElement });

        await this.wait(420);
        if (attacker.zone.placedCard !== attacker.card) {
            this.onAnnounce?.("【魔法の筒】の対象モンスターはフィールドを離れていました");
            if (zone.placedCard === card) {
                this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
            }
            this.setResolving(false);
            return true;
        }
        const damage = Math.max(0, Number(attacker.card.atk) || 0);
        this.onDamage?.("player", damage);
        this.onAnnounce?.(`【魔法の筒】で攻撃を無効にし、自分に${damage}ダメージ！`);
        await this.wait(480);

        if (zone.placedCard === card) {
            this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
        }
        this.setResolving(false);
        return true;
    }

    async activateWidespreadRuin(zone) {
        const card = zone.placedCard;
        const placedElement = zone.placedElement;
        const targetZone = this.getHighestAttackMonster();
        if (!card || !placedElement || !targetZone) return false;

        this.setResolving(true);
        placedElement.classList.remove("face-down");
        placedElement.classList.add("activating-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = `${card.name}（発動中）`;
        this.onAnnounce?.(`相手はセットされていた罠カード【${card.name}】を発動！`);

        await this.onChainResponse?.({ card, zone, placedElement });

        await this.wait(420);
        const targetName = targetZone.placedCard?.name || "モンスター";
        const destroyed = await this.onDestroyZone?.(targetZone);
        this.onAnnounce?.(destroyed
            ? `【万能地雷グレイモヤ】の効果で【${targetName}】を破壊しました`
            : "【万能地雷グレイモヤ】の対象はフィールドを離れていました");
        await this.wait(120);

        if (zone.placedCard === card) {
            this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
        }
        this.setResolving(false);
        return false;
    }

    getHighestAttackMonster() {
        return this.field.zones
            .filter(zone => {
                const card = zone.placedCard;
                if (!card?.isMonster || card.isEquipCard || card.isDefenseMode) return false;
                if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
                if (zone.placedElement?.classList.contains("face-down")) return false;

                const isPlayerZone = Boolean(zone.element.closest(".you-field"));
                const isPlayerExtraZone = zone.element.classList.contains("zone-emz")
                    && card.controller !== "opponent";
                return isPlayerZone || isPlayerExtraZone;
            })
            .sort((a, b) => b.placedCard.atk - a.placedCard.atk)[0] || null;
    }

    async activateWaboku(zone) {
        const card = zone.placedCard;
        const placedElement = zone.placedElement;
        if (!card || !placedElement) return false;

        this.setResolving(true);
        placedElement.classList.remove("face-down");
        placedElement.classList.add("activating-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = `${card.name}（発動中）`;
        this.onAnnounce?.(`相手はセットされていた罠カード【${card.name}】を発動！`);

        await this.onChainResponse?.({ card, zone, placedElement });

        await this.wait(420);
        this.wabokuProtectedTurn = this.getTurnNumber?.();
        this.onAnnounce?.("【和睦の使者】により、このターン相手モンスターは戦闘で破壊されず、相手への戦闘ダメージは0になります");
        await this.wait(480);

        if (zone.placedCard === card) {
            this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
        }
        this.setResolving(false);
        return false;
    }

    isBattleProtected() {
        return this.wabokuProtectedTurn === this.getTurnNumber?.();
    }

    setResolving(isResolving) {
        this.isResolving = isResolving;
        this.onStateChange?.(isResolving);
    }

    wait(milliseconds) {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }
}
