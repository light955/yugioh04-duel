export class OpponentAI {
    constructor({ field, hand, turnManager, createCard, isAttackLocked, onAnnounce, onMonsterClick, onMonsterSummoned, onActivateSpell, onActionResolved, onFieldChanged, onSendToGraveyard, onBattle } = {}) {
        this.field = field;
        this.hand = hand;
        this.turnManager = turnManager;
        this.createCard = createCard;
        this.isAttackLocked = isAttackLocked || (() => false);
        this.onAnnounce = onAnnounce;
        this.onMonsterClick = onMonsterClick;
        this.onMonsterSummoned = onMonsterSummoned;
        this.onActivateSpell = onActivateSpell;
        this.onActionResolved = onActionResolved;
        this.onFieldChanged = onFieldChanged;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onBattle = onBattle;
    }

    handlePhaseChange(activePlayer, phase) {
        if (activePlayer !== "opponent") return;
        if (phase === "MAIN 1") return this.playMainPhase();
        if (phase === "BATTLE") return this.attack();
    }

    async playMainPhase() {
        const summoned = await this.normalSummon();
        await this.wait(summoned ? 520 : 280);
        const activatedSpell = await this.onActivateSpell?.();
        if (activatedSpell) await this.wait(420);
        const setAction = this.setSpellTrap();
        if (setAction) {
            await this.onActionResolved?.(setAction);
            await this.wait(420);
        }
        const changedPosition = this.prepareBattlePositions();
        if (changedPosition) {
            await this.onActionResolved?.({ type: "position-change" });
            await this.wait(320);
        }
        return summoned || Boolean(activatedSpell) || Boolean(setAction) || changedPosition;
    }

    attack() {
        if (this.isAttackLocked("opponent")) {
            this.onAnnounce?.("【光の護封剣】の効果により、相手は攻撃を行えません");
            return false;
        }
        if (this.getAttackPlans().length === 0) {
            this.onAnnounce?.("相手は攻撃を行いませんでした");
            return false;
        }

        return this.attackNext();
    }

    async attackNext() {
        if (this.turnManager.activePlayer !== "opponent" || this.turnManager.currentPhase !== "BATTLE") {
            return;
        }
        if (this.isAttackLocked("opponent")) return false;

        const plan = this.getAttackPlans()[0];
        if (!plan) return;

        const { attackerZone, defenderZone } = plan;
        const attacked = await this.onBattle?.(attackerZone, defenderZone);
        if (!attacked) return;

        if (this.getAttackPlans().length > 0) {
            await new Promise(resolve => window.setTimeout(resolve, 350));
            await this.attackNext();
        }
        return true;
    }

    getAttackPlans() {
        return this.getAttackers()
            .map(attackerZone => this.createAttackPlan(attackerZone))
            .filter(Boolean)
            .sort((a, b) => {
                if (a.priority !== b.priority) return b.priority - a.priority;
                if (a.targetValue !== b.targetValue) return b.targetValue - a.targetValue;
                return b.attackerZone.placedCard.atk - a.attackerZone.placedCard.atk;
            });
    }

    createAttackPlan(attackerZone) {
        const defenders = this.getPlayerMonsters();
        if (defenders.length === 0) {
            return { attackerZone, defenderZone: null, priority: 3, targetValue: 0 };
        }

        const attackerAtk = attackerZone.placedCard.atk;
        const targets = defenders
            .map(zone => ({ zone, value: this.getTargetValue(zone) }))
            .filter(target => attackerAtk >= target.value)
            .sort((a, b) => {
                const aWinning = attackerAtk > a.value;
                const bWinning = attackerAtk > b.value;
                if (aWinning !== bWinning) return Number(bWinning) - Number(aWinning);
                return b.value - a.value;
            });
        const target = targets[0];
        if (!target) return null;

        return {
            attackerZone,
            defenderZone: target.zone,
            priority: attackerAtk > target.value ? 2 : 1,
            targetValue: target.value
        };
    }

    getAttackers() {
        const turnNumber = this.turnManager.turnNumber;
        return this.field.zones.filter(zone =>
            zone.element.closest(".opponent-field") &&
            zone.element.classList.contains("zone-monster") &&
            zone.placedCard?.isMonster &&
            !zone.placedCard.isDefenseMode &&
            !zone.placedElement?.classList.contains("face-down") &&
            zone.placedCard.lastAttackTurn !== turnNumber
        );
    }

    getPlayerMonsters() {
        return this.field.zones.filter(zone => {
            if (!zone.placedCard?.isMonster || zone.placedCard.isEquipCard) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            const isPlayerZone = Boolean(zone.element.closest(".you-field"));
            const isPlayerEMZ = zone.element.classList.contains("zone-emz")
                && zone.placedCard.controller !== "opponent";
            return isPlayerZone || isPlayerEMZ;
        });
    }

    getTargetValue(zone) {
        if (zone.placedElement?.classList.contains("face-down")) return 0;
        return zone.placedCard.isDefenseMode ? zone.placedCard.def : zone.placedCard.atk;
    }

    prepareBattlePositions() {
        const defenders = this.getPlayerMonsters();
        const turnNumber = this.turnManager.turnNumber;
        let changed = false;

        this.getOpponentMonsterZones().forEach(zone => {
            const card = zone.placedCard;
            const placedElement = zone.placedElement;
            if (!card || !placedElement || placedElement.classList.contains("face-down")) return;
            if (card.placedTurn === turnNumber
                || card.lastPositionChangeTurn === turnNumber
                || Number(card.positionLockedUntilTurn) >= turnNumber) return;

            const canAttackSafely = defenders.length === 0
                || defenders.some(defender => card.atk >= this.getTargetValue(defender));
            const useDefenseMode = !canAttackSafely;
            if (card.isDefenseMode === useDefenseMode) return;

            card.setBattlePosition(placedElement, useDefenseMode);
            card.lastPositionChangeTurn = turnNumber;
            placedElement.title = `${card.name}（${useDefenseMode ? "表側守備表示" : "表側攻撃表示"}）`;
            this.onAnnounce?.(`相手は【${card.name}】を${useDefenseMode ? "守備" : "攻撃"}表示に変更しました`);
            changed = true;
        });

        if (changed) this.onFieldChanged?.();
        return changed;
    }

    getOpponentMonsterZones() {
        return this.field.zones.filter(zone =>
            zone.element.closest(".opponent-field")
            && zone.element.classList.contains("zone-monster")
            && zone.placedCard?.isMonster
            && !zone.placedCard.isEquipCard
        );
    }

    async normalSummon() {
        if (this.turnManager.hasNormalSummoned) return false;

        const advancePlan = this.getAdvanceSummonPlan();
        if (advancePlan) return this.advanceSummon(advancePlan);

        const zone = this.getEmptyMonsterZone();
        const cardData = this.getSummonCandidate();
        if (!zone || !cardData || !this.createCard) {
            this.onAnnounce?.("相手は通常召喚を行いませんでした");
            return false;
        }

        const card = this.createCard(cardData);
        if (!card) return false;

        const shouldSet = this.shouldSetMonster(card);
        card.owner = "opponent";
        card.controller = "opponent";
        card.placedTurn = this.turnManager.turnNumber;
        const placedElement = zone.placeCard(card, null, {
            faceDown: shouldSet,
            onMonsterClick: (clickedZone, placedCard, element) => {
                this.onMonsterClick?.(clickedZone, placedCard, element);
            }
        });
        placedElement.classList.add("opponent-monster");
        placedElement.title = shouldSet ? "相手のセットモンスター" : `${card.name}（表側攻撃表示）`;

        this.hand.removeCard(cardData);
        this.turnManager.markNormalSummonUsed("opponent", shouldSet);
        this.onFieldChanged?.();
        this.onAnnounce?.(shouldSet
            ? "相手はモンスターを裏側守備表示でセットしました"
            : `相手は【${card.name}】を通常召喚！`);
        await this.onMonsterSummoned?.({
            zone,
            card,
            placedElement,
            summonType: shouldSet ? "set" : "normal",
            isSet: shouldSet
        });
        return true;
    }

    getAdvanceSummonPlan() {
        const tributeZones = this.getTributeCandidateZones()
            .sort((a, b) => this.getTributeValue(a) - this.getTributeValue(b));
        const candidates = this.hand.cards
            .filter(card => {
                if (card.cardType !== "monster" || Number(card.level) < 5) return false;
                const subTypes = card.subTypes || [];
                return !subTypes.includes("儀式") && !subTypes.includes("特殊召喚");
            })
            .sort((a, b) => Number(b.atk) - Number(a.atk));

        for (const cardData of candidates) {
            const requiredTributes = this.getRequiredTributeCount(cardData);
            if (tributeZones.length >= requiredTributes) {
                return {
                    cardData,
                    requiredTributes,
                    tributeZones: tributeZones.slice(0, requiredTributes)
                };
            }
        }
        return null;
    }

    getRequiredTributeCount(card) {
        const level = Number(card?.level) || 0;
        if (level <= 4) return 0;
        return level <= 6 ? 1 : 2;
    }

    getTributeCandidateZones() {
        return this.getOpponentMonsterZones().filter(zone =>
            !zone.placedCard?.cannotBeTributedForAdvanceSummon
        );
    }

    getTributeValue(zone) {
        const card = zone.placedCard;
        if (zone.placedElement?.classList.contains("face-down")) {
            return Math.max(card.atk, card.def);
        }
        return card.isDefenseMode ? card.def : card.atk;
    }

    async advanceSummon({ cardData, requiredTributes, tributeZones }) {
        const card = this.createCard?.(cardData);
        if (!card) return false;

        const tributes = tributeZones.map(zone => ({
            zone,
            card: zone.placedCard,
            placedElement: zone.placedElement
        }));
        await Promise.all(tributes.map(({ zone, card: tributeCard, placedElement }) => {
            if (this.onSendToGraveyard) {
                return this.onSendToGraveyard(zone, placedElement, tributeCard, {
                    announce: false,
                    reason: "tribute"
                });
            }
            zone.clearPlacedCard(placedElement);
            return true;
        }));

        const destinationZone = this.getEmptyMonsterZone();
        if (!destinationZone) {
            this.onAnnounce?.("アドバンス召喚するモンスターゾーンを確保できませんでした");
            return false;
        }

        const shouldSet = this.shouldSetMonster(card);
        card.owner = "opponent";
        card.controller = "opponent";
        card.placedTurn = this.turnManager.turnNumber;
        const placedElement = destinationZone.placeCard(card, null, {
            faceDown: shouldSet,
            onMonsterClick: (clickedZone, placedCard, element) => {
                this.onMonsterClick?.(clickedZone, placedCard, element);
            }
        });
        placedElement.classList.add("opponent-monster");
        placedElement.title = shouldSet ? "相手のセットモンスター" : `${card.name}（アドバンス召喚・表側攻撃表示）`;

        this.hand.removeCard(cardData);
        this.turnManager.markNormalSummonUsed("opponent", shouldSet);
        this.onFieldChanged?.();

        if (shouldSet) {
            this.onAnnounce?.(`相手はモンスターを${requiredTributes}体リリースして、モンスターをアドバンスセットしました`);
        } else {
            const tributeNames = tributes.map(tribute => `【${tribute.card.name}】`).join("・");
            this.onAnnounce?.(`相手は${tributeNames}をリリースして【${card.name}】をアドバンス召喚！`);
        }

        await this.onMonsterSummoned?.({
            zone: destinationZone,
            card,
            placedElement,
            summonType: shouldSet ? "advance-set" : "advance",
            isSet: shouldSet,
            advanceSummon: {
                tributeCount: requiredTributes,
                tributeCards: tributes.map(tribute => tribute.card)
            }
        });
        return true;
    }

    shouldSetMonster(card) {
        const defenders = this.getPlayerMonsters();
        return defenders.length > 0
            && defenders.every(zone => card.atk < this.getTargetValue(zone));
    }

    getSummonCandidate() {
        return this.hand.cards
            .filter(card => card.cardType === "monster" && Number(card.level) <= 4)
            .sort((a, b) => Number(b.atk) - Number(a.atk))[0] || null;
    }

    getEmptyMonsterZone() {
        return this.field.zones.find(zone =>
            zone.element.closest(".opponent-field") &&
            zone.element.classList.contains("zone-monster") &&
            !zone.isOccupied
        ) || null;
    }

    setSpellTrap() {
        const cardData = this.getSetCandidate();
        if (!cardData || !this.createCard) return false;

        const zone = this.getEmptySpellTrapZone(cardData);
        if (!zone) return false;

        const card = this.createCard(cardData);
        if (!card) return false;

        card.owner = "opponent";
        card.controller = "opponent";
        card.placedTurn = this.turnManager.turnNumber;
        const placedElement = zone.placeCard(card, null, { faceDown: true });
        placedElement.classList.add("opponent-spell-trap");
        placedElement.title = "相手のセットカード";

        this.hand.removeCard(cardData);
        this.onFieldChanged?.();
        this.onAnnounce?.("相手は魔法・罠カードを1枚セットしました");
        return { type: "set-spell-trap", zone, card, placedElement };
    }

    getSetCandidate() {
        return this.hand.cards
            .filter(card => card.cardType === "spell" || card.cardType === "trap")
            .sort((a, b) => this.getSetPriority(b) - this.getSetPriority(a))
            .find(card => this.getEmptySpellTrapZone(card)) || null;
    }

    getSetPriority(cardData) {
        if (cardData.cardType === "trap") return 3;
        if (cardData.subTypes?.includes("速攻魔法")) return 2;
        return 1;
    }

    getEmptySpellTrapZone(cardData) {
        const isFieldSpell = cardData.subTypes?.includes("フィールド魔法");
        const zoneClass = isFieldSpell ? "zone-field" : "zone-spell";
        return this.field.zones.find(zone =>
            zone.element.closest(".opponent-field")
            && zone.element.classList.contains(zoneClass)
            && !zone.isOccupied
        ) || null;
    }

    wait(milliseconds) {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
    }
}
