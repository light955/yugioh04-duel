import { TrapActivationDialog } from "./TrapActivationDialog.js?v=4";
import { CardSelectionDialog } from "./CardSelectionDialog.js?v=4";

export class MonsterEffectManager {
    constructor({ field, targetManager, getTurnNumber, isPlayerTurn, getDeckCards, getPlayerGraveyardCards, createCard, onAddCardFromDeck, onReturnGraveyardCardToHand, onDestroyZone, onBanishZone, onEquipMonster, onSendEquipToGraveyard, onStateChange, onAnnounce } = {}) {
        this.field = field;
        this.targetManager = targetManager;
        this.getTurnNumber = getTurnNumber;
        this.isPlayerTurn = isPlayerTurn;
        this.getDeckCards = getDeckCards || (() => []);
        this.getPlayerGraveyardCards = getPlayerGraveyardCards || (() => []);
        this.createCard = createCard;
        this.onAddCardFromDeck = onAddCardFromDeck;
        this.onReturnGraveyardCardToHand = onReturnGraveyardCardToHand;
        this.onDestroyZone = onDestroyZone;
        this.onBanishZone = onBanishZone;
        this.onEquipMonster = onEquipMonster;
        this.onSendEquipToGraveyard = onSendEquipToGraveyard;
        this.onStateChange = onStateChange;
        this.onAnnounce = onAnnounce;
        this.isResolving = false;
        this.sacrificeEquipments = new Map();
        this.effectActivationDialog = new TrapActivationDialog();
        this.deckSearchDialog = new CardSelectionDialog();
        this.graveyardTriggerQueue = Promise.resolve();
    }

    handleSummon({ card, zone, placedElement, isSet, advanceSummon }) {
        if (card.id === "04-001" && !isSet) {
            this.addBreakerCounter(card, placedElement);
        }

        if (card.id === "04-010" && !isSet && advanceSummon?.tributeCards?.length) {
            const tribute = advanceSummon.tributeCards[0];
            card.atk = tribute.originalAtk * 2;
            this.updateAttackDisplay(card, placedElement);
            this.onAnnounce?.(`【偉大魔獣 ガーゼット】の攻撃力は${card.atk}になりました！`);
        }
    }

    canActivate(card) {
        if (card?.id === "04-001") {
            return card.spellCounters > 0 && this.getSpellTrapTargets().length > 0;
        }
        if (card?.id === "04-025") {
            return card.lastEffectTurn !== this.getTurnNumber?.()
                && !this.sacrificeEquipments.has(card)
                && this.getOpponentMonsterTargets(card).length > 0
                && Boolean(this.getEmptySpellTrapZone(card.controller));
        }
        if (card?.id === "04-031") {
            const turnNumber = this.getTurnNumber?.();
            return card.lastEffectTurn !== turnNumber
                && card.lastDeclaredAttackTurn !== turnNumber
                && this.getBanishTargets(card).length > 0;
        }
        return false;
    }

    activate({ card, zone, placedElement }) {
        if (card?.id === "04-031") {
            return this.activateChaosSoldier(card);
        }
        if (card?.id === "04-025") {
            return this.activateSacrifice(card, zone, placedElement);
        }

        if (!this.canActivate(card)) {
            this.onAnnounce?.("破壊できる魔法・罠カードがないか、魔力カウンターがありません");
            return false;
        }

        this.setResolving(true);
        const started = this.targetManager.start({
            targets: this.getSpellTrapTargets(),
            prompt: "ブレイカーの効果で破壊する魔法・罠カードを選んでください",
            onSelect: zone => this.resolveBreaker(card, placedElement, zone)
        });
        if (!started) this.setResolving(false);
        return started;
    }

    activateChaosSoldier(card) {
        if (!this.canActivate(card)) {
            this.onAnnounce?.("除外できるモンスターがないか、このターンはすでに攻撃・効果発動を行っています");
            return false;
        }

        this.setResolving(true);
        const started = this.targetManager.start({
            targets: this.getBanishTargets(card),
            prompt: "開闢の使者の効果で除外するモンスターを選んでください",
            onSelect: targetZone => this.resolveChaosSoldierBanish(card, targetZone)
        });
        if (!started) this.setResolving(false);
        return started;
    }

    async resolveChaosSoldierBanish(card, targetZone) {
        const targetName = targetZone.placedCard?.name || "モンスター";
        card.lastEffectTurn = this.getTurnNumber?.();
        card.cannotAttackTurn = this.getTurnNumber?.();
        const banished = await this.onBanishZone?.(targetZone);
        this.onAnnounce?.(banished
            ? `【開闢の使者】の効果で【${targetName}】を除外しました。このターンは攻撃できません`
            : "除外するモンスターはフィールドを離れていました");
        this.setResolving(false);
        return Boolean(banished);
    }

    handleAttackStarted(card) {
        const turnNumber = this.getTurnNumber?.();
        card.lastDeclaredAttackTurn = turnNumber;
        if (card.extraAttackAvailableTurn === turnNumber) {
            card.extraAttackAvailableTurn = null;
            card.extraAttackUsedTurn = turnNumber;
        }
    }

    handleBattleDestruction({ attacker, attackerController, destroyed } = {}) {
        const card = attacker?.card;
        const turnNumber = this.getTurnNumber?.();
        if (!destroyed
            || attackerController !== "player"
            || card?.id !== "04-031"
            || attacker.zone?.placedCard !== card
            || card.lastEffectTurn === turnNumber
            || card.extraAttackUsedTurn === turnNumber
            || card.extraAttackAvailableTurn === turnNumber) {
            return false;
        }

        card.extraAttackAvailableTurn = turnNumber;
        card.lastAttackTurn = null;
        this.onAnnounce?.("【開闢の使者】はモンスターを戦闘破壊したため、もう1度だけ続けて攻撃できます");
        return true;
    }

    async handleAfterDamageCalculation({ attacker, defender } = {}) {
        const participants = [attacker, defender].filter(target =>
            target?.card?.id === "04-002"
        );
        if (participants.length === 0) return false;

        for (const warrior of participants) {
            if (warrior.zone?.placedCard !== warrior.card
                || attacker?.zone?.placedCard !== attacker.card
                || defender?.zone?.placedCard !== defender.card) {
                continue;
            }

            const isPlayerControlled = warrior.card.controller !== "opponent";
            const shouldActivate = isPlayerControlled
                ? await this.effectActivationDialog.open({
                    card: warrior.card,
                    message: `戦闘を行った【${attacker.card.name}】と【${defender.card.name}】を除外できます`,
                    kicker: "DAMAGE STEP EFFECT",
                    title: "異次元の女戦士の効果を発動しますか？",
                    activateLabel: "除外する"
                })
                : true;
            if (!shouldActivate) continue;

            this.setResolving(true);
            const cardNames = `【${attacker.card.name}】と【${defender.card.name}】`;
            try {
                const results = await Promise.all([
                    this.onBanishZone?.(attacker.zone),
                    this.onBanishZone?.(defender.zone)
                ]);
                const banished = results.filter(Boolean).length;
                if (banished === 2) {
                    this.onAnnounce?.(`【異次元の女戦士】の効果で${cardNames}を除外しました`);
                    return true;
                }
                return false;
            } finally {
                this.setResolving(false);
            }
        }

        return false;
    }

    activateSacrifice(card, sourceZone, placedElement) {
        if (!this.canActivate(card)) {
            this.onAnnounce?.("装備できる相手モンスターがないか、このターンはすでに効果を使用しています");
            return false;
        }

        this.setResolving(true);
        const started = this.targetManager.start({
            targets: this.getOpponentMonsterTargets(card),
            prompt: "サクリファイスに装備する相手モンスターを選んでください",
            onSelect: targetZone => this.resolveSacrifice(card, sourceZone, placedElement, targetZone)
        });
        if (!started) this.setResolving(false);
        return started;
    }

    resolveSacrifice(card, sourceZone, placedElement, targetZone) {
        const targetCard = targetZone?.placedCard;
        if (!targetCard || sourceZone?.placedCard !== card) {
            this.setResolving(false);
            return false;
        }

        const equipped = this.onEquipMonster?.({ sourceCard: card, sourceZone, targetZone });
        if (!equipped) {
            this.onAnnounce?.("装備するための魔法・罠ゾーンがありません");
            this.setResolving(false);
            return false;
        }

        card.lastEffectTurn = this.getTurnNumber?.();
        card.atk = targetCard.atk;
        card.def = targetCard.def;
        this.sacrificeEquipments.set(card, {
            sourceCard: card,
            targetCard,
            targetZone: equipped.zone
        });
        this.updateStatsDisplay(card, placedElement);
        this.showSacrificeEquipBadge(placedElement);
        this.onAnnounce?.(`【サクリファイス】が【${targetCard.name}】を装備！攻撃力${card.atk}・守備力${card.def}になりました`);
        this.setResolving(false);
        return true;
    }

    async resolveBreaker(card, placedElement, targetZone) {
        const targetName = targetZone.placedCard?.name || "カード";
        card.spellCounters = 0;
        card.atk = card.originalAtk;
        placedElement.querySelector(".spell-counter-badge")?.remove();
        this.updateAttackDisplay(card, placedElement);
        await this.onDestroyZone?.(targetZone);
        this.onAnnounce?.(`魔力カウンターを取り除き、【${targetName}】を破壊しました`);
        this.setResolving(false);
    }

    handleFlip({ card, reason = "flip-summon" } = {}) {
        if (card?.id !== "04-008") return false;

        const targets = this.getMonsterTargets();
        if (!targets.length) {
            this.onAnnounce?.("【人喰い虫】の効果で破壊できるモンスターはいません");
            return false;
        }

        if (reason === "battle" || card.controller === "opponent") {
            const target = this.getAutomaticManEaterTarget(card, targets);
            return target ? this.resolveManEaterBug(target, true) : false;
        }

        this.setResolving(true);
        return this.targetManager.start({
            targets,
            prompt: "人喰い虫の効果で破壊するモンスターを選んでください",
            onSelect: zone => this.resolveManEaterBug(zone, false)
        });
    }

    async resolveManEaterBug(targetZone, automatic) {
        const targetName = targetZone.placedCard?.name || "モンスター";
        if (automatic) this.setResolving(true);
        await this.onDestroyZone?.(targetZone);
        this.onAnnounce?.(`【人喰い虫】のリバース効果で【${targetName}】を破壊しました`);
        this.setResolving(false);
        return true;
    }

    addBreakerCounter(card, placedElement) {
        card.spellCounters = 1;
        card.atk = card.originalAtk + 300;
        this.updateAttackDisplay(card, placedElement);

        const badge = document.createElement("span");
        badge.className = "spell-counter-badge";
        badge.textContent = "1";
        badge.title = "魔力カウンター 1";
        placedElement.appendChild(badge);
        this.onAnnounce?.("【魔導戦士 ブレイカー】に魔力カウンターを1つ置き、攻撃力が1900になりました");
    }

    updateAttackDisplay(card, placedElement) {
        const attackTag = placedElement.querySelector(".card-footer-mini span:first-child");
        if (attackTag) attackTag.textContent = `ATK ${card.atk}`;
    }

    updateStatsDisplay(card, placedElement) {
        const stats = placedElement?.querySelectorAll(".card-footer-mini span");
        if (stats?.[0]) stats[0].textContent = `ATK ${card.atk}`;
        if (stats?.[1]) stats[1].textContent = `DEF ${card.def}`;
    }

    showSacrificeEquipBadge(placedElement) {
        placedElement.querySelector(".sacrifice-equip-badge")?.remove();
        const badge = document.createElement("span");
        badge.className = "spell-counter-badge sacrifice-equip-badge";
        badge.textContent = "E";
        badge.title = "装備モンスターあり";
        placedElement.appendChild(badge);
    }

    isSharingBattleDamage(card) {
        return card?.id === "04-025" && this.sacrificeEquipments.has(card);
    }

    async replaceBattleDestruction({ card } = {}) {
        const relation = this.sacrificeEquipments.get(card);
        if (!relation) return false;

        const targetZone = this.findZoneByCard(relation.targetCard);
        if (!targetZone) return false;

        const targetName = relation.targetCard.name;
        const destroyed = await this.onDestroyZone?.(targetZone, {
            reason: "battle-replacement"
        });
        if (!destroyed) return false;

        this.onAnnounce?.(`【サクリファイス】の代わりに、装備していた【${targetName}】を破壊しました`);
        return true;
    }

    async handleCardLeavesField(card, { reason = "send" } = {}) {
        if (card?.id === "04-009") card.positionLockedUntilTurn = null;

        const sourceRelation = this.sacrificeEquipments.get(card);
        if (sourceRelation) {
            this.sacrificeEquipments.delete(card);
            const targetZone = this.findZoneByCard(sourceRelation.targetCard);
            if (targetZone) {
                sourceRelation.targetCard.isEquipCard = false;
                sourceRelation.targetCard.equippedTo = null;
                await this.onSendEquipToGraveyard?.(targetZone);
            }
            return;
        }

        const targetRelation = [...this.sacrificeEquipments.values()]
            .find(relation => relation.targetCard === card);
        if (!targetRelation) return;

        this.sacrificeEquipments.delete(targetRelation.sourceCard);
        card.isEquipCard = false;
        card.equippedTo = null;
        const sourceZone = this.findZoneByCard(targetRelation.sourceCard);
        if (!sourceZone) return;

        targetRelation.sourceCard.atk = targetRelation.sourceCard.originalAtk;
        targetRelation.sourceCard.def = targetRelation.sourceCard.originalDef;
        this.updateStatsDisplay(targetRelation.sourceCard, sourceZone.placedElement);
        sourceZone.placedElement?.querySelector(".sacrifice-equip-badge")?.remove();
        if (reason !== "battle-replacement") {
            this.onAnnounce?.("装備モンスターがフィールドを離れたため、【サクリファイス】の攻撃力・守備力は0になりました");
        }
    }

    handleCardSentToGraveyard(card) {
        if (!["04-027", "04-028"].includes(card?.id)) return Promise.resolve(false);

        const resolution = this.graveyardTriggerQueue.then(() => this.resolveDeckSearch(card));
        this.graveyardTriggerQueue = resolution.catch(() => false);
        return resolution;
    }

    resolveDeckSearch(sourceCard) {
        const searchesAttack = sourceCard.id === "04-027";
        const statName = searchesAttack ? "攻撃力" : "守備力";
        const statKey = searchesAttack ? "atk" : "def";
        const candidates = this.getDeckCards().filter(cardData =>
            cardData.cardType === "monster" && Number(cardData[statKey]) <= 1500
        );

        if (candidates.length === 0) {
            this.onAnnounce?.(`【${sourceCard.name}】の効果で手札に加えられる${statName}1500以下のモンスターがいません`);
            return Promise.resolve(false);
        }

        const previewCards = candidates.map(cardData => ({
            card: this.createCard?.(cardData),
            cardData
        })).filter(item => item.card);
        if (previewCards.length === 0) return Promise.resolve(false);

        this.setResolving(true);
        this.onAnnounce?.(`【${sourceCard.name}】の効果で手札に加えるモンスターを選んでください`);
        return new Promise(resolve => {
            this.deckSearchDialog.open({
                cards: previewCards.map(item => item.card),
                requiredCount: 1,
                title: sourceCard.name,
                confirmLabel: "手札に加える",
                kicker: "SEARCH YOUR DECK",
                onComplete: cards => {
                    const selected = previewCards.find(item => item.card === cards[0]);
                    const added = Boolean(selected && this.onAddCardFromDeck?.(selected.cardData));
                    this.onAnnounce?.(added
                        ? `【${sourceCard.name}】の効果で【${selected.card.name}】を手札に加えました`
                        : `【${sourceCard.name}】のサーチに失敗しました`);
                    this.setResolving(false);
                    resolve(added);
                }
            });
        });
    }

    async handlePhaseChange(activePlayer, phase) {
        if (phase === "MAIN 2") this.resolveGoblinAttackForce(activePlayer);
        if (activePlayer !== "player" || phase !== "STANDBY") return false;

        const snakes = [...this.getPlayerGraveyardCards()]
            .filter(card => card.id === "04-029");
        let returnedCount = 0;

        for (const card of snakes) {
            if (!this.getPlayerGraveyardCards().includes(card)) continue;

            this.setResolving(true);
            const shouldReturn = await this.effectActivationDialog.open({
                card,
                message: "墓地のこのカードを手札に戻すことができます",
                kicker: "STANDBY PHASE EFFECT",
                title: "キラー・スネークの効果を発動しますか？",
                activateLabel: "手札に戻す"
            });

            if (shouldReturn && this.onReturnGraveyardCardToHand?.(card)) {
                returnedCount += 1;
                this.onAnnounce?.("【キラー・スネーク】の効果で墓地から手札に戻しました");
            } else if (!shouldReturn) {
                this.onAnnounce?.("【キラー・スネーク】の効果発動を見送りました");
            }
            this.setResolving(false);
        }

        return returnedCount > 0;
    }

    resolveGoblinAttackForce(activePlayer) {
        const turnNumber = this.getTurnNumber?.();
        const targets = this.field.zones.filter(zone => {
            const card = zone.placedCard;
            const controller = card?.controller === "opponent" ? "opponent" : "player";
            return card?.id === "04-009"
                && controller === activePlayer
                && card.lastAttackTurn === turnNumber
                && !zone.placedElement?.classList.contains("face-down");
        });

        targets.forEach(zone => {
            const { placedCard: card, placedElement } = zone;
            card.setBattlePosition(placedElement, true);
            card.positionLockedUntilTurn = turnNumber + 2;
            placedElement.title = `${card.name}（効果で守備表示・表示形式変更不可）`;
            this.onAnnounce?.(`【ゴブリン突撃部隊】は攻撃したため守備表示になり、次の自分ターン終了時まで表示形式を変更できません`);
        });
        return targets.length > 0;
    }

    getSpellTrapTargets() {
        return this.field.zones.filter(zone => {
            const isSpellTrapZone = zone.element.classList.contains("zone-spell")
                || zone.element.classList.contains("zone-field");
            return isSpellTrapZone
                && (zone.placedCard?.isSpell || zone.placedCard?.isTrap || zone.placedCard?.isEquipCard);
        });
    }

    getOpponentMonsterTargets(card) {
        const controller = card?.controller === "opponent" ? "opponent" : "player";
        return this.field.zones.filter(zone => {
            const target = zone.placedCard;
            if (!target?.isMonster || target.isEquipCard) return false;
            const isOpponentControlled = target.controller === "opponent"
                || Boolean(zone.element.closest(".opponent-field"));
            return controller === "player" ? isOpponentControlled : !isOpponentControlled;
        });
    }

    getEmptySpellTrapZone(controller = "player") {
        const ownerSelector = controller === "opponent" ? ".opponent-field" : ".you-field";
        return this.field.zones.find(zone =>
            zone.element.closest(ownerSelector)
            && zone.element.classList.contains("zone-spell")
            && !zone.isOccupied
        ) || null;
    }

    findZoneByCard(card) {
        return this.field.zones.find(zone => zone.placedCard === card) || null;
    }

    getMonsterTargets() {
        return this.field.zones.filter(zone =>
            zone.placedCard?.isMonster
            && !zone.placedCard.isEquipCard
            && zone.element.matches(".zone-monster, .zone-emz")
        );
    }

    canInflictPiercingDamage(card) {
        if (!card?.isMonster || !["獣族", "獣戦士族", "鳥獣族"].includes(card.race)) return false;

        const controller = card.controller === "opponent" ? "opponent" : "player";
        return this.getMonsterTargets().some(zone => {
            const effectCard = zone.placedCard;
            const effectController = effectCard.controller === "opponent" ? "opponent" : "player";
            return effectCard.id === "04-041"
                && effectController === controller
                && !zone.placedElement?.classList.contains("face-down");
        });
    }

    getBanishTargets(sourceCard) {
        return this.getMonsterTargets().filter(zone => zone.placedCard !== sourceCard);
    }

    getAutomaticManEaterTarget(card, targets) {
        const controller = card.controller === "opponent" ? "opponent" : "player";
        return targets
            .filter(zone => {
                const isOpponentZone = zone.placedCard.controller === "opponent"
                    || Boolean(zone.element.closest(".opponent-field"));
                return controller === "player" ? isOpponentZone : !isOpponentZone;
            })
            .sort((a, b) => b.placedCard.atk - a.placedCard.atk)[0] || null;
    }

    setResolving(isResolving) {
        this.isResolving = isResolving;
        this.onStateChange?.(isResolving);
    }
}
