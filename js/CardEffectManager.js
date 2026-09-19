import { CardSelectionDialog } from "./CardSelectionDialog.js?v=4";

export class CardEffectManager {
    constructor({ getDeckCount, getHandCards, getAllMonsterZones, getOpponentMonsterZones, getOpponentAttackMonsters, controlEffectManager, ritualSummonManager, targetManager, getSpellTrapTargets, canActivateScapegoat, onCreateScapegoatTokens, onRevealOpponentMonsters, onExpireSwords, onDraw, onDiscard, onDestroyZone, onBanishZone, onDestroySpellTraps, onSetMonsterFaceDown, onSimultaneousDamage, onStateChange, onAnnounce } = {}) {
        this.getDeckCount = getDeckCount || (() => 0);
        this.getHandCards = getHandCards || (() => []);
        this.getAllMonsterZones = getAllMonsterZones || (() => []);
        this.getOpponentMonsterZones = getOpponentMonsterZones || (() => []);
        this.getOpponentAttackMonsters = getOpponentAttackMonsters || (() => []);
        this.controlEffectManager = controlEffectManager;
        this.ritualSummonManager = ritualSummonManager;
        this.targetManager = targetManager;
        this.getSpellTrapTargets = getSpellTrapTargets || (() => []);
        this.canActivateScapegoat = canActivateScapegoat || (() => false);
        this.onCreateScapegoatTokens = onCreateScapegoatTokens;
        this.onRevealOpponentMonsters = onRevealOpponentMonsters;
        this.onExpireSwords = onExpireSwords;
        this.onDraw = onDraw;
        this.onDiscard = onDiscard;
        this.onDestroyZone = onDestroyZone;
        this.onBanishZone = onBanishZone;
        this.onDestroySpellTraps = onDestroySpellTraps;
        this.onSetMonsterFaceDown = onSetMonsterFaceDown;
        this.onSimultaneousDamage = onSimultaneousDamage;
        this.onStateChange = onStateChange;
        this.onAnnounce = onAnnounce;
        this.isResolving = false;
        this.swordsOfRevealingLight = new Map();
        this.selectionDialog = new CardSelectionDialog();
        this.effectHandlers = new Map([
            ["04-013", () => this.resolvePotOfGreed()],
            ["04-014", () => this.resolveGracefulCharity()],
            ["04-015", (card, context) => this.resolveControlEffect(card, context)],
            ["04-016", (card, context) => this.resolveControlEffect(card, context)],
            ["04-017", card => this.resolveHeavyStorm(card)],
            ["04-018", card => this.resolveMysticalSpaceTyphoon(card)],
            ["04-019", (card, context) => this.resolveControlEffect(card, context)],
            ["04-020", () => this.resolveRingOfDestruction()],
            ["04-021", (card, context) => this.resolveMirrorForce(card, context)],
            ["04-022", (card, context) => this.resolveTorrentialTribute(card, context)],
            ["04-023", (card, context) => this.resolveControlEffect(card, context)],
            ["04-024", (card, context) => this.resolveBottomlessTrapHole(card, context)],
            ["04-026", card => this.resolveRitualSpell(card)],
            ["04-034", (card, context) => this.resolveControlEffect(card, context)],
            ["04-035", (card, context) => this.resolveControlEffect(card, context)],
            ["04-036", () => this.resolveBookOfMoon()],
            ["04-037", () => this.resolveScapegoat()],
            ["04-038", () => this.resolveThunderBolt()],
            ["04-039", (card, context) => this.resolveSwordsOfRevealingLight(card, context)],
            ["04-040", (card, context) => this.resolveSakuretsuArmor(card, context)]
        ]);
    }

    canActivate(card, context = {}) {
        if (card?.id === "04-026") {
            return this.ritualSummonManager?.canActivate(card) ?? false;
        }

        if (["04-015", "04-016", "04-019", "04-023", "04-034", "04-035"].includes(card?.id)) {
            return this.controlEffectManager?.canActivate(card) ?? false;
        }

        if (card?.id === "04-020") {
            if (this.getFaceUpMonsterZones().length > 0) return true;
            if (!context.silent) this.onAnnounce?.("【破壊輪】で選択できる表側表示モンスターがいません");
            return false;
        }

        if (["04-021", "04-040"].includes(card?.id)) {
            const canRespond = context.trigger === "opponent-attack"
                && context.attackerZone?.placedCard === context.attackerCard;
            if (canRespond) return true;
            this.onAnnounce?.(`【${card.name}】は相手モンスターの攻撃宣言時に発動できます`);
            return false;
        }

        if (["04-022", "04-024"].includes(card?.id)) {
            const isValidSummon = context.trigger === "opponent-summon"
                && context.summonedZone?.placedCard === context.summonedCard;
            const hasEnoughAttack = card.id !== "04-024" || Number(context.summonedCard?.atk) >= 1500;
            if (isValidSummon && hasEnoughAttack) return true;
            const timing = card.id === "04-024"
                ? "攻撃力1500以上の相手モンスターが召喚された時"
                : "モンスターが召喚された時";
            this.onAnnounce?.(`【${card.name}】は${timing}に発動できます`);
            return false;
        }

        if (card?.id === "04-018") {
            if (this.getSpellTrapTargets(card).length > 0) return true;
            this.onAnnounce?.("【サイクロン】で選択できる魔法・罠カードがありません");
            return false;
        }

        if (card?.id === "04-036") {
            if (this.getBookOfMoonTargets().length > 0) return true;
            if (!context.silent) this.onAnnounce?.("【月の書】で選択できる表側表示モンスターがいません");
            return false;
        }

        if (card?.id === "04-037") {
            return this.canActivateScapegoat(card, context);
        }

        if (card?.id === "04-038") {
            if (this.getOpponentMonsterZones().length > 0) return true;
            if (!context.silent) this.onAnnounce?.("【サンダー・ボルト】で破壊できる相手モンスターがいません");
            return false;
        }

        const requiredCards = card?.id === "04-013"
            ? 2
            : card?.id === "04-014"
                ? 3
                : 0;
        if (this.getDeckCount() >= requiredCards) return true;

        this.onAnnounce?.(`【${card.name}】はデッキが${requiredCards}枚未満のため発動できません`);
        return false;
    }

    hasEffect(card) {
        return this.effectHandlers.has(card?.id);
    }

    resolve(card, context = {}) {
        const handler = this.effectHandlers.get(card?.id);
        return handler ? Promise.resolve(handler(card, context)) : Promise.resolve(false);
    }

    resolvePotOfGreed() {
        return new Promise(resolve => window.setTimeout(() => {
            const drawnCards = [this.onDraw?.(), this.onDraw?.()].filter(Boolean);
            const cardNames = drawnCards.map(card => `【${card.name}】`).join("・");
            this.onAnnounce?.(`【強欲な壺】の効果で${cardNames}をドローしました`);
            resolve(true);
        }, 350));
    }

    resolveGracefulCharity() {
        this.setResolving(true);
        return new Promise(resolve => window.setTimeout(() => {
            for (let i = 0; i < 3; i++) this.onDraw?.();
            this.onAnnounce?.("【天使の施し】の効果で3枚ドロー！墓地へ送る手札を2枚選んでください");
            this.selectionDialog.open({
                cards: this.getHandCards(),
                requiredCount: 2,
                title: "天使の施し",
                onComplete: cards => this.completeGracefulCharity(cards, resolve)
            });
        }, 350));
    }

    completeGracefulCharity(cards, resolve) {
        cards.forEach(card => this.onDiscard?.(card));
        const cardNames = cards.map(card => `【${card.name}】`).join("・");
        this.onAnnounce?.(`${cardNames}を墓地へ送りました`);
        this.setResolving(false);
        resolve(true);
    }

    resolveHeavyStorm(sourceCard) {
        this.setResolving(true);
        return new Promise(resolve => window.setTimeout(async () => {
            const destroyedCount = await this.onDestroySpellTraps?.(sourceCard) || 0;
            const message = destroyedCount > 0
                ? `【大嵐】の効果で魔法・罠カードを${destroyedCount}枚破壊しました`
                : "【大嵐】の効果で破壊されるカードはありませんでした";
            this.onAnnounce?.(message);
            window.setTimeout(() => {
                this.setResolving(false);
                resolve(true);
            }, 250);
        }, 350));
    }

    resolveMysticalSpaceTyphoon(sourceCard) {
        this.setResolving(true);
        return new Promise(resolve => {
            const started = this.targetManager?.start({
                targets: this.getSpellTrapTargets(sourceCard),
                prompt: "サイクロンで破壊する魔法・罠カードを選んでください",
                onSelect: zone => this.completeMysticalSpaceTyphoon(zone, resolve)
            });
            if (!started) {
                this.setResolving(false);
                resolve(false);
            }
        });
    }

    async completeMysticalSpaceTyphoon(targetZone, resolve) {
        const targetName = targetZone.placedCard?.name || "カード";
        const destroyed = await this.onDestroyZone?.(targetZone);
        this.onAnnounce?.(destroyed
            ? `【サイクロン】の効果で【${targetName}】を破壊しました`
            : "【サイクロン】の対象はフィールドを離れていました");
        this.setResolving(false);
        resolve(Boolean(destroyed));
    }

    resolveRingOfDestruction() {
        this.setResolving(true);
        return new Promise(resolve => {
            const started = this.targetManager?.start({
                targets: this.getFaceUpMonsterZones(),
                prompt: "破壊輪で破壊する表側表示モンスターを選んでください",
                onSelect: zone => this.completeRingOfDestruction(zone, resolve)
            });
            if (!started) {
                this.setResolving(false);
                resolve(false);
            }
        });
    }

    async completeRingOfDestruction(targetZone, resolve) {
        const targetCard = targetZone.placedCard;
        const targetName = targetCard?.name || "モンスター";
        const damage = Math.max(0, Number(targetCard?.originalAtk) || 0);

        try {
            const destroyed = await this.onDestroyZone?.(targetZone);
            if (!destroyed) {
                this.onAnnounce?.("【破壊輪】の対象はフィールドを離れていました");
                resolve(false);
                return;
            }

            this.onSimultaneousDamage?.(damage);
            this.onAnnounce?.(`【破壊輪】で【${targetName}】を破壊し、お互いに${damage}ダメージ！`);
            resolve(true);
        } finally {
            this.setResolving(false);
        }
    }

    getFaceUpMonsterZones() {
        return this.getAllMonsterZones().filter(zone =>
            !zone.placedElement?.classList.contains("face-down")
        );
    }

    getBookOfMoonTargets() {
        return this.getFaceUpMonsterZones().filter(zone => !zone.placedCard?.isToken);
    }

    async resolveSakuretsuArmor(card, context) {
        const attackerZone = context?.attackerZone;
        const attackerCard = context?.attackerCard;
        if (!attackerZone || attackerZone.placedCard !== attackerCard) return false;

        this.setResolving(true);
        const destroyed = await this.onDestroyZone?.(attackerZone);
        this.onAnnounce?.(destroyed
            ? `【炸裂装甲】の効果で相手の【${attackerCard.name}】を破壊しました`
            : "【炸裂装甲】の攻撃モンスターはフィールドを離れていました");
        this.setResolving(false);
        return Boolean(destroyed);
    }

    async resolveMirrorForce(card, context) {
        if (context?.trigger !== "opponent-attack") return false;

        this.setResolving(true);
        const targets = this.getOpponentAttackMonsters();
        const results = await Promise.all(targets.map(zone => this.onDestroyZone?.(zone)));
        const destroyedCount = results.filter(Boolean).length;
        this.onAnnounce?.(`【聖なるバリア－ミラーフォース－】の効果で相手の攻撃表示モンスターを${destroyedCount}体破壊しました`);
        this.setResolving(false);
        return destroyedCount > 0;
    }

    async resolveTorrentialTribute(card, context) {
        if (context?.trigger !== "opponent-summon") return false;

        this.setResolving(true);
        const targets = this.getAllMonsterZones();
        const results = await Promise.all(targets.map(zone => this.onDestroyZone?.(zone)));
        const destroyedCount = results.filter(Boolean).length;
        this.onAnnounce?.(`【激流葬】の効果でフィールドのモンスターを${destroyedCount}体破壊しました`);
        this.setResolving(false);
        return destroyedCount > 0;
    }

    async resolveBottomlessTrapHole(card, context) {
        const summonedZone = context?.summonedZone;
        const summonedCard = context?.summonedCard;
        if (context?.trigger !== "opponent-summon"
            || Number(summonedCard?.atk) < 1500
            || summonedZone?.placedCard !== summonedCard) {
            return false;
        }

        this.setResolving(true);
        const banished = await this.onBanishZone?.(summonedZone);
        this.onAnnounce?.(banished
            ? `【奈落の落とし穴】の効果で【${summonedCard.name}】を破壊して除外しました`
            : "【奈落の落とし穴】の対象はフィールドを離れていました");
        this.setResolving(false);
        return Boolean(banished);
    }

    resolveBookOfMoon() {
        this.setResolving(true);
        return new Promise(resolve => {
            const started = this.targetManager?.start({
                targets: this.getBookOfMoonTargets(),
                prompt: "月の書で裏側守備表示にするモンスターを選んでください",
                onSelect: zone => {
                    const targetName = zone.placedCard?.name || "モンスター";
                    const changed = this.onSetMonsterFaceDown?.(zone) || false;
                    this.onAnnounce?.(changed
                        ? `【月の書】の効果で【${targetName}】を裏側守備表示にしました`
                        : "【月の書】の対象はフィールドを離れていました");
                    this.setResolving(false);
                    resolve(Boolean(changed));
                }
            });
            if (!started) {
                this.setResolving(false);
                resolve(false);
            }
        });
    }

    async resolveScapegoat() {
        this.setResolving(true);
        try {
            const tokens = await this.onCreateScapegoatTokens?.() || [];
            if (tokens.length !== 4) {
                this.onAnnounce?.("【スケープ・ゴート】の効果処理時に羊トークン4体を特殊召喚できませんでした");
                return false;
            }
            this.onAnnounce?.("【スケープ・ゴート】の効果で羊トークン4体を守備表示で特殊召喚！");
            return true;
        } finally {
            this.setResolving(false);
        }
    }

    async resolveSwordsOfRevealingLight(card, context) {
        this.setResolving(true);
        try {
            const revealedCount = await this.onRevealOpponentMonsters?.() || 0;
            this.swordsOfRevealingLight.set(card, {
                card,
                sourceZone: context.sourceZone,
                opponentTurns: 0
            });
            const revealText = revealedCount > 0
                ? `相手の裏側表示モンスターを${revealedCount}体表側表示にしました。`
                : "表側表示にする相手モンスターはいません。";
            this.onAnnounce?.(`【光の護封剣】を発動！${revealText}相手は攻撃宣言できません`);
            return {
                keepOnField: true,
                statusText: "護封中・残り3ターン"
            };
        } finally {
            this.setResolving(false);
        }
    }

    isOpponentAttackLocked() {
        return [...this.swordsOfRevealingLight.values()].some(relation =>
            relation.sourceZone?.placedCard === relation.card
        );
    }

    handleCardLeavesField(card) {
        this.swordsOfRevealingLight.delete(card);
    }

    async handlePhaseChange(activePlayer, phase) {
        if (activePlayer !== "opponent" || phase !== "END") return;

        for (const [card, relation] of [...this.swordsOfRevealingLight]) {
            if (relation.sourceZone?.placedCard !== card) {
                this.swordsOfRevealingLight.delete(card);
                continue;
            }

            relation.opponentTurns += 1;
            const remainingTurns = 3 - relation.opponentTurns;
            if (remainingTurns > 0) {
                if (relation.sourceZone.placedElement) {
                    relation.sourceZone.placedElement.title = `${card.name}（護封中・残り${remainingTurns}ターン）`;
                }
                this.onAnnounce?.(`【光の護封剣】は残り${remainingTurns}ターン相手の攻撃を封じます`);
                continue;
            }

            this.swordsOfRevealingLight.delete(card);
            await this.onExpireSwords?.(relation.sourceZone, card);
            this.onAnnounce?.("3回目の相手ターンが終了し、【光の護封剣】は墓地へ送られました");
        }
    }

    async resolveThunderBolt() {
        const targets = [...this.getOpponentMonsterZones()];
        if (targets.length === 0) return false;

        this.setResolving(true);
        try {
            const results = await Promise.all(
                targets.map(zone => this.onDestroyZone?.(zone))
            );
            const destroyedCount = results.filter(Boolean).length;
            this.onAnnounce?.(`【サンダー・ボルト】の効果で相手モンスターを${destroyedCount}体破壊しました`);
            return destroyedCount > 0;
        } finally {
            this.setResolving(false);
        }
    }

    async resolveControlEffect(card, context) {
        this.setResolving(true);
        try {
            return await this.controlEffectManager?.resolve(card, context) || false;
        } finally {
            this.setResolving(false);
        }
    }

    async resolveRitualSpell(card) {
        this.setResolving(true);
        try {
            return await this.ritualSummonManager?.resolve(card) || false;
        } finally {
            this.setResolving(false);
        }
    }

    setResolving(isResolving) {
        this.isResolving = isResolving;
        this.onStateChange?.(isResolving);
    }
}
