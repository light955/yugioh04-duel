export class CardSelectionDialog {
    constructor() {
        this.selectedCards = new Set();
        this.requiredCount = 0;
        this.maxCount = 0;
        this.canConfirm = null;
        this.getStatusText = null;
        this.onComplete = null;
        this.hideTimeoutId = null;
        this.element = this.createElement();
        document.body.appendChild(this.element);
    }

    get isOpen() {
        return !this.element.hidden;
    }

    createElement() {
        const overlay = document.createElement("div");
        overlay.className = "card-selection-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <section class="card-selection-dialog" role="dialog" aria-modal="true" aria-labelledby="card-selection-title">
                <header class="card-selection-header">
                    <div>
                        <span class="card-selection-kicker">SELECT CARDS</span>
                        <h2 id="card-selection-title"></h2>
                    </div>
                    <span class="card-selection-count"></span>
                </header>
                <div class="card-selection-grid"></div>
                <footer class="card-selection-footer">
                    <button class="card-selection-confirm" type="button" disabled>墓地へ送る</button>
                </footer>
            </section>
        `;
        overlay.addEventListener("click", event => event.stopPropagation());
        overlay.querySelector(".card-selection-confirm").addEventListener("click", () => this.complete());
        return overlay;
    }

    open({
        cards,
        requiredCount,
        maxCount = requiredCount,
        canConfirm,
        getStatusText,
        title,
        confirmLabel = "墓地へ送る",
        kicker = "SELECT CARDS",
        onComplete
    }) {
        if (this.hideTimeoutId !== null) {
            window.clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }
        this.selectedCards.clear();
        this.requiredCount = requiredCount;
        this.maxCount = maxCount;
        this.canConfirm = canConfirm || (selectedCards => selectedCards.length === requiredCount);
        this.getStatusText = getStatusText || (selectedCards => `${selectedCards.length} / ${requiredCount}`);
        this.onComplete = onComplete;
        this.element.querySelector("#card-selection-title").textContent = title;
        this.element.querySelector(".card-selection-kicker").textContent = kicker;
        this.element.querySelector(".card-selection-confirm").textContent = confirmLabel;

        const grid = this.element.querySelector(".card-selection-grid");
        grid.replaceChildren();
        cards.forEach(card => grid.appendChild(this.createChoice(card)));

        this.element.hidden = false;
        this.updateStatus();
        requestAnimationFrame(() => this.element.classList.add("show"));
    }

    createChoice(card) {
        const button = document.createElement("button");
        button.className = "card-selection-choice";
        button.type = "button";
        button.title = card.name;

        const preview = card.element.cloneNode(true);
        preview.classList.remove("selected");
        preview.classList.add("card-selection-preview");
        button.appendChild(preview);
        button.addEventListener("click", () => this.toggleCard(card, button));
        return button;
    }

    toggleCard(card, button) {
        if (this.selectedCards.has(card)) {
            this.selectedCards.delete(card);
            button.classList.remove("selected");
        } else if (this.selectedCards.size < this.maxCount) {
            this.selectedCards.add(card);
            button.classList.add("selected");
        }
        this.updateStatus();
    }

    updateStatus() {
        const cards = [...this.selectedCards];
        this.element.querySelector(".card-selection-count").textContent = this.getStatusText(cards);
        this.element.querySelector(".card-selection-confirm").disabled = !this.canConfirm(cards);
    }

    complete() {
        const cards = [...this.selectedCards];
        if (!this.canConfirm(cards)) return;
        this.element.classList.remove("show");
        this.hideTimeoutId = window.setTimeout(() => {
            this.hideTimeoutId = null;
            this.element.hidden = true;
            this.element.querySelector(".card-selection-grid").replaceChildren();
        }, 180);
        this.onComplete?.(cards);
        this.onComplete = null;
        this.selectedCards.clear();
    }
}
