import { CardActionPanel } from "./CardActionPanel.js?v=1";

export class BattleManager {
    constructor({
        field,
        getTurnNumber,
        getCurrentPhase,
        onBeforeSelect,
        onBeforeFinish,
        onAnnounce,
        onShowEffect,
        onMonsterFlipped,
        onAfterDamageCalculation,
        isBattleProtected,
        isSharingBattleDamage,
        canInflictPiercingDamage,
        isAttackLocked,
        onBeforeBattleDestroy,
        onAttackStarted,
        onMonsterDestroyedByBattle,
        onPlayerAttackDeclared,
        onOpponentAttackDeclared,
        onSendToGraveyard,
        onDuelFinished
    }) {
        this.field = field;
        this.getTurnNumber = getTurnNumber;
        this.getCurrentPhase = getCurrentPhase;
        this.onBeforeSelect = onBeforeSelect;
        this.onBeforeFinish = onBeforeFinish;
        this.onAnnounce = onAnnounce;
        this.onShowEffect = onShowEffect;
        this.onMonsterFlipped = onMonsterFlipped;
        this.onAfterDamageCalculation = onAfterDamageCalculation;
        this.isBattleProtected = isBattleProtected;
        this.isSharingBattleDamage = isSharingBattleDamage;
        this.canInflictPiercingDamage = canInflictPiercingDamage;
        this.isAttackLocked = isAttackLocked;
        this.onBeforeBattleDestroy = onBeforeBattleDestroy;
        this.onAttackStarted = onAttackStarted;
        this.onMonsterDestroyedByBattle = onMonsterDestroyedByBattle;
        this.onPlayerAttackDeclared = onPlayerAttackDeclared;
        this.onOpponentAttackDeclared = onOpponentAttackDeclared;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onDuelFinished = onDuelFinished;
        this.playerLP = 8000;
        this.opponentLP = 8000;
        this.gameOver = false;
        this.selectedAttacker = null;
        this.attackTargets = [];

        this.actionPanel = CardActionPanel.createBattle({
            onAction: () => this.declareAttack(),
            onEffect: () => {
                const target = this.selectedAttacker;
                this.onShowEffect?.(target?.card, target?.placedElement);
            }
        });
        this.resultOverlay = this.createResultOverlay();
        this.updateLPDisplay();
    }

    showCommands(zone, card, placedElement, onPositionChange) {
        this.onBeforeSelect?.();
        this.selectedAttacker = { zone, card, placedElement, onPositionChange };

        const attackButton = this.actionPanel.query('[data-battle-action="attack"]');
        const turnNumber = this.getTurnNumber();
        const cannotAttack = placedElement.classList.contains("face-down")
            || card.isDefenseMode
            || card.lastAttackTurn === turnNumber
            || card.cannotAttackTurn === turnNumber
            || this.isAttackLocked?.("player")
            || turnNumber === 1;

        this.actionPanel.toggle("attack-locked", cannotAttack);
        attackButton.setAttribute("aria-disabled", String(cannotAttack));
        this.actionPanel.show(zone.element);
        this.onAnnounce?.(`【${card.name}】攻撃または効果確認を選んでください`);
    }

    hideCommands() {
        this.actionPanel.hide("attack-locked");
        this.clearAttackTargets();
        this.selectedAttacker = null;
    }

    declareAttack() {
        const target = this.selectedAttacker;
        if (!target || this.getCurrentPhase() !== "BATTLE" || this.gameOver) return;

        const { card, placedElement } = target;
        const turnNumber = this.getTurnNumber();
        if (turnNumber === 1) {
            this.onAnnounce?.("先攻1ターン目は攻撃できません");
            return;
        }
        if (placedElement.classList.contains("face-down")) {
            this.onAnnounce?.("裏側表示モンスターは攻撃できません");
            return;
        }
        if (card.isDefenseMode) {
            this.onAnnounce?.("守備表示モンスターは攻撃できません");
            return;
        }
        if (card.lastAttackTurn === turnNumber) {
            this.onAnnounce?.(`【${card.name}】はこのターンすでに攻撃しています`);
            return;
        }
        if (card.cannotAttackTurn === turnNumber) {
            this.onAnnounce?.(`【${card.name}】は効果を使用したため、このターンは攻撃できません`);
            return;
        }
        if (this.isAttackLocked?.("player")) {
            this.onAnnounce?.("【光の護封剣】の効果により攻撃宣言できません");
            return;
        }

        const opponentMonsters = this.field.zones.filter(zone =>
            zone.placedCard?.isMonster
            && zone.element.closest(".opponent-field")
            && zone.element.classList.contains("zone-monster")
        );

        if (opponentMonsters.length > 0) {
            this.startAttackTargetSelection(opponentMonsters);
            return;
        }

        const attacker = this.selectedAttacker;
        this.hideCommands();
        this.executePlayerAttack(attacker);
    }

    startAttackTargetSelection(opponentMonsters) {
        this.attackTargets = opponentMonsters;
        this.actionPanel.hide("attack-locked");
        this.selectedAttacker?.placedElement.classList.add("attack-ready");
        this.attackTargets.forEach(zone => zone.element.classList.add("attack-target"));
        this.onAnnounce?.("攻撃する相手モンスターを選んでください");
    }

    selectAttackTarget(zone, card, placedElement) {
        if (!this.selectedAttacker || !this.attackTargets.includes(zone)) return false;
        if (this.getCurrentPhase() !== "BATTLE" || this.gameOver) {
            this.hideCommands();
            return false;
        }

        const attacker = this.selectedAttacker;
        this.clearAttackTargets();
        this.selectedAttacker = null;
        this.executePlayerAttack(attacker, { zone, card, placedElement });
        return true;
    }

    async executePlayerAttack(attacker, defender = null) {
        if (!attacker?.card || attacker.zone.placedCard !== attacker.card) return false;

        this.onAttackStarted?.(attacker.card);
        attacker.card.lastAttackTurn = this.getTurnNumber();
        const targetLabel = defender
            ? defender.placedElement.classList.contains("face-down")
                ? "裏側守備表示モンスター"
                : `【${defender.card.name}】`
            : "相手プレイヤー";
        this.onAnnounce?.(`【${attacker.card.name}】が${targetLabel}へ攻撃宣言！`);

        const attackNegated = await this.onPlayerAttackDeclared?.(attacker);
        if (attackNegated || attacker.zone.placedCard !== attacker.card || this.gameOver) return true;

        if (defender) {
            if (defender.zone.placedCard !== defender.card) return true;
            return this.startMonsterBattle(attacker, defender, "player", { announceAttack: false });
        }

        attacker.placedElement.classList.add("attacking-card");
        if (this.isBattleProtected?.("opponent")) {
            this.onAnnounce?.("【和睦の使者】の効果により、相手への戦闘ダメージは0！");
        } else {
            this.applyDamage("opponent", attacker.card.atk);
            this.onAnnounce?.(`【${attacker.card.name}】でダイレクトアタック！相手に${attacker.card.atk}ダメージ！`);
        }
        return new Promise(resolve => {
            window.setTimeout(() => {
                attacker.placedElement.classList.remove("attacking-card");
                resolve(true);
            }, 520);
        });
    }

    async executeOpponentAttack(attackerZone, defenderZone) {
        if (this.getCurrentPhase() !== "BATTLE" || this.gameOver) return false;
        if (this.isAttackLocked?.("opponent")) {
            this.onAnnounce?.("【光の護封剣】の効果により、相手モンスターは攻撃宣言できません");
            return false;
        }

        const attacker = {
            zone: attackerZone,
            card: attackerZone.placedCard,
            placedElement: attackerZone.placedElement
        };
        if (!attacker.card || !attacker.placedElement) return false;

        attacker.card.lastAttackTurn = this.getTurnNumber();
        const targetLabel = defenderZone
            ? defenderZone.placedElement?.classList.contains("face-down")
                ? "裏側守備表示モンスター"
                : `【${defenderZone.placedCard?.name}】`
            : "プレイヤー";
        this.onAnnounce?.(`相手の【${attacker.card.name}】が${targetLabel}へ攻撃宣言！`);

        await this.onOpponentAttackDeclared?.(attacker);
        if (attackerZone.placedCard !== attacker.card) return true;

        if (!defenderZone) {
            attacker.placedElement.classList.add("opponent-attacking-card");
            this.applyDamage("player", attacker.card.atk);
            this.onAnnounce?.(`相手の【${attacker.card.name}】がダイレクトアタック！自分に${attacker.card.atk}ダメージ！`);
            return new Promise(resolve => {
                window.setTimeout(() => {
                    attacker.placedElement.classList.remove("opponent-attacking-card");
                    resolve(true);
                }, 520);
            });
        }

        return this.startMonsterBattle(attacker, {
            zone: defenderZone,
            card: defenderZone.placedCard,
            placedElement: defenderZone.placedElement
        }, "opponent", { announceAttack: false });
    }

    startMonsterBattle(attacker, defender, attackerController, { announceAttack = true } = {}) {
        const wasFaceDown = defender.placedElement.classList.contains("face-down");
        attacker.card.lastAttackTurn = this.getTurnNumber();
        const attackClass = attackerController === "player" ? "attacking-card" : "opponent-attacking-card";
        attacker.placedElement.classList.add(attackClass, "battle-resolving");
        defender.placedElement.classList.add("attack-target-card", "battle-resolving");

        const targetLabel = defender.placedElement.classList.contains("face-down")
            ? "裏側守備表示モンスター"
            : `【${defender.card.name}】`;
        const attackerLabel = attackerController === "player"
            ? `【${attacker.card.name}】`
            : `相手の【${attacker.card.name}】`;
        if (announceAttack) this.onAnnounce?.(`${attackerLabel}で${targetLabel}に攻撃宣言！`);

        return new Promise(resolve => window.setTimeout(async () => {
            attacker.placedElement.classList.remove(attackClass);
            defender.placedElement.classList.remove("attack-target-card");
            await this.resolveMonsterBattle(attacker, defender, attackerController);
            if (wasFaceDown) {
                await this.onMonsterFlipped?.({
                    card: defender.card,
                    zone: defender.zone,
                    placedElement: defender.placedElement,
                    reason: "battle"
                });
            }
            resolve(true);
        }, 520));
    }

    async resolveMonsterBattle(attacker, defender, attackerController = "player") {
        this.revealDefender(defender);

        const defenderController = attackerController === "player" ? "opponent" : "player";
        const attackValue = attacker.card.atk;
        const isDefense = defender.card.isDefenseMode;
        const targetValue = isDefense ? defender.card.def : defender.card.atk;
        const difference = attackValue - targetValue;
        const attackerProtected = Boolean(this.isBattleProtected?.(attackerController));
        const defenderProtected = Boolean(this.isBattleProtected?.(defenderController));

        attacker.placedElement.classList.remove("battle-resolving");
        defender.placedElement.classList.remove("battle-resolving");

        const battleEffectResolved = await this.onAfterDamageCalculation?.({
            attacker,
            defender,
            attackerController,
            defenderController,
            isDefense,
            difference
        });
        if (battleEffectResolved) {
            this.applyDamageAfterBattleEffect({
                attacker,
                defender,
                attackerController,
                defenderController,
                isDefense,
                difference,
                attackerProtected,
                defenderProtected
            });
            return;
        }

        if (isDefense) {
            return this.resolveDefenseBattle(attacker, defender, difference, attackerController, defenderController);
        }

        if (difference > 0) {
            if (defenderProtected) {
                this.onAnnounce?.("【和睦の使者】の効果により、相手モンスターは戦闘で破壊されず、戦闘ダメージは0！");
                return;
            }
            const shouldShareDamage = Boolean(this.isSharingBattleDamage?.(defender.card));
            const destroyed = await this.destroyMonster(defenderController, defender);
            if (destroyed) {
                this.onMonsterDestroyedByBattle?.({
                    attacker,
                    defender,
                    attackerController,
                    destroyed
                });
            }
            const sharedDamage = this.applyBattleDamage(defenderController, difference, defender.card, shouldShareDamage);
            const targetLabel = defenderController === "player" ? "自分" : "相手";
            const sharedText = sharedDamage ? `さらにもう一方にも${difference}ダメージ！` : "";
            const resultText = destroyed
                ? `【${defender.card.name}】を戦闘破壊！`
                : `【${defender.card.name}】は装備モンスターを身代わりにして戦闘破壊を免れた！`;
            this.onAnnounce?.(`${resultText}${targetLabel}に${difference}ダメージ！${sharedText}`);
            return;
        }

        if (difference < 0) {
            if (attackerProtected) {
                this.onAnnounce?.("【和睦の使者】の効果により、攻撃モンスターは戦闘で破壊されず、戦闘ダメージは0！");
                return;
            }
            const shouldShareDamage = Boolean(this.isSharingBattleDamage?.(attacker.card));
            const destroyed = await this.destroyMonster(attackerController, attacker);
            const damage = Math.abs(difference);
            const sharedDamage = this.applyBattleDamage(attackerController, damage, attacker.card, shouldShareDamage);
            const targetLabel = attackerController === "player" ? "自分" : "相手";
            const sharedText = sharedDamage ? `さらにもう一方にも${damage}ダメージ！` : "";
            const resultText = destroyed
                ? `【${attacker.card.name}】が戦闘破壊され、`
                : `【${attacker.card.name}】は装備モンスターを身代わりにして戦闘破壊を免れ、`;
            this.onAnnounce?.(`${resultText}${targetLabel}に${damage}ダメージ！${sharedText}`);
            return;
        }

        const destructions = [];
        if (!attackerProtected) destructions.push(this.destroyMonster(attackerController, attacker));
        if (!defenderProtected) destructions.push(this.destroyMonster(defenderController, defender));
        const destructionResults = await Promise.all(destructions);
        const replacementUsed = destructionResults.includes(false);
        this.onAnnounce?.(replacementUsed
            ? "攻撃力は同じ！装備モンスターが身代わりとなり、【サクリファイス】はフィールドに残りました"
            : attackerProtected || defenderProtected
                ? "攻撃力は同じ！【和睦の使者】で守られていないモンスターのみ戦闘破壊！"
                : "攻撃力は同じ！両方のモンスターを戦闘破壊！");
    }

    async resolveDefenseBattle(attacker, defender, difference, attackerController, defenderController) {
        if (difference > 0) {
            if (this.isBattleProtected?.(defenderController)) {
                this.onAnnounce?.("【和睦の使者】の効果により、相手モンスターは戦闘では破壊されません！");
                return;
            }
            const destroyed = await this.destroyMonster(defenderController, defender);
            if (destroyed) {
                this.onMonsterDestroyedByBattle?.({
                    attacker,
                    defender,
                    attackerController,
                    destroyed
                });
            }
            const canPierce = Boolean(this.canInflictPiercingDamage?.(attacker.card));
            const sharedDamage = canPierce
                ? this.applyBattleDamage(defenderController, difference, defender.card)
                : false;
            const targetLabel = defenderController === "player" ? "自分" : "相手";
            const piercingText = canPierce ? `${targetLabel}に${difference}の貫通ダメージ！` : "";
            const sharedText = sharedDamage ? `さらにもう一方にも${difference}ダメージ！` : "";
            const resultText = destroyed
                ? `【${defender.card.name}】を戦闘破壊！`
                : `【${defender.card.name}】は装備モンスターを身代わりにして戦闘破壊を免れた！`;
            this.onAnnounce?.(`${resultText}${piercingText}${sharedText}`);
            return;
        }

        if (difference < 0) {
            if (this.isBattleProtected?.(attackerController)) {
                this.onAnnounce?.("【和睦の使者】の効果により、戦闘ダメージは0！");
                return;
            }
            const damage = Math.abs(difference);
            const sharedDamage = this.applyBattleDamage(attackerController, damage, attacker.card);
            const targetLabel = attackerController === "player" ? "自分" : "相手";
            const sharedText = sharedDamage ? `さらにもう一方にも${damage}ダメージ！` : "";
            this.onAnnounce?.(`守備力を突破できず、${targetLabel}に${damage}ダメージ！${sharedText}`);
            return;
        }

        this.onAnnounce?.("攻撃力と守備力が同じため、モンスターは破壊されません");
    }

    applyDamageAfterBattleEffect({
        attacker,
        defender,
        attackerController,
        defenderController,
        isDefense,
        difference,
        attackerProtected,
        defenderProtected
    }) {
        let target = null;
        let amount = 0;
        let protectedFromDamage = false;
        let battlingCard = null;

        if (!isDefense && difference > 0) {
            target = defenderController;
            amount = difference;
            protectedFromDamage = defenderProtected;
            battlingCard = defender.card;
        } else if (isDefense && difference > 0 && this.canInflictPiercingDamage?.(attacker.card)) {
            target = defenderController;
            amount = difference;
            protectedFromDamage = defenderProtected;
            battlingCard = defender.card;
        } else if (difference < 0) {
            target = attackerController;
            amount = Math.abs(difference);
            protectedFromDamage = attackerProtected;
            battlingCard = attacker.card;
        }

        if (!target || amount === 0) return;
        if (protectedFromDamage) {
            this.onAnnounce?.("【和睦の使者】の効果により、戦闘ダメージは0！");
            return;
        }

        const sharedDamage = this.applyBattleDamage(target, amount, battlingCard);
        const targetLabel = target === "player" ? "自分" : "相手";
        const sharedText = sharedDamage ? `さらにもう一方にも${amount}ダメージ！` : "";
        this.onAnnounce?.(`${targetLabel}に${amount}の戦闘ダメージ！${sharedText}`);
    }

    revealDefender(defender) {
        if (!defender.placedElement.classList.contains("face-down")) return;

        defender.placedElement.classList.remove("face-down");
        defender.placedElement.innerHTML = defender.card.faceHtml;
        defender.placedElement.title = `${defender.card.name}（表側守備表示）`;
        defender.placedElement.classList.add("flip-revealed");
        setTimeout(() => defender.placedElement.classList.remove("flip-revealed"), 360);
    }

    async destroyMonster(controller, target) {
        const replaced = await this.onBeforeBattleDestroy?.(target);
        if (replaced) return false;

        target.placedElement.classList.add("battle-destroyed");
        await new Promise(resolve => window.setTimeout(resolve, 360));
        if (this.onSendToGraveyard) {
            await this.onSendToGraveyard(controller, target.zone, target.placedElement, target.card);
        } else {
            target.zone.clearPlacedCard(target.placedElement);
        }
        return true;
    }

    payLP(target, amount) {
        const cost = Math.max(0, Number(amount) || 0);
        const currentLP = target === "player" ? this.playerLP : this.opponentLP;
        if (currentLP <= cost) return false;

        if (target === "player") {
            this.playerLP -= cost;
        } else {
            this.opponentLP -= cost;
        }
        this.updateLPDisplay();
        return true;
    }

    recoverLP(target, amount) {
        const recovery = Math.max(0, Number(amount) || 0);
        if (target === "player") {
            this.playerLP += recovery;
        } else {
            this.opponentLP += recovery;
        }
        this.updateLPDisplay();
        return recovery;
    }

    clearAttackTargets() {
        this.selectedAttacker?.placedElement.classList.remove("attack-ready");
        this.attackTargets.forEach(zone => zone.element.classList.remove("attack-target"));
        this.attackTargets = [];
    }

    updateLPDisplay() {
        const playerLP = document.getElementById("player-lp");
        const opponentLP = document.getElementById("opponent-lp");
        if (playerLP) playerLP.textContent = `LP ${this.playerLP}`;
        if (opponentLP) opponentLP.textContent = `LP ${this.opponentLP}`;
    }

    applyDamage(target, amount) {
        const damage = Math.max(0, Number(amount) || 0);

        if (target === "player") {
            this.playerLP = Math.max(0, this.playerLP - damage);
        } else {
            this.opponentLP = Math.max(0, this.opponentLP - damage);
        }

        this.updateLPDisplay();
        this.animateDamage(target);

        if (this.playerLP === 0 || this.opponentLP === 0) {
            this.finishDuel(this.opponentLP === 0 ? "VICTORY" : "DEFEAT");
        }
    }

    applySimultaneousDamage(amount) {
        const damage = Math.max(0, Number(amount) || 0);
        this.playerLP = Math.max(0, this.playerLP - damage);
        this.opponentLP = Math.max(0, this.opponentLP - damage);
        this.updateLPDisplay();
        this.animateDamage("player");
        this.animateDamage("opponent");

        if (this.playerLP === 0 || this.opponentLP === 0) {
            const result = this.playerLP === 0 && this.opponentLP === 0
                ? "DRAW"
                : this.opponentLP === 0
                    ? "VICTORY"
                    : "DEFEAT";
            this.finishDuel(result);
        }
    }

    finishByDeckOut(loser) {
        if (this.gameOver) return false;

        const isPlayerDeckOut = loser === "player";
        this.finishDuel(
            isPlayerDeckOut ? "DEFEAT" : "VICTORY",
            isPlayerDeckOut
                ? "ドローするカードがなく、デッキ切れで敗北しました"
                : "相手がドローできず、デッキ切れで勝利しました"
        );
        return true;
    }

    animateDamage(target) {
        const lpElement = document.getElementById(target === "player" ? "player-lp" : "opponent-lp");
        const fieldElement = document.querySelector(target === "player" ? ".you-field" : ".opponent-field");
        lpElement?.classList.remove("lp-damage");
        fieldElement?.classList.remove("direct-hit");
        requestAnimationFrame(() => {
            lpElement?.classList.add("lp-damage");
            fieldElement?.classList.add("direct-hit");
        });

        setTimeout(() => {
            lpElement?.classList.remove("lp-damage");
            fieldElement?.classList.remove("direct-hit");
        }, 520);
    }

    applyBattleDamage(target, amount, battlingCard, shouldShare = this.isSharingBattleDamage?.(battlingCard)) {
        this.applyDamage(target, amount);
        if (!shouldShare) return false;

        const otherPlayer = target === "player" ? "opponent" : "player";
        if (this.isBattleProtected?.(otherPlayer)) return false;
        this.applyDamage(otherPlayer, amount);
        return true;
    }

    createResultOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "duel-result-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <div class="duel-result-panel" role="dialog" aria-modal="true" aria-labelledby="duel-result-title">
                <span class="duel-result-kicker">DUEL RESULT</span>
                <h2 id="duel-result-title">VICTORY</h2>
                <p class="duel-result-message">相手のLPを0にしました</p>
                <div class="duel-result-reward">
                    <span>DUEL REWARD</span>
                    <strong>+0 DP</strong>
                    <small>TOTAL 0 DP</small>
                </div>
                <div class="duel-result-actions">
                    <button class="duel-restart-button" type="button">RESTART DUEL</button>
                    <a class="duel-metaverse-button" href="metaverse.html">METAVERSE</a>
                </div>
            </div>
        `;
        overlay.querySelector(".duel-restart-button").addEventListener("click", () => window.location.reload());
        document.body.appendChild(overlay);
        return overlay;
    }

    finishDuel(result, resultMessage = null) {
        if (this.gameOver) return;

        this.gameOver = true;
        this.onBeforeFinish?.();
        const reward = this.onDuelFinished?.(result) || null;

        const title = this.resultOverlay.querySelector("h2");
        const message = this.resultOverlay.querySelector(".duel-result-message");
        const rewardElement = this.resultOverlay.querySelector(".duel-result-reward");
        title.textContent = result;
        message.textContent = resultMessage || (result === "DRAW"
            ? "お互いのLPが同時に0になりました"
            : result === "VICTORY"
                ? "相手のLPを0にしました"
                : "自分のLPが0になりました");
        if (rewardElement && reward) {
            rewardElement.querySelector("strong").textContent = `+${reward.amount} DP`;
            rewardElement.querySelector("small").textContent = `TOTAL ${reward.total} DP`;
            rewardElement.hidden = false;
        } else if (rewardElement) {
            rewardElement.hidden = true;
        }
        this.resultOverlay.classList.toggle("defeat", result === "DEFEAT");
        this.resultOverlay.hidden = false;
        requestAnimationFrame(() => this.resultOverlay.classList.add("show"));
    }
}
