const PLAYER_NAME_STORAGE_KEY = "duelMetaversePlayerName";
const PLAYER_NAME_MAX_LENGTH = 16;

function normalizePlayerName(value) {
    return Array.from(String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/[<>]/g, "")
        .replace(/\s+/g, " ")
        .trim())
        .slice(0, PLAYER_NAME_MAX_LENGTH)
        .join("");
}

export class MetaverseTitleScreen {
    constructor({ element, form, input, messageElement, onEnter }) {
        this.element = element;
        this.form = form;
        this.input = input;
        this.messageElement = messageElement;
        this.onEnter = onEnter;

        this.restorePlayerName();
        this.form.addEventListener("submit", event => this.submit(event));
        this.input.addEventListener("input", () => this.clearError());
        window.setTimeout(() => this.input.focus(), 250);
    }

    restorePlayerName() {
        try {
            this.input.value = normalizePlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY));
            if (this.input.value) this.input.select();
        } catch {
            this.input.value = "";
        }
    }

    submit(event) {
        event.preventDefault();
        const playerName = normalizePlayerName(this.input.value);
        if (!playerName) {
            this.messageElement.textContent = "名前を入力してください";
            this.messageElement.classList.add("is-error");
            this.input.focus();
            return;
        }

        this.input.value = playerName;
        try {
            localStorage.setItem(PLAYER_NAME_STORAGE_KEY, playerName);
        } catch {
            // 保存できない環境でも、今回の入場には入力名を使用する。
        }
        this.onEnter?.(playerName);
        this.close();
    }

    clearError() {
        this.messageElement.textContent = "1〜16文字で入力してください";
        this.messageElement.classList.remove("is-error");
    }

    close() {
        this.input.blur();
        document.body.classList.add("world-entered");
        this.element.classList.add("is-closing");
        window.setTimeout(() => {
            this.element.hidden = true;
        }, 320);
    }
}

export { normalizePlayerName };
