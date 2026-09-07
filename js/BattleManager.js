import { CardActionPanel } from "./CardActionPanel.js?v=1";

export class BattleManager {
    constructor({ field, getTurnNumber, getCurrentPhase, onBeforeSelect, onBeforeFinish, onAnnounce, onShowEffect }) {
        this.field = field;
        this.getTurnNumber = getTurnNumber;
        this.getCurrentPhase = getCurrentPhase;
        this.onBeforeSelect = onBeforeSelect;
        this.onBeforeFinish = onBeforeFinish;
        this.onAnnounce = onAnnounce;
        this.onShowEffect = onShowEffect;
        this.playerLP = 8000;
        this.opponentLP = 8000;
        this.gameOver = false;
        this.selectedAttacker = null;

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
            || turnNumber === 1;

        this.actionPanel.toggle("attack-locked", cannotAttack);
        attackButton.setAttribute("aria-disabled", String(cannotAttack));
        this.actionPanel.show(zone.element);
        this.onAnnounce?.(`【${card.name}】攻撃または効果確認を選んでください`);
    }

    hideCommands() {
        this.actionPanel.hide("attack-locked");
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

        const opponentMonsters = this.field.zones.filter(zone =>
            zone.placedCard?.isMonster
            && zone.element.closest(".opponent-field")
            && zone.element.classList.contains("zone-monster")
        );

        if (opponentMonsters.length > 0) {
            this.onAnnounce?.("相手モンスターが存在します。攻撃対象の選択は次の戦闘実装で追加します");
            return;
        }

        card.lastAttackTurn = turnNumber;
        placedElement.classList.add("attacking-card");
        this.hideCommands();
        this.applyDamage("opponent", card.atk);
        this.onAnnounce?.(`【${card.name}】でダイレクトアタック！相手に${card.atk}ダメージ！`);

        setTimeout(() => placedElement.classList.remove("attacking-card"), 520);
    }

    updateLPDisplay() {
        const playerLP = document.getElementById("player-lp");
        const opponentLP = document.getElementById("opponent-lp");
        if (playerLP) playerLP.textContent = `LP ${this.playerLP}`;
        if (opponentLP) opponentLP.textContent = `LP ${this.opponentLP}`;
    }

    applyDamage(target, amount) {
        const damage = Math.max(0, Number(amount) || 0);
        const lpElement = document.getElementById(target === "player" ? "player-lp" : "opponent-lp");
        const fieldElement = document.querySelector(target === "player" ? ".you-field" : ".opponent-field");

        if (target === "player") {
            this.playerLP = Math.max(0, this.playerLP - damage);
        } else {
            this.opponentLP = Math.max(0, this.opponentLP - damage);
        }

        this.updateLPDisplay();
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

        if (this.playerLP === 0 || this.opponentLP === 0) {
            this.finishDuel(this.opponentLP === 0 ? "VICTORY" : "DEFEAT");
        }
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
                <button class="duel-restart-button" type="button">RESTART DUEL</button>
            </div>
        `;
        overlay.querySelector(".duel-restart-button").addEventListener("click", () => window.location.reload());
        document.body.appendChild(overlay);
        return overlay;
    }

    finishDuel(result) {
        this.gameOver = true;
        this.onBeforeFinish?.();

        const title = this.resultOverlay.querySelector("h2");
        const message = this.resultOverlay.querySelector(".duel-result-message");
        title.textContent = result;
        message.textContent = result === "VICTORY" ? "相手のLPを0にしました" : "自分のLPが0になりました";
        this.resultOverlay.classList.toggle("defeat", result === "DEFEAT");
        this.resultOverlay.hidden = false;
        requestAnimationFrame(() => this.resultOverlay.classList.add("show"));
    }
}
