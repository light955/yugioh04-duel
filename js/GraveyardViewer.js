export class GraveyardViewer {
    constructor({
        getCards,
        onBeforeOpen,
        graveyardSelector = ".you-field .zone-graveyard",
        listButtonSelector = "#graveyard-list-button",
        kicker = "PLAYER CARD ARCHIVE",
        title = "GRAVEYARD",
        titleId = "player-graveyard-dialog-title",
        emptyMessage = "墓地にカードはありません",
        variant = "player"
    } = {}) {
        this.getCards = getCards || (() => []);
        this.onBeforeOpen = onBeforeOpen;
        this.graveyardSelector = graveyardSelector;
        this.listButtonSelector = listButtonSelector;
        this.kicker = kicker;
        this.title = title;
        this.titleId = titleId;
        this.emptyMessage = emptyMessage;
        this.variant = variant;
        this.element = this.createElement();
        this.listElement = this.element.querySelector(".graveyard-card-list");
        this.countElement = this.element.querySelector(".graveyard-dialog-count");

        this.bindEvents();
        document.body.appendChild(this.element);
    }

    createElement() {
        const viewer = document.createElement("div");
        viewer.className = `graveyard-viewer ${this.variant}-graveyard-viewer`;
        viewer.hidden = true;
        viewer.innerHTML = `
            <section class="graveyard-dialog" role="dialog" aria-modal="true" aria-labelledby="${this.titleId}">
                <header class="graveyard-dialog-header">
                    <div>
                        <span class="graveyard-dialog-kicker">${this.kicker}</span>
                        <h2 id="${this.titleId}">${this.title}</h2>
                    </div>
                    <div class="graveyard-dialog-actions">
                        <span class="graveyard-dialog-count">0 CARDS</span>
                        <button class="graveyard-close-button" type="button" aria-label="${this.title}を閉じる" title="閉じる">×</button>
                    </div>
                </header>
                <div class="graveyard-card-list"></div>
            </section>
        `;
        return viewer;
    }

    bindEvents() {
        const graveyardZone = document.querySelector(this.graveyardSelector);
        const listButton = this.listButtonSelector
            ? document.querySelector(this.listButtonSelector)
            : null;

        const openViewer = (event) => {
            event.stopPropagation();
            this.onBeforeOpen?.();
            this.show();
        };

        if (graveyardZone) {
            graveyardZone.title = "クリックして墓地のカード一覧を表示";
            graveyardZone.addEventListener("click", openViewer);
        }
        listButton?.addEventListener("click", openViewer);

        this.element.addEventListener("click", (event) => {
            event.stopPropagation();
            if (event.target === this.element || event.target.closest(".graveyard-close-button")) {
                this.hide();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") this.hide();
        });
    }

    show() {
        this.render();
        this.element.hidden = false;
        requestAnimationFrame(() => this.element.classList.add("show"));
    }

    hide() {
        if (this.element.hidden) return;

        this.element.classList.remove("show");
        setTimeout(() => {
            if (!this.element.classList.contains("show")) {
                this.element.hidden = true;
            }
        }, 180);
    }

    render() {
        const cards = this.getCards();
        this.countElement.textContent = `${cards.length} ${cards.length === 1 ? "CARD" : "CARDS"}`;
        this.listElement.replaceChildren();

        if (cards.length === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "graveyard-empty";
            emptyMessage.textContent = this.emptyMessage;
            this.listElement.appendChild(emptyMessage);
            return;
        }

        [...cards].reverse().forEach((card, index) => {
            const row = document.createElement("div");
            const typeClass = card.isMonster ? "monster" : card.isSpell ? "spell" : "trap";
            const typeLabel = card.isMonster ? "MONSTER" : card.isSpell ? "SPELL" : "TRAP";
            row.className = `graveyard-list-row ${typeClass}`;

            const order = document.createElement("span");
            order.className = "graveyard-list-order";
            order.textContent = String(cards.length - index).padStart(2, "0");

            const name = document.createElement("span");
            name.className = "graveyard-list-name";
            name.textContent = card.name;

            const type = document.createElement("span");
            type.className = "graveyard-list-type";
            type.textContent = typeLabel;

            row.append(order, name, type);
            this.listElement.appendChild(row);
        });
    }

}
