export class EffectDetailPanel {
    constructor() {
        this.element = this.createElement();
        document.body.appendChild(this.element);
    }

    createElement() {
        const panel = document.createElement("aside");
        panel.className = "effect-detail-panel";
        panel.hidden = true;
        panel.innerHTML = `
            <header class="effect-detail-header">
                <div>
                    <span class="effect-detail-kicker">CARD TEXT</span>
                    <h3 class="effect-detail-name"></h3>
                </div>
                <button class="effect-detail-close" type="button" aria-label="効果確認を閉じる" title="閉じる">×</button>
            </header>
            <div class="effect-detail-meta"></div>
            <p class="effect-detail-text"></p>
        `;

        panel.addEventListener("click", (event) => {
            event.stopPropagation();
            if (event.target.closest(".effect-detail-close")) this.hide();
        });

        return panel;
    }

    show(card, anchorElement = card?.element) {
        if (!card || !anchorElement) return;

        const typeLabel = card.isMonster ? "MONSTER" : card.isSpell ? "SPELL" : "TRAP";
        const details = [typeLabel, ...card.subTypes];
        if (card.attribute) details.push(card.attribute);
        if (card.race) details.push(card.race);

        this.element.querySelector(".effect-detail-name").textContent = card.name;
        this.element.querySelector(".effect-detail-meta").textContent = details.join(" / ");
        this.element.querySelector(".effect-detail-text").textContent = card.description;
        this.element.classList.toggle("monster", card.isMonster);
        this.element.classList.toggle("spell", card.isSpell);
        this.element.classList.toggle("trap", card.isTrap);
        this.element.hidden = false;

        const cardRect = anchorElement.getBoundingClientRect();
        const panelRect = this.element.getBoundingClientRect();
        const gap = 14;
        let left = cardRect.right + gap;
        let top = cardRect.bottom - panelRect.height;

        if (left + panelRect.width > window.innerWidth - 12) {
            left = cardRect.left - panelRect.width - gap;
        }

        left = Math.max(12, Math.min(left, window.innerWidth - panelRect.width - 12));
        top = Math.max(12, Math.min(top, window.innerHeight - panelRect.height - 12));
        this.element.style.left = `${left}px`;
        this.element.style.top = `${top}px`;
        requestAnimationFrame(() => this.element.classList.add("show"));
    }

    hide() {
        if (this.element.hidden) return;

        this.element.classList.remove("show");
        setTimeout(() => {
            if (!this.element.classList.contains("show")) {
                this.element.hidden = true;
            }
        }, 160);
    }
}
