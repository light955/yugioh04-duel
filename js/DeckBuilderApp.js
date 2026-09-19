const CARD_TYPE_LABELS = {
    monster: "MONSTER",
    spell: "SPELL",
    trap: "TRAP"
};

const CARD_TYPE_SYMBOLS = {
    monster: "M",
    spell: "S",
    trap: "T"
};

const DECK_SIZE = 40;
const COPY_LIMIT = 3;
const DRAFT_STORAGE_KEY = "duelPlayerDeckDraft";
const ACTIVE_DECK_STORAGE_KEY = "duelPlayerDeck";
const PURCHASED_CARDS_STORAGE_KEY = "duelMetaverseOwnedCards";

class DeckBuilderApp {
    constructor() {
        this.cards = [];
        this.cardsById = new Map();
        this.purchasedCounts = {};
        this.deckIds = [];
        this.selectedCardId = null;
        this.activeFilter = "all";
        this.mobileView = "collection";

        this.cacheElements();
        this.bindEvents();
        this.load();
    }

    cacheElements() {
        this.searchInput = document.getElementById("card-search");
        this.sortSelect = document.getElementById("card-sort");
        this.filterButtons = [...document.querySelectorAll("[data-card-filter]")];
        this.collectionElement = document.getElementById("card-collection");
        this.collectionEmptyElement = document.getElementById("collection-empty");
        this.collectionResultCountElement = document.getElementById("collection-result-count");
        this.deckListElement = document.getElementById("deck-card-list");
        this.deckCountElement = document.getElementById("deck-count");
        this.mobileDeckCountElement = document.getElementById("mobile-deck-count");
        this.deckMonsterCountElement = document.getElementById("deck-monster-count");
        this.deckSpellCountElement = document.getElementById("deck-spell-count");
        this.deckTrapCountElement = document.getElementById("deck-trap-count");
        this.saveStatusElement = document.getElementById("deck-save-status");
        this.detailElement = document.getElementById("selected-card-detail");
        this.detailSymbolElement = document.getElementById("detail-card-symbol");
        this.detailIdElement = document.getElementById("detail-card-id");
        this.detailNameElement = document.getElementById("detail-card-name");
        this.detailMetaElement = document.getElementById("detail-card-meta");
        this.detailDescriptionElement = document.getElementById("detail-card-description");
        this.detailOwnedCountElement = document.getElementById("detail-owned-count");
        this.detailDeckCountElement = document.getElementById("detail-deck-count");
        this.detailAddButton = document.getElementById("detail-add-card");
    }

    bindEvents() {
        this.searchInput.addEventListener("input", () => this.renderCollection());
        this.sortSelect.addEventListener("change", () => this.renderCollection());
        this.filterButtons.forEach(button => {
            button.addEventListener("click", () => this.setFilter(button.dataset.cardFilter));
        });
        this.detailAddButton.addEventListener("click", () => this.addCard(this.selectedCardId));
        document.querySelectorAll("[data-editor-view]").forEach(button => {
            button.addEventListener("click", () => this.setMobileView(button.dataset.editorView));
        });
        document.getElementById("save-deck").addEventListener("click", () => this.saveDeck());
        document.getElementById("reset-deck").addEventListener("click", () => this.resetDeck());
    }

    async load() {
        try {
            const response = await fetch("cards.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`カードデータを取得できませんでした: ${response.status}`);
            this.cards = await response.json();
            this.cardsById = new Map(this.cards.map(card => [card.id, card]));
            this.purchasedCounts = this.readStoredObject(PURCHASED_CARDS_STORAGE_KEY);
            this.deckIds = this.loadInitialDeck();
            this.selectedCardId = this.cards[0]?.id ?? null;
            this.renderAll();
        } catch (error) {
            console.error(error);
            this.saveStatusElement.textContent = "カードデータを読み込めませんでした。";
        }
    }

    readStoredObject(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "{}");
            return value && !Array.isArray(value) ? value : {};
        } catch {
            return {};
        }
    }

    readStoredArray(key) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return Array.isArray(value) ? value : null;
        } catch {
            return null;
        }
    }

    loadInitialDeck() {
        const storedDraft = this.readStoredArray(DRAFT_STORAGE_KEY);
        if (storedDraft && this.isDeckDataUsable(storedDraft)) return [...storedDraft];

        const activeDeck = this.readStoredArray(ACTIVE_DECK_STORAGE_KEY);
        if (activeDeck && this.isDeckDataUsable(activeDeck)) return [...activeDeck];

        return this.cards.map(card => card.id);
    }

    isDeckDataUsable(deckIds) {
        if (deckIds.length > DECK_SIZE) return false;
        const counts = this.countIds(deckIds);
        return deckIds.every(id => this.cardsById.has(id)) &&
            [...counts.entries()].every(([id, count]) => count <= this.getDeckCopyLimit(id));
    }

    getOwnedCount(cardId) {
        return 1 + Math.max(0, Number(this.purchasedCounts[cardId]) || 0);
    }

    getDeckCopyLimit(cardId) {
        return Math.min(COPY_LIMIT, this.getOwnedCount(cardId));
    }

    getDeckCount(cardId) {
        return this.deckIds.filter(id => id === cardId).length;
    }

    countIds(ids) {
        return ids.reduce((counts, id) => {
            counts.set(id, (counts.get(id) || 0) + 1);
            return counts;
        }, new Map());
    }

    setFilter(filter) {
        this.activeFilter = filter;
        this.filterButtons.forEach(button => {
            const isActive = button.dataset.cardFilter === filter;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
        this.renderCollection();
    }

    setMobileView(view) {
        if (view !== "collection" && view !== "deck") return;
        this.mobileView = view;
        document.querySelector(".editor-main").dataset.mobileView = view;
        document.querySelectorAll("[data-editor-view]").forEach(button => {
            const isActive = button.dataset.editorView === view;
            button.classList.toggle("active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
        });
        window.scrollTo({ top: 0, behavior: "auto" });
    }

    getVisibleCards() {
        const query = this.searchInput.value.trim().toLocaleLowerCase("ja");
        const filteredCards = this.cards.filter(card => {
            if (this.activeFilter !== "all" && card.cardType !== this.activeFilter) return false;
            if (!query) return true;
            const searchableText = [
                card.name,
                card.race,
                card.attribute,
                card.description,
                ...(card.subTypes || [])
            ].filter(Boolean).join(" ").toLocaleLowerCase("ja");
            return searchableText.includes(query);
        });

        const sortMode = this.sortSelect.value;
        return filteredCards.sort((left, right) => {
            if (sortMode === "name") return left.name.localeCompare(right.name, "ja");
            if (sortMode === "type") {
                return left.cardType.localeCompare(right.cardType) || left.id.localeCompare(right.id);
            }
            if (sortMode === "atk") {
                return (Number(right.atk) || -1) - (Number(left.atk) || -1) || left.id.localeCompare(right.id);
            }
            return left.id.localeCompare(right.id);
        });
    }

    renderAll() {
        this.renderCollection();
        this.renderDeck();
        this.renderSelectedCard();
    }

    renderCollection() {
        const visibleCards = this.getVisibleCards();
        const fragment = document.createDocumentFragment();
        visibleCards.forEach(card => fragment.append(this.createCollectionCard(card)));
        this.collectionElement.replaceChildren(fragment);
        this.collectionEmptyElement.hidden = visibleCards.length > 0;
        this.collectionResultCountElement.textContent = `${visibleCards.length} CARDS`;
    }

    createCollectionCard(card) {
        const deckCount = this.getDeckCount(card.id);
        const ownedCount = this.getOwnedCount(card.id);
        const canAdd = this.canAddCard(card.id);
        const element = document.createElement("article");
        element.className = "collection-card";
        element.dataset.cardId = card.id;
        element.dataset.cardType = card.cardType;
        element.classList.toggle("selected", card.id === this.selectedCardId);
        element.tabIndex = 0;
        element.setAttribute("aria-label", `${card.name}を選択`);

        const code = document.createElement("span");
        code.className = "collection-card-code";
        code.textContent = card.id;
        const name = document.createElement("h3");
        name.textContent = card.name;
        const meta = document.createElement("span");
        meta.className = "collection-card-meta";
        meta.textContent = this.getCardMeta(card);
        const stats = document.createElement("span");
        stats.className = "collection-card-stats";
        stats.textContent = card.cardType === "monster"
            ? `ATK ${card.atk} / DEF ${card.def}`
            : (card.subTypes || []).join(" / ");
        const counts = document.createElement("span");
        counts.className = "collection-card-counts";
        counts.innerHTML = `<span>OWNED ${ownedCount}</span><span>DECK ${deckCount}</span>`;
        const addButton = document.createElement("button");
        addButton.className = "card-add-button";
        addButton.type = "button";
        addButton.textContent = "+";
        addButton.title = `${card.name}をデッキへ追加`;
        addButton.setAttribute("aria-label", addButton.title);
        addButton.disabled = !canAdd;
        addButton.addEventListener("click", event => {
            event.stopPropagation();
            this.addCard(card.id);
        });

        const select = () => this.selectCard(card.id);
        element.addEventListener("click", select);
        element.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                select();
            }
        });
        element.append(code, name, meta, stats, counts, addButton);
        return element;
    }

    renderDeck() {
        const deckCounts = this.countIds(this.deckIds);
        const fragment = document.createDocumentFragment();
        this.cards.forEach(card => {
            const count = deckCounts.get(card.id) || 0;
            if (count > 0) fragment.append(this.createDeckRow(card, count));
        });
        this.deckListElement.replaceChildren(fragment);

        const typeCounts = { monster: 0, spell: 0, trap: 0 };
        this.deckIds.forEach(id => {
            const cardType = this.cardsById.get(id)?.cardType;
            if (cardType in typeCounts) typeCounts[cardType] += 1;
        });
        this.deckMonsterCountElement.textContent = String(typeCounts.monster);
        this.deckSpellCountElement.textContent = String(typeCounts.spell);
        this.deckTrapCountElement.textContent = String(typeCounts.trap);
        this.deckCountElement.textContent = `${this.deckIds.length} / ${DECK_SIZE}`;
        this.mobileDeckCountElement.textContent = String(this.deckIds.length);
        this.deckCountElement.classList.toggle("invalid", this.deckIds.length !== DECK_SIZE);
        this.saveStatusElement.textContent = this.deckIds.length === DECK_SIZE
            ? "40枚のデッキが使用できます。"
            : `あと${DECK_SIZE - this.deckIds.length}枚で使用デッキとして保存できます。`;
    }

    createDeckRow(card, count) {
        const row = document.createElement("div");
        row.className = "deck-card-row";
        row.dataset.cardId = card.id;
        row.dataset.cardType = card.cardType;
        const type = document.createElement("span");
        type.className = "deck-card-type";
        const info = document.createElement("button");
        info.className = "deck-card-info";
        info.type = "button";
        info.innerHTML = `<strong></strong><span></span>`;
        info.querySelector("strong").textContent = card.name;
        info.querySelector("span").textContent = `${card.id} // OWNED ${this.getOwnedCount(card.id)}`;
        info.addEventListener("click", () => {
            this.selectCard(card.id);
            if (window.matchMedia("(max-width: 920px)").matches) {
                this.setMobileView("collection");
            }
        });
        const stepper = document.createElement("div");
        stepper.className = "deck-stepper";
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.textContent = "−";
        removeButton.title = `${card.name}を1枚外す`;
        removeButton.setAttribute("aria-label", removeButton.title);
        removeButton.addEventListener("click", () => this.removeCard(card.id));
        const countElement = document.createElement("span");
        countElement.textContent = String(count);
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = "+";
        addButton.title = `${card.name}を1枚追加`;
        addButton.setAttribute("aria-label", addButton.title);
        addButton.disabled = !this.canAddCard(card.id);
        addButton.addEventListener("click", () => this.addCard(card.id));
        stepper.append(removeButton, countElement, addButton);
        row.append(type, info, stepper);
        return row;
    }

    renderSelectedCard() {
        const card = this.cardsById.get(this.selectedCardId);
        if (!card) return;
        this.detailElement.dataset.cardType = card.cardType;
        this.detailSymbolElement.textContent = CARD_TYPE_SYMBOLS[card.cardType] || "C";
        this.detailIdElement.textContent = card.id;
        this.detailNameElement.textContent = card.name;
        this.detailMetaElement.textContent = this.getCardDetailMeta(card);
        this.detailDescriptionElement.textContent = card.description || "効果テキストは登録されていません。";
        this.detailOwnedCountElement.textContent = String(this.getOwnedCount(card.id));
        this.detailDeckCountElement.textContent = String(this.getDeckCount(card.id));
        this.detailAddButton.disabled = !this.canAddCard(card.id);
        this.detailAddButton.title = `${card.name}をデッキへ追加`;
        this.detailAddButton.setAttribute("aria-label", this.detailAddButton.title);
    }

    getCardMeta(card) {
        if (card.cardType === "monster") {
            return `LV ${card.level} / ${card.attribute || "-"} / ${card.race || "-"}`;
        }
        return CARD_TYPE_LABELS[card.cardType] || "CARD";
    }

    getCardDetailMeta(card) {
        if (card.cardType === "monster") {
            return `MONSTER / LV ${card.level} / ${card.attribute || "-"} / ${card.race || "-"} / ATK ${card.atk} / DEF ${card.def}`;
        }
        return `${CARD_TYPE_LABELS[card.cardType]} / ${(card.subTypes || []).join(" / ")}`;
    }

    selectCard(cardId) {
        if (!this.cardsById.has(cardId)) return;
        this.selectedCardId = cardId;
        this.renderCollection();
        this.renderSelectedCard();
    }

    canAddCard(cardId) {
        return Boolean(cardId) &&
            this.deckIds.length < DECK_SIZE &&
            this.getDeckCount(cardId) < this.getDeckCopyLimit(cardId);
    }

    addCard(cardId) {
        if (!this.canAddCard(cardId)) return;
        this.deckIds.push(cardId);
        this.selectedCardId = cardId;
        this.renderAll();
    }

    removeCard(cardId) {
        const index = this.deckIds.lastIndexOf(cardId);
        if (index < 0) return;
        this.deckIds.splice(index, 1);
        this.selectedCardId = cardId;
        this.renderAll();
    }

    saveDeck() {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(this.deckIds));
        if (this.deckIds.length === DECK_SIZE) {
            localStorage.setItem(ACTIVE_DECK_STORAGE_KEY, JSON.stringify(this.deckIds));
            this.saveStatusElement.textContent = "40枚の使用デッキを保存しました。";
            return;
        }
        this.saveStatusElement.textContent = "編集中のデッキを保存しました。デュエルでは前回の40枚を使用します。";
    }

    resetDeck() {
        this.deckIds = this.cards.map(card => card.id);
        this.selectedCardId = this.cards[0]?.id ?? null;
        this.renderAll();
        this.saveStatusElement.textContent = "初期デッキへ戻しました。保存すると使用デッキに反映されます。";
    }
}

const app = new DeckBuilderApp();
document.querySelector(".editor-main").dataset.mobileView = app.mobileView;
