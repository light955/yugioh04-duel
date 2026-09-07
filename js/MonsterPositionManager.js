import { CardActionPanel } from "./CardActionPanel.js?v=1";

export class MonsterPositionManager {
    constructor({ turnManager, requireMainPhase, onBeforeSelect, onAnnounce, onShowEffect }) {
        this.turnManager = turnManager;
        this.requireMainPhase = requireMainPhase;
        this.onBeforeSelect = onBeforeSelect;
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
        const isPositionLocked = card.placedTurn === turnNumber || card.lastPositionChangeTurn === turnNumber;
        const attackButton = this.actionPanel.query('[data-position="attack"]');
        const defenseButton = this.actionPanel.query('[data-position="defense"]');

        attackButton.querySelector(".action-main").textContent = isFaceDown ? "反転召喚" : "攻撃表示";
        attackButton.querySelector(".action-sub").textContent = isFaceDown ? "FLIP SUMMON" : "ATTACK";
        defenseButton.hidden = isFaceDown;
        this.actionPanel.toggle("flip-mode", isFaceDown);
        this.actionPanel.toggle("position-locked", isPositionLocked);

        this.selectedMonster = { card, placedElement, onPositionChange };
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

        const useDefenseMode = position === "defense";
        if (placedElement.classList.contains("face-down")) {
            placedElement.classList.remove("face-down", "defense-mode");
            placedElement.innerHTML = card.faceHtml;
            placedElement.title = `${card.name} (クリックで表示形式変更)`;
            card.setBattlePosition(placedElement, false);
            card.lastPositionChangeTurn = turnNumber;
            this.reset();
            this.onAnnounce?.(`【${card.name}】を反転召喚！`);
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
