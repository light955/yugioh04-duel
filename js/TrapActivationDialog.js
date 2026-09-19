export class TrapActivationDialog {
    constructor() {
        this.resolveChoice = null;
        this.hideTimeoutId = null;
        this.element = this.createElement();
        document.body.appendChild(this.element);
    }

    createElement() {
        const overlay = document.createElement("div");
        overlay.className = "trap-activation-overlay";
        overlay.hidden = true;
        overlay.innerHTML = `
            <section class="trap-activation-dialog" role="dialog" aria-modal="true" aria-labelledby="trap-activation-title">
                <header class="trap-activation-header">
                    <span class="trap-activation-kicker">ATTACK RESPONSE</span>
                    <h2 id="trap-activation-title">罠カードを発動しますか？</h2>
                </header>
                <div class="trap-activation-body">
                    <div class="trap-activation-preview"></div>
                    <div class="trap-activation-message">
                        <strong class="trap-activation-card-name"></strong>
                        <span class="trap-activation-attacker"></span>
                    </div>
                </div>
                <footer class="trap-activation-actions">
                    <button class="trap-response-button decline" type="button">見送る</button>
                    <button class="trap-response-button activate" type="button">発動</button>
                </footer>
            </section>
        `;
        overlay.addEventListener("click", event => event.stopPropagation());
        overlay.querySelector(".trap-response-button.decline").addEventListener("click", () => this.close(false));
        overlay.querySelector(".trap-response-button.activate").addEventListener("click", () => this.close(true));
        return overlay;
    }

    open({
        card,
        attacker = null,
        message = "",
        kicker = "TRAP RESPONSE",
        title = "罠カードを発動しますか？",
        declineLabel = "見送る",
        activateLabel = "発動"
    }) {
        if (this.resolveChoice) this.close(false);
        if (this.hideTimeoutId !== null) {
            window.clearTimeout(this.hideTimeoutId);
            this.hideTimeoutId = null;
        }

        const previewContainer = this.element.querySelector(".trap-activation-preview");
        const preview = card.element.cloneNode(true);
        preview.classList.remove("selected", "placed-card", "face-down");
        preview.classList.add("trap-response-preview-card");
        previewContainer.replaceChildren(preview);

        this.element.querySelector(".trap-activation-card-name").textContent = `【${card.name}】`;
        this.element.querySelector(".trap-activation-kicker").textContent = kicker;
        this.element.querySelector("#trap-activation-title").textContent = title;
        this.element.querySelector(".trap-response-button.decline").textContent = declineLabel;
        this.element.querySelector(".trap-response-button.activate").textContent = activateLabel;
        this.element.querySelector(".trap-activation-attacker").textContent = message
            || `相手の【${attacker?.card?.name || "モンスター"}】が攻撃を宣言しました`;

        this.element.hidden = false;
        requestAnimationFrame(() => this.element.classList.add("show"));

        return new Promise(resolve => {
            this.resolveChoice = resolve;
        });
    }

    close(shouldActivate) {
        if (!this.resolveChoice) return;

        const resolve = this.resolveChoice;
        this.resolveChoice = null;
        this.element.classList.remove("show");
        this.hideTimeoutId = window.setTimeout(() => {
            this.hideTimeoutId = null;
            this.element.hidden = true;
            this.element.querySelector(".trap-activation-preview").replaceChildren();
        }, 180);
        resolve(shouldActivate);
    }
}
