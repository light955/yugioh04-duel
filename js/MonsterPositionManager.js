import { CardActionPanel } from "./CardActionPanel.js?v=2";

export class MonsterPositionManager {
    constructor({ turnManager, requireMainPhase, onBeforeSelect, canActivateEffect, onActivateEffect, onFlipSummon, onAnnounce, onShowEffect }) {
        this.turnManager = turnManager;
        this.requireMainPhase = requireMainPhase;
        this.onBeforeSelect = onBeforeSelect;
        this.canActivateEffect = canActivateEffect;
        this.onActivateEffect = onActivateEffect;
        this.onFlipSummon = onFlipSummon;
        this.onAnnounce = onAnnounce;
        this.onShowEffect = onShowEffect;
        this.selectedMonster = null;

        this.actionPanel = CardActionPanel.createPosition({
            onAction: (position) => this.choosePosition(position),
            onEffect: () => {
                const target = this.selectedMonster;
                this.onShowEffect?.(target?.card, target?.placedElement);
            }
        });
    }

    show(zone, card, placedElement, onPositionChange) {
        this.onBeforeSelect?.();

        const isFaceDown = placedElement.classList.contains("face-down");
        const turnNumber = this.turnManager.turnNumber;
        const isEffectLocked = Number(card.positionLockedUntilTurn) >= turnNumber;
        const isPositionLocked = card.placedTurn === turnNumber
            || card.lastPositionChangeTurn === turnNumber
            || isEffectLocked;
        const attackButton = this.actionPanel.query('[data-position="attack"]');
        const defenseButton = this.actionPanel.query('[data-position="defense"]');
        const effectButton = this.actionPanel.query('[data-position="effect"]');

        attackButton.querySelector(".action-main").textContent = isFaceDown ? "反転召喚" : "攻撃表示";
        attackButton.querySelector(".action-sub").textContent = isFaceDown ? "FLIP SUMMON" : "ATTACK";
        defenseButton.hidden = isFaceDown;
        effectButton.hidden = isFaceDown || !this.canActivateEffect?.(card);
        this.actionPanel.toggle("flip-mode", isFaceDown);
        this.actionPanel.toggle("position-locked", isPositionLocked);

        this.selectedMonster = { zone, card, placedElement, onPositionChange };
        this.actionPanel.show(zone.element);
        this.onAnnounce?.(isFaceDown
            ? `【${card.name}】反転召喚または効果確認を選んでください`
            : `【${card.name}】変更する表示形式を選んでください`);
    }

    choosePosition(position) {
        const target = this.selectedMonster;
        if (!target) return;
        if (!this.requireMainPhase("モンスターの表示形式変更")) return;

        const { card, placedElement, onPositionChange } = target;
        const turnNumber = this.turnManager.turnNumber;

        if (position === "effect") {
            if (this.onActivateEffect?.(target)) this.reset();
            return;
        }

        if (card.placedTurn === turnNumber) {
            this.onAnnounce?.(`【${card.name}】は出したターンに表示形式を変更できません`);
            return;
        }
        if (card.lastPositionChangeTurn === turnNumber) {
            this.onAnnounce?.(`【${card.name}】はこのターンすでに表示形式を変更しています`);
            return;
        }
        if (card.lastAttackTurn === turnNumber) {
            this.onAnnounce?.(`【${card.name}】は攻撃したターンに表示形式を変更できません`);
            return;
        }
        if (Number(card.positionLockedUntilTurn) >= turnNumber) {
            this.onAnnounce?.(`【${card.name}】は効果により次の自分ターン終了時まで表示形式を変更できません`);
            return;
        }

        const useDefenseMode = position === "defense";
        if (placedElement.classList.contains("face-down")) {
            if (this.turnManager.isSummonRestricted("player")) {
                this.onAnnounce?.("【スケープ・ゴート】を発動したターンは反転召喚できません");
                return;
            }
            placedElement.classList.remove("face-down", "defense-mode");
            placedElement.innerHTML = card.faceHtml;
            placedElement.title = `${card.name} (クリックで表示形式変更)`;
            card.setBattlePosition(placedElement, false);
            card.lastPositionChangeTurn = turnNumber;
            this.turnManager.markSummonPerformed("player");
            this.reset();
            this.onAnnounce?.(`【${card.name}】を反転召喚！`);
            this.onFlipSummon?.({ ...target, reason: "flip-summon" });
            return;
        }

        if (card.isDefenseMode === useDefenseMode) {
            this.reset();
            this.onAnnounce?.(`【${card.name}】はすでにその表示形式です`);
            return;
        }

        card.setBattlePosition(placedElement, useDefenseMode, onPositionChange);
        card.lastPositionChangeTurn = turnNumber;
        this.reset();
    }

    reset() {
        this.actionPanel.hide("flip-mode", "position-locked");
        this.selectedMonster = null;
    }
}
