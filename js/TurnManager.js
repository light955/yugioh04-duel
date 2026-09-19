export class TurnManager {
    constructor({ canAdvance, onBeforeAdvance, onDraw, onPhaseChange, onAnnounce } = {}) {
        this.phases = ["DRAW", "STANDBY", "MAIN 1", "BATTLE", "MAIN 2", "END"];
        this.phaseIndex = 2;
        this.turnNumber = 1;
        this.activePlayer = "player";
        this.hasNormalSummoned = false;
        this.summonedControllersThisTurn = new Set();
        this.summonRestrictedControllers = new Set();
        this.canAdvance = canAdvance || (() => true);
        this.onBeforeAdvance = onBeforeAdvance;
        this.onDraw = onDraw;
        this.onPhaseChange = onPhaseChange;
        this.onAnnounce = onAnnounce;
        this.autoAdvanceTimer = null;

        this.bindControls();
        this.updateStatus();
    }

    get currentPhase() {
        return this.phases[this.phaseIndex];
    }

    get isMainPhase() {
        return this.currentPhase === "MAIN 1" || this.currentPhase === "MAIN 2";
    }

    get isPlayerTurn() {
        return this.activePlayer === "player";
    }

    bindControls() {
        document.getElementById("next-phase-button")?.addEventListener("click", (event) => {
            event.stopPropagation();
            this.advancePhase();
        });
    }

    advancePhase() {
        this.clearAutoAdvanceTimer();
        if (!this.canAdvance()) return;
        this.onBeforeAdvance?.();

        if (this.currentPhase === "END") {
            this.turnNumber += 1;
            this.phaseIndex = 0;
            this.activePlayer = this.isPlayerTurn ? "opponent" : "player";
            this.hasNormalSummoned = false;
            this.summonedControllersThisTurn.clear();
            this.summonRestrictedControllers.clear();
            const drawnCard = this.onDraw?.(this.activePlayer);
            this.updateStatus();

            // ドロー失敗でデュエルが終了した場合、以降のフェイズ処理を行わない。
            if (!this.canAdvance()) return;

            if (drawnCard) {
                const message = this.isPlayerTurn
                    ? `TURN ${this.turnNumber}・DRAW！【${drawnCard.name}】をドローしました`
                    : `TURN ${this.turnNumber}・OPPONENT DRAW！相手がカードを1枚ドローしました`;
                this.onAnnounce?.(message);
            } else {
                const ownerLabel = this.isPlayerTurn ? "自分" : "相手";
                this.onAnnounce?.(`TURN ${this.turnNumber}・DRAW PHASE：${ownerLabel}のデッキが空です`);
            }
            const phaseDelay = this.onPhaseChange?.(this.activePlayer, this.currentPhase);
            this.scheduleOpponentAdvance(phaseDelay);
            return;
        }

        this.phaseIndex += 1;
        this.updateStatus();
        this.onAnnounce?.(`TURN ${this.turnNumber}・${this.currentPhase} PHASE`);
        const phaseDelay = this.onPhaseChange?.(this.activePlayer, this.currentPhase);
        this.scheduleOpponentAdvance(phaseDelay);
    }

    async scheduleOpponentAdvance(delayOverride) {
        if (this.isPlayerTurn) return;

        if (delayOverride instanceof Promise) {
            const expectedTurn = this.turnNumber;
            const expectedPhase = this.currentPhase;

            try {
                await delayOverride;
            } catch (error) {
                console.error("相手のフェイズ処理に失敗しました:", error);
            }

            const isSamePhase = this.turnNumber === expectedTurn
                && this.currentPhase === expectedPhase
                && !this.isPlayerTurn;
            if (isSamePhase && this.canAdvance()) {
                this.scheduleOpponentAdvance(600);
            }
            return;
        }

        if (!this.canAdvance()) return;

        const defaultDelay = this.currentPhase === "BATTLE"
            ? 1800
            : this.currentPhase.startsWith("MAIN")
                ? 1200
                : this.currentPhase === "STANDBY"
                    ? 700
                    : 900;
        const delay = Number.isFinite(delayOverride) ? delayOverride : defaultDelay;

        this.autoAdvanceTimer = window.setTimeout(() => {
            this.autoAdvanceTimer = null;
            if (!this.isPlayerTurn && this.canAdvance()) {
                this.advancePhase();
            }
        }, delay);
    }

    clearAutoAdvanceTimer() {
        if (this.autoAdvanceTimer === null) return;
        window.clearTimeout(this.autoAdvanceTimer);
        this.autoAdvanceTimer = null;
    }

    markNormalSummonUsed(controller = this.activePlayer, isSet = false) {
        this.hasNormalSummoned = true;
        if (!isSet) this.markSummonPerformed(controller);
        this.updateStatus();
    }

    markSummonPerformed(controller = this.activePlayer) {
        this.summonedControllersThisTurn.add(controller);
        this.updateStatus();
    }

    hasSummonedThisTurn(controller = "player") {
        return this.summonedControllersThisTurn.has(controller);
    }

    restrictSummons(controller = "player") {
        this.summonRestrictedControllers.add(controller);
        this.updateStatus();
    }

    isSummonRestricted(controller = "player") {
        return this.summonRestrictedControllers.has(controller);
    }

    updateStatus() {
        const turnCounter = document.getElementById("turn-counter");
        const phaseIndicator = document.getElementById("phase-indicator");
        const summonStatus = document.getElementById("normal-summon-status");
        const nextPhaseButton = document.getElementById("next-phase-button");

        if (turnCounter) {
            const ownerLabel = this.isPlayerTurn ? "YOU" : "OPPONENT";
            turnCounter.textContent = `TURN ${this.turnNumber}・${ownerLabel}`;
        }

        if (phaseIndicator) {
            phaseIndicator.textContent = this.currentPhase;
            phaseIndicator.dataset.phase = this.currentPhase.toLowerCase().replace(" ", "-");
        }

        if (nextPhaseButton) {
            nextPhaseButton.disabled = !this.isPlayerTurn || !this.canAdvance();
            nextPhaseButton.textContent = this.isPlayerTurn
                ? (this.currentPhase === "END" ? "NEXT TURN" : "NEXT PHASE")
                : "OPPONENT PLAYING";
        }

        document.body.classList.toggle("main-phase", this.isMainPhase);
        document.body.classList.toggle("battle-phase", this.currentPhase === "BATTLE");
        document.body.classList.toggle("player-turn", this.isPlayerTurn);
        document.body.classList.toggle("opponent-turn", !this.isPlayerTurn);

        if (summonStatus) {
            const isScapegoatLocked = this.isPlayerTurn && this.isSummonRestricted("player");
            summonStatus.textContent = this.isPlayerTurn
                ? (isScapegoatLocked ? "SUMMON LOCKED" : this.hasNormalSummoned ? "SUMMON USED" : "SUMMON READY")
                : "ACTION LOCKED";
            summonStatus.classList.toggle("used", this.isPlayerTurn && this.hasNormalSummoned);
            summonStatus.classList.toggle("ready", this.isPlayerTurn && !this.hasNormalSummoned && !isScapegoatLocked);
            summonStatus.classList.toggle("locked", !this.isPlayerTurn || isScapegoatLocked);
        }
    }
}
