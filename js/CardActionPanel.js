export class CardActionPanel {
    constructor({ classNames = [], heading, actions, onAction, onEffect }) {
        this.element = document.createElement("div");
        this.element.classList.add("spell-action-panel", ...classNames);
        this.element.hidden = true;
        this.onAction = onAction;
        this.onEffect = onEffect;

        const headingElement = document.createElement("div");
        headingElement.className = "spell-action-heading";
        headingElement.textContent = heading;
        this.element.appendChild(headingElement);

        actions.forEach((action) => {
            const button = document.createElement("button");
            button.className = `spell-action-button ${action.className}`;
            button.type = "button";
            button.dataset.command = action.value;
            if (action.dataAttribute) {
                button.setAttribute(`data-${action.dataAttribute}`, action.value);
            }

            const mainLabel = document.createElement("span");
            mainLabel.className = "action-main";
            mainLabel.textContent = action.label;

            const subLabel = document.createElement("span");
            subLabel.className = "action-sub";
            subLabel.textContent = action.subLabel;

            button.append(mainLabel, subLabel);
            this.element.appendChild(button);
        });

        const effectButton = document.createElement("button");
        effectButton.className = "effect-check-button";
        effectButton.type = "button";
        effectButton.dataset.effectCheck = "";

        const effectIcon = document.createElement("span");
        effectIcon.className = "effect-check-icon";
        effectIcon.textContent = "i";

        const effectLabel = document.createElement("span");
        effectLabel.textContent = "効果確認";
        effectButton.append(effectIcon, effectLabel);
        this.element.appendChild(effectButton);

        this.element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (event.target.closest("button[data-effect-check]")) {
                this.onEffect?.();
                return;
            }

            const button = event.target.closest("button[data-command]");
            if (button) this.onAction?.(button.dataset.command);
        });

        document.body.appendChild(this.element);
    }

    show(anchorElement) {
        anchorElement.appendChild(this.element);
        this.element.hidden = false;
        this.element.classList.add("show");
    }

    hide(...stateClasses) {
        this.element.classList.remove("show", ...stateClasses);
        this.element.hidden = true;
    }

    query(selector) {
        return this.element.querySelector(selector);
    }

    toggle(className, force) {
        this.element.classList.toggle(className, force);
    }

    static createSpell(callbacks) {
        return new CardActionPanel({
            heading: "CARD COMMAND",
            actions: [
                { value: "activate", label: "発動", subLabel: "ACTIVATE", className: "activate", dataAttribute: "action" },
                { value: "set", label: "セット", subLabel: "SET", className: "set", dataAttribute: "action" }
            ],
            ...callbacks
        });
    }

    static createMonster(callbacks) {
        return new CardActionPanel({
            classNames: ["monster-action-panel"],
            heading: "MONSTER COMMAND",
            actions: [
                { value: "summon", label: "召喚", subLabel: "SUMMON", className: "summon", dataAttribute: "action" },
                { value: "set", label: "セット", subLabel: "SET", className: "set", dataAttribute: "action" }
            ],
            ...callbacks
        });
    }

    static createTrap(callbacks) {
        return new CardActionPanel({
            classNames: ["trap-action-panel"],
            heading: "TRAP COMMAND",
            actions: [
                { value: "set", label: "セット", subLabel: "SET", className: "set", dataAttribute: "action" }
            ],
            ...callbacks
        });
    }

    static createPosition(callbacks) {
        return new CardActionPanel({
            classNames: ["monster-position-panel"],
            heading: "BATTLE POSITION",
            actions: [
                { value: "attack", label: "攻撃表示", subLabel: "ATTACK", className: "attack", dataAttribute: "position" },
                { value: "defense", label: "守備表示", subLabel: "DEFENSE", className: "defense", dataAttribute: "position" }
            ],
            ...callbacks
        });
    }

    static createBattle(callbacks) {
        return new CardActionPanel({
            classNames: ["monster-battle-panel"],
            heading: "BATTLE COMMAND",
            actions: [
                { value: "attack", label: "攻撃", subLabel: "ATTACK", className: "attack-command", dataAttribute: "battle-action" }
            ],
            ...callbacks
        });
    }
}
