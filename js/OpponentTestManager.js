export class OpponentTestManager {
    constructor({ field, createCard, onBeforePlace, onAnnounce, onMonsterClick } = {}) {
        this.field = field;
        this.createCard = createCard;
        this.onBeforePlace = onBeforePlace;
        this.onAnnounce = onAnnounce;
        this.onMonsterClick = onMonsterClick;
        this.monsters = [];
        this.nextMonsterIndex = 0;
        this.selectedPosition = "attack";
        this.button = document.getElementById("test-opponent-monster-button");
        this.positionButtons = [...document.querySelectorAll("[data-test-position]")];

        if (this.button) {
            this.button.addEventListener("click", (event) => {
                event.stopPropagation();
                this.placeNextMonster();
            });
        }

        this.positionButtons.forEach(button => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                this.selectPosition(button.dataset.testPosition);
            });
        });
    }

    setCardPool(cards) {
        this.monsters = cards.filter(card => card.cardType === "monster");
        this.nextMonsterIndex = 0;
        this.updateButtonState();
    }

    placeNextMonster() {
        const zone = this.getEmptyMonsterZone();
        if (!zone) {
            if (this.onAnnounce) this.onAnnounce("相手のモンスターゾーンが埋まっています");
            this.updateButtonState();
            return;
        }

        if (this.monsters.length === 0 || !this.createCard) {
            if (this.onAnnounce) this.onAnnounce("テスト用モンスターを準備できませんでした");
            return;
        }

        if (this.onBeforePlace) this.onBeforePlace();

        const cardData = this.monsters[this.nextMonsterIndex % this.monsters.length];
        this.nextMonsterIndex += 1;
        const card = this.createCard(cardData);
        if (!card) return;

        card.owner = "opponent";
        card.controller = "opponent";
        const isSet = this.selectedPosition === "set";
        const placedElement = zone.placeCard(card, null, {
            faceDown: isSet,
            onMonsterClick: (clickedZone, placedCard, element) => {
                if (this.onMonsterClick) this.onMonsterClick(clickedZone, placedCard, element);
            }
        });
        placedElement.classList.add("opponent-monster");

        if (this.selectedPosition === "defense") {
            card.setBattlePosition(placedElement, true);
        }

        const positionLabel = {
            attack: "表側攻撃表示",
            defense: "表側守備表示",
            set: "裏側守備表示"
        }[this.selectedPosition];
        placedElement.title = isSet ? "裏側守備表示モンスター" : `${card.name}（${positionLabel}）`;

        if (this.onAnnounce) {
            const cardLabel = isSet ? "モンスター" : `【${card.name}】`;
            this.onAnnounce(`テスト配置：${cardLabel}を${positionLabel}で配置しました`);
        }
        this.updateButtonState();
    }

    selectPosition(position) {
        if (!["attack", "defense", "set"].includes(position)) return;

        this.selectedPosition = position;
        this.positionButtons.forEach(button => {
            const isSelected = button.dataset.testPosition === position;
            button.classList.toggle("active", isSelected);
            button.setAttribute("aria-pressed", String(isSelected));
        });
    }

    getEmptyMonsterZone() {
        return this.field?.zones.find(zone =>
            zone.element.closest(".opponent-field") &&
            zone.element.classList.contains("zone-monster") &&
            !zone.isOccupied
        ) || null;
    }

    updateButtonState() {
        if (!this.button) return;

        const isReady = this.monsters.length > 0;
        const hasEmptyZone = Boolean(this.getEmptyMonsterZone());
        this.button.disabled = !isReady || !hasEmptyZone;
        this.positionButtons.forEach(button => {
            button.disabled = !isReady || !hasEmptyZone;
        });
    }
}
