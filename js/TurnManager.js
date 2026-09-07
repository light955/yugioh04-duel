export class TurnManager {
    constructor({ canAdvance, onBeforeAdvance, onDraw, onAnnounce } = {}) {
        this.phases = ["DRAW", "STANDBY", "MAIN 1", "BATTLE", "MAIN 2", "END"];
        this.phaseIndex = 2;
        this.turnNumber = 1;
        this.hasNormalSummoned = false;
        this.canAdvance = canAdvance || (() => true);
        this.onBeforeAdvance = onBeforeAdvance;
        this.onDraw = onDraw;
        this.onAnnounce = onAnnounce;

        this.bindControls();
        this.updateStatus();
    }

    get currentPhase() {
        return this.phases[this.phaseIndex];
    }

    get isMainPhase() {
        return this.currentPhase === "MAIN 1" || this.currentPhase === "MAIN 2";
    }

    bindControls() {
        document.getElementById("next-phase-button")?.addEventListener("click", (event) => {
            event.stopPropagation();
            this.advancePhase();
        });
    }

    advancePhase() {
        if (!this.canAdvance()) return;
        this.onBeforeAdvance?.();

        if (this.currentPhase === "END") {
            this.turnNumber += 1;
            this.phaseIndex = 0;
            this.hasNormalSummoned = false;
            const drawnCard = this.onDraw?.();
            this.updateStatus();

            if (drawnCard) {
                this.onAnnounce?.(`TURN ${this.turnNumber}・DRAW！【${drawnCard.name}】をドローしました`);
            } else {
                this.onAnnounce?.(`TURN ${this.turnNumber}・DRAW PHASE：デッキが空です`);
            }
            return;
        }

        this.phaseIndex += 1;
        this.updateStatus();
        this.onAnnounce?.(`TURN ${this.turnNumber}・${this.currentPhase} PHASE`);
    }

    markNormalSummonUsed() {
        this.hasNormalSummoned = true;
        this.updateStatus();
    }

    updateStatus() {
        const turnCounter = document.getElementById("turn-counter");
        const phaseIndicator = document.getElementById("phase-indicator");
        const summonStatus = document.getElementById("normal-summon-status");
        const nextPhaseButton = document.getElementById("next-phase-button");

        if (turnCounter) turnCounter.textContent = `TURN ${this.turnNumber}`;

        if (phaseIndicator) {
            phaseIndicator.textContent = this.currentPhase;
            phaseIndicator.dataset.phase = this.currentPhase.toLowerCase().replace(" ", "-");
        }

        if (nextPhaseButton) {
            nextPhaseButton.textContent = this.currentPhase === "END" ? "NEXT TURN" : "NEXT PHASE";
        }

        document.body.classList.toggle("main-phase", this.isMainPhase);
        document.body.classList.toggle("battle-phase", this.currentPhase === "BATTLE");

        if (summonStatus) {
            summonStatus.textContent = this.hasNormalSummoned ? "SUMMON USED" : "SUMMON READY";
            summonStatus.classList.toggle("used", this.hasNormalSummoned);
            summonStatus.classList.toggle("ready", !this.hasNormalSummoned);
        }
    }
}
