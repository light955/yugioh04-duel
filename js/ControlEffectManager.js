import { CardSelectionDialog } from "./CardSelectionDialog.js?v=4";

export class ControlEffectManager {
    constructor({
        field,
        targetManager,
        getTurnNumber,
        getPlayerLP,
        getPlayerMonsterTargets,
        getOpponentMonsterTargets,
        getPlayerGraveyardMonsters,
        getOpponentGraveyardMonsters,
        hasEmptyPlayerMonsterZone,
        canSpecialSummon,
        onPayLP,
        onRecoverLP,
        onMoveMonster,
        onSwapMonsters,
        onSpecialSummon,
        onDestroyZone,
        onSendEquipToGraveyard,
        onAnnounce
    } = {}) {
        this.field = field;
        this.targetManager = targetManager;
        this.getTurnNumber = getTurnNumber;
        this.getPlayerLP = getPlayerLP || (() => 0);
        this.getPlayerMonsterTargets = getPlayerMonsterTargets || (() => []);
        this.getOpponentMonsterTargets = getOpponentMonsterTargets || (() => []);
        this.getPlayerGraveyardMonsters = getPlayerGraveyardMonsters || (() => []);
        this.getOpponentGraveyardMonsters = getOpponentGraveyardMonsters || (() => []);
        this.hasEmptyPlayerMonsterZone = hasEmptyPlayerMonsterZone || (() => false);
        this.canSpecialSummon = canSpecialSummon || (() => true);
        this.onPayLP = onPayLP;
        this.onRecoverLP = onRecoverLP;
        this.onMoveMonster = onMoveMonster;
        this.onSwapMonsters = onSwapMonsters;
        this.onSpecialSummon = onSpecialSummon;
        this.onDestroyZone = onDestroyZone;
        this.onSendEquipToGraveyard = onSendEquipToGraveyard;
        this.onAnnounce = onAnnounce;
        this.selectionDialog = new CardSelectionDialog();
        this.equipments = new Map();
        this.temporaryControls = new Map();
    }

    canActivate(card) {
        if (["04-016", "04-019", "04-023"].includes(card?.id) && !this.canSpecialSummon()) {
            this.onAnnounce?.(`【スケープ・ゴート】を発動したターンは【${card.name}】で特殊召喚できません`);
            return false;
        }

        if (card?.id === "04-035") {
            const hasPlayerMonster = this.getPlayerMonsterTargets().length > 0;
            const hasOpponentMonster = this.getOpponentMonsterTargets().length > 0;
            if (hasPlayerMonster && hasOpponentMonster) return true;
            this.onAnnounce?.("【強制転移】を発動するには、お互いのフィールドにモンスターが必要です");
            return false;
        }

        if (card?.id === "04-023") {
            if (this.hasEmptyPlayerMonsterZone() && this.getPlayerRevivalTargets().length > 0) return true;
            this.onAnnounce?.("【リビングデッドの呼び声】で特殊召喚できるモンスターまたは空きゾーンがありません");
            return false;
        }

        if (card?.id === "04-019") {
            const targets = this.getRevivalTargets();
            if (this.hasEmptyPlayerMonsterZone() && targets.length > 0) return true;
            this.onAnnounce?.("【死者蘇生】で特殊召喚できるモンスターまたは空きモンスターゾーンがありません");
            return false;
        }

        if (["04-015", "04-034"].includes(card?.id)) {
            const targets = this.getOpponentMonsterTargets({ faceUpOnly: card.id === "04-015" });
            if (this.hasEmptyPlayerMonsterZone() && targets.length > 0) return true;
            this.onAnnounce?.(`【${card.name}】で選択できる相手モンスターまたは空きモンスターゾーンがありません`);
            return false;
        }

        if (card?.id === "04-016") {
            if (this.getPlayerLP() <= 800) {
                this.onAnnounce?.("【早すぎた埋葬】を発動するには800より多いLPが必要です");
                return false;
            }
            if (!this.hasEmptyPlayerMonsterZone() || this.getPlayerRevivalTargets().length === 0) {
                this.onAnnounce?.("【早すぎた埋葬】で特殊召喚できるモンスターまたは空きゾーンがありません");
                return false;
            }
        }
        return true;
    }

    resolve(card, context = {}) {
        if (card?.id === "04-015") return this.resolveSnatchSteal(card, context);
        if (card?.id === "04-016") return this.resolvePrematureBurial(card, context);
        if (card?.id === "04-019") return this.resolveMonsterReborn();
        if (card?.id === "04-023") return this.resolveCallOfTheHaunted(card, context);
        if (card?.id === "04-034") return this.resolveChangeOfHeart(card);
        if (card?.id === "04-035") return this.resolveCreatureSwap();
        return Promise.resolve(false);
    }

    resolveSnatchSteal(sourceCard, context) {
        return this.selectOpponentMonster({
            targets: this.getOpponentMonsterTargets({ faceUpOnly: true }),
            prompt: "強奪する相手モンスターを選んでください",
            onSelected: targetZone => {
                const targetCard = targetZone.placedCard;
                const moved = this.onMoveMonster?.(targetZone, "player");
                if (!moved) return false;

                this.equipments.set(sourceCard, {
                    type: "snatch-steal",
                    sourceCard,
                    sourceZone: context.sourceZone,
                    targetCard
                });
                this.onAnnounce?.(`【強奪】を【${targetCard.name}】に装備し、コントロールを得ました`);
                return { keepOnField: true, targetCard };
            }
        });
    }

    resolveChangeOfHeart(sourceCard) {
        return this.selectOpponentMonster({
            targets: this.getOpponentMonsterTargets(),
            prompt: "コントロールを得る相手モンスターを選んでください",
            onSelected: targetZone => {
                const targetCard = targetZone.placedCard;
                const moved = this.onMoveMonster?.(targetZone, "player");
                if (!moved) return false;

                this.temporaryControls.set(targetCard, {
                    targetCard,
                    returnTurn: this.getTurnNumber?.()
                });
                this.onAnnounce?.(`【心変わり】の効果で【${targetCard.name}】のコントロールを得ました`);
                return true;
            }
        });
    }

    resolveCreatureSwap() {
        const playerTargets = this.getPlayerMonsterTargets();
        const opponentTargets = this.getOpponentMonsterTargets();
        if (playerTargets.length === 0 || opponentTargets.length === 0) {
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            const started = this.targetManager?.start({
                targets: playerTargets,
                prompt: "強制転移で相手に渡す自分のモンスターを選んでください",
                onSelect: playerZone => {
                    const opponentZone = this.selectOpponentCreatureSwapTarget(
                        this.getOpponentMonsterTargets()
                    );
                    if (!opponentZone) {
                        this.onAnnounce?.("相手が選べるモンスターがいないため、強制転移は不発になりました");
                        resolve(false);
                        return;
                    }

                    const playerCard = playerZone.placedCard;
                    const opponentCard = opponentZone.placedCard;
                    const swapped = this.onSwapMonsters?.(playerZone, opponentZone);
                    if (!swapped) {
                        resolve(false);
                        return;
                    }

                    this.onAnnounce?.(`【強制転移】の効果で【${playerCard.name}】と【${opponentCard.name}】のコントロールを入れ替えました`);
                    resolve(true);
                }
            });
            if (!started) resolve(false);
        });
    }

    selectOpponentCreatureSwapTarget(targets) {
        return [...targets].sort((a, b) =>
            this.getCreatureSwapValue(a) - this.getCreatureSwapValue(b)
        )[0] || null;
    }

    getCreatureSwapValue(zone) {
        const card = zone.placedCard;
        const isDefense = card?.isDefenseMode
            || zone.placedElement?.classList.contains("face-down");
        return isDefense ? Number(card?.def) || 0 : Number(card?.atk) || 0;
    }

    resolvePrematureBurial(sourceCard, context) {
        const graveyardMonsters = this.getPlayerRevivalTargets();
        if (this.getPlayerLP() <= 800 || !this.hasEmptyPlayerMonsterZone() || graveyardMonsters.length === 0) {
            return Promise.resolve(false);
        }

        this.onPayLP?.("player", 800);
        this.onAnnounce?.("【早すぎた埋葬】の発動コストとして800LPを払いました");
        return new Promise(resolve => {
            this.selectionDialog.open({
                cards: graveyardMonsters,
                requiredCount: 1,
                title: "早すぎた埋葬",
                confirmLabel: "特殊召喚",
                kicker: "SELECT FROM GRAVEYARD",
                onComplete: cards => {
                    const targetCard = cards[0];
                    const summoned = this.onSpecialSummon?.(targetCard);
                    if (!summoned) {
                        resolve(false);
                        return;
                    }

                    this.equipments.set(sourceCard, {
                        type: "premature-burial",
                        sourceCard,
                        sourceZone: context.sourceZone,
                        targetCard
                    });
                    this.onAnnounce?.(`【早すぎた埋葬】の効果で【${targetCard.name}】を特殊召喚しました`);
                    resolve({ keepOnField: true, targetCard });
                }
            });
        });
    }

    resolveMonsterReborn() {
        const graveyardMonsters = this.getRevivalTargets();
        if (!this.hasEmptyPlayerMonsterZone() || graveyardMonsters.length === 0) {
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            this.selectionDialog.open({
                cards: graveyardMonsters,
                requiredCount: 1,
                title: "死者蘇生",
                confirmLabel: "特殊召喚",
                kicker: "REVIVE FROM EITHER GRAVEYARD",
                onComplete: cards => {
                    const targetCard = cards[0];
                    const summoned = this.onSpecialSummon?.(targetCard);
                    if (!summoned) {
                        this.onAnnounce?.("【死者蘇生】の対象を特殊召喚できませんでした");
                        resolve(false);
                        return;
                    }

                    const ownerText = targetCard.owner === "opponent" ? "相手の墓地から" : "自分の墓地から";
                    this.onAnnounce?.(`【死者蘇生】の効果で${ownerText}【${targetCard.name}】を特殊召喚しました`);
                    resolve(true);
                }
            });
        });
    }

    resolveCallOfTheHaunted(sourceCard, context) {
        const graveyardMonsters = this.getPlayerRevivalTargets();
        if (!this.hasEmptyPlayerMonsterZone() || graveyardMonsters.length === 0) {
            return Promise.resolve(false);
        }

        return new Promise(resolve => {
            this.selectionDialog.open({
                cards: graveyardMonsters,
                requiredCount: 1,
                title: "リビングデッドの呼び声",
                confirmLabel: "特殊召喚",
                kicker: "CALL OF THE HAUNTED",
                onComplete: cards => {
                    const targetCard = cards[0];
                    const summoned = this.onSpecialSummon?.(targetCard);
                    if (!summoned) {
                        this.onAnnounce?.("【リビングデッドの呼び声】の対象を特殊召喚できませんでした");
                        resolve(false);
                        return;
                    }

                    this.equipments.set(sourceCard, {
                        type: "call-of-the-haunted",
                        sourceCard,
                        sourceZone: context.sourceZone,
                        targetCard
                    });
                    this.onAnnounce?.("【リビングデッドの呼び声】で【" + targetCard.name + "】を攻撃表示で特殊召喚しました");
                    resolve({
                        keepOnField: true,
                        statusText: "蘇生中",
                        targetCard
                    });
                }
            });
        });
    }

    getPlayerRevivalTargets() {
        return this.getPlayerGraveyardMonsters().filter(card => this.canRevive(card));
    }

    getRevivalTargets() {
        return [
            ...this.getPlayerGraveyardMonsters(),
            ...this.getOpponentGraveyardMonsters()
        ].filter(card => this.canRevive(card));
    }

    canRevive(card) {
        return card?.isMonster && (!card.cannotNormalSummon || card.wasProperlySummoned);
    }

    selectOpponentMonster({ targets, prompt, onSelected }) {
        return new Promise(resolve => {
            const started = this.targetManager?.start({
                targets,
                prompt,
                onSelect: zone => resolve(onSelected(zone))
            });
            if (!started) resolve(false);
        });
    }

    async handleCardLeavesField(card, { reason = "send" } = {}) {
        const sourceRelation = this.equipments.get(card);
        if (sourceRelation) {
            this.equipments.delete(card);
            const targetZone = this.findZoneByCard(sourceRelation.targetCard);
            if (sourceRelation.type === "snatch-steal" && targetZone) {
                this.onMoveMonster?.(targetZone, "opponent");
                this.onAnnounce?.(`【強奪】がフィールドを離れたため【${sourceRelation.targetCard.name}】を相手に返しました`);
            } else if (sourceRelation.type === "premature-burial" && reason === "destroy" && targetZone) {
                await this.onDestroyZone?.(targetZone);
                this.onAnnounce?.(`【早すぎた埋葬】が破壊されたため【${sourceRelation.targetCard.name}】も破壊されました`);
            } else if (sourceRelation.type === "call-of-the-haunted" && targetZone) {
                await this.onDestroyZone?.(targetZone);
                this.onAnnounce?.("【リビングデッドの呼び声】がフィールドを離れたため【" + sourceRelation.targetCard.name + "】を破壊しました");
            }
            return;
        }

        const targetRelation = [...this.equipments.values()]
            .find(relation => relation.targetCard === card);
        if (targetRelation) {
            this.equipments.delete(targetRelation.sourceCard);
            const sourceZone = this.findZoneByCard(targetRelation.sourceCard);
            if (targetRelation.type === "call-of-the-haunted") {
                if (reason === "destroy" && sourceZone) {
                    await this.onDestroyZone?.(sourceZone);
                    this.onAnnounce?.("蘇生したモンスターが破壊されたため【リビングデッドの呼び声】も破壊されました");
                }
            } else if (sourceZone) {
                await this.onSendEquipToGraveyard?.(sourceZone);
            }
        }

        this.temporaryControls.delete(card);
    }

    handlePhaseChange(activePlayer, phase) {
        if (activePlayer === "opponent" && phase === "STANDBY") {
            this.resolveSnatchStealRecovery();
        }
        if (activePlayer === "player" && phase === "END") {
            this.returnTemporaryControls();
        }
    }

    resolveSnatchStealRecovery() {
        const activeSnatchSteals = [...this.equipments.values()]
            .filter(relation => relation.type === "snatch-steal" && this.findZoneByCard(relation.sourceCard));
        activeSnatchSteals.forEach(() => this.onRecoverLP?.("opponent", 1000));
        if (activeSnatchSteals.length > 0) {
            this.onAnnounce?.(`【強奪】の効果で相手は${activeSnatchSteals.length * 1000}LP回復しました`);
        }
    }

    returnTemporaryControls() {
        for (const [targetCard] of this.temporaryControls) {
            const targetZone = this.findZoneByCard(targetCard);
            if (targetZone) {
                this.onMoveMonster?.(targetZone, "opponent");
                this.onAnnounce?.(`【心変わり】の効果が終了し【${targetCard.name}】を相手に返しました`);
            }
            this.temporaryControls.delete(targetCard);
        }
    }

    findZoneByCard(card) {
        return this.field.zones.find(zone => zone.placedCard === card) || null;
    }
}
