import { Deck } from "./js/Deck.js?v=1";
import { Hand } from "./js/Hand.js?v=1";
import { DuelField } from "./js/DuelField.js?v=1";
import { ToastNotification } from "./js/ToastNotification.js?v=1";
import { EffectDetailPanel } from "./js/EffectDetailPanel.js?v=1";
import { TurnManager } from "./js/TurnManager.js?v=1";
import { BattleManager } from "./js/BattleManager.js?v=1";
import { SummonManager } from "./js/SummonManager.js?v=1";
import { SpellTrapManager } from "./js/SpellTrapManager.js?v=1";
import { GraveyardManager } from "./js/GraveyardManager.js?v=1";
import { MonsterPositionManager } from "./js/MonsterPositionManager.js?v=1";

// ==============================================================================
// 遊戯王 デュエルフィールド - オブジェクト指向 (OOP) リファクタリング
// ==============================================================================

/**
 * ------------------------------------------------------------------------------
 * DuelGame クラス (メイン司令塔)
 * ------------------------------------------------------------------------------
 * 各コンポーネントを接続し、カード選択とデュエル全体の進行を統括する。
 */
class DuelGame {
    constructor() {
        this.toast = new ToastNotification();
        this.selectedCard = null; // 現在選択されている Card
        this.deck = new Deck();

        // フィールドと手札の初期化（各イベントリスナーを接続）
        this.field = new DuelField((zone) => this.handleZoneClick(zone));
        this.hand = new Hand(".player-hand", (card) => this.handleCardClick(card));
        this.effectDetailPanel = new EffectDetailPanel();
        this.graveyardManager = new GraveyardManager({
            field: this.field,
            onBeforeOpen: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.battleManager = new BattleManager({
            field: this.field,
            getTurnNumber: () => this.turnNumber,
            getCurrentPhase: () => this.currentPhase,
            onBeforeSelect: () => this.deselect(),
            onBeforeFinish: () => this.deselect(),
            onAnnounce: (message) => this.toast.show(message),
            onShowEffect: (card, element) => this.effectDetailPanel.show(card, element)
        });
        this.turnManager = new TurnManager({
            canAdvance: () => !this.gameOver,
            onBeforeAdvance: () => this.deselect(),
            onDraw: () => this.drawOneCard({ announce: false }),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.monsterPositionManager = new MonsterPositionManager({
            turnManager: this.turnManager,
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            onBeforeSelect: () => this.deselect(),
            onAnnounce: (message) => this.toast.show(message),
            onShowEffect: (card, element) => this.effectDetailPanel.show(card, element)
        });
        this.summonManager = new SummonManager({
            field: this.field,
            hand: this.hand,
            turnManager: this.turnManager,
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            onAnnounce: (message) => this.toast.show(message),
            onDeselect: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onSendToGraveyard: (...args) => this.graveyardManager.send(...args),
            onPlacedMonsterClick: (...args) => this.handlePlacedMonsterClick(...args),
            onShowEffect: (card) => this.effectDetailPanel.show(card)
        });
        this.spellTrapManager = new SpellTrapManager({
            field: this.field,
            hand: this.hand,
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            onAnnounce: (message) => this.toast.show(message),
            onDeselect: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onSendToGraveyard: (...args) => this.graveyardManager.send(...args),
            onShowEffect: (card) => this.effectDetailPanel.show(card)
        });
        // 盤面外クリックによる選択解除イベント
        this.initGlobalEvents();
        this.initDeckClickDraw();
        this.updateCardCounts();

        // 開始アナウンス
        this.initDeck();
    }

    /**
     * cards.jsonからデッキを読み込み、初期手札5枚を生成する
     */
    async initDeck() {
        try {
            const response = await fetch("cards.json");
            const cards = await response.json();
            this.deck = new Deck(cards);
            this.hand.clear();
            this.drawInitialHand();
            this.updateDeckCounts();
            this.updateCardCounts();
            this.toast.show("デュエル開始！ TURN 1・MAIN 1");
        } catch (error) {
            console.error("デッキの読み込みに失敗しました:", error);
            this.toast.show("デッキの読み込みに失敗しました");
        }
    }

    /**
     * 初期手札として5枚ドローする
     */
    drawInitialHand() {
        for (let i = 0; i < 5; i++) {
            this.hand.addCardFromData(this.deck.draw(), (card) => this.handleCardClick(card));
        }
    }

    /**
     * 自分のデッキをクリックした時のドロー処理を登録する
     */
    initDeckClickDraw() {
        const playerDeck = document.getElementById("player-deck");
        if (!playerDeck) return;

        playerDeck.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.selectedCard) {
                this.deselect();
            }
            this.toast.show("カードはドローフェイズ開始時に自動でドローされます");
        });
    }

    /**
     * デッキから1枚ドローして手札に加える
     */
    drawOneCard({ announce = true } = {}) {
        const drawnCard = this.deck.draw();
        if (!drawnCard) {
            if (announce) this.toast.show("デッキが空です！");
            return null;
        }

        this.hand.addCardFromData(drawnCard, (card) => this.handleCardClick(card));
        this.updateDeckCounts();
        this.updateCardCounts();
        if (announce) this.toast.show(`ドロー！【${drawnCard.name}】を手札に加えました`);
        return drawnCard;
    }

    /**
     * 自分・相手デッキの残り枚数表示を更新する
     */
    updateDeckCounts() {
        document.querySelectorAll(".deck-count").forEach((element) => {
            element.textContent = this.deck.count;
        });
    }

    handlePlacedMonsterClick(zone, card, placedElement, onPositionChange) {
        if (this.currentPhase === "BATTLE") {
            this.battleManager.showCommands(zone, card, placedElement, onPositionChange);
            return;
        }

        this.monsterPositionManager.show(zone, card, placedElement, onPositionChange);
    }

    get currentPhase() {
        return this.turnManager.currentPhase;
    }

    get turnNumber() {
        return this.turnManager.turnNumber;
    }

    get hasNormalSummoned() {
        return this.turnManager.hasNormalSummoned;
    }

    get playerLP() {
        return this.battleManager.playerLP;
    }

    get opponentLP() {
        return this.battleManager.opponentLP;
    }

    get gameOver() {
        return this.battleManager.gameOver;
    }

    get graveyard() {
        return this.graveyardManager.cards;
    }

    get graveyardViewer() {
        return this.graveyardManager.viewer;
    }

    isMainPhase() {
        return this.turnManager.isMainPhase;
    }

    requireMainPhase(actionName) {
        if (this.isMainPhase()) return true;

        this.toast.show(`${actionName}はメインフェイズに行えます`);
        return false;
    }

    /**
     * 手札カードがクリックされたときのハンドラー
     * @param {Card} card - クリックされたカード
     */
    handleCardClick(card) {
        // すでに選択中のカードを再度押した場合は選択キャンセル
        if (this.selectedCard === card) {
            this.deselect();
            this.toast.show("選択をキャンセルしました");
            return;
        }

        // 新しいカードを選択
        this.deselect();
        this.selectedCard = card;
        card.select();

        if (card.isMonster) {
            this.summonManager.selectCard(card);
            return;
        }

        if (card.isSpell || card.isTrap) {
            this.spellTrapManager.selectCard(card);
        }
    }

    /**
     * ゾーンがクリックされたときのハンドラー
     * @param {Zone} zone - クリックされたゾーン
     */
    handleZoneClick(zone) {
        if (!this.selectedCard) return;

        if (this.selectedCard.isMonster) {
            this.summonManager.handleZoneClick(zone);
            return;
        }

        this.spellTrapManager.handleZoneClick(zone);
    }

    /**
     * 手札・フィールド・墓地の枚数表示を同期する
     */
    updateCardCounts() {
        const handCount = this.hand?.cards.length || 0;
        const fieldCount = this.field?.zones.filter(zone => {
            if (!zone.placedCard) return false;

            const isOwnZone = Boolean(zone.element.closest(".you-field"));
            const isExtraMonsterZone = zone.element.classList.contains("zone-emz");
            const isFieldCardZone = zone.element.matches(".zone-monster, .zone-spell, .zone-field, .zone-emz");
            return isFieldCardZone && (isOwnZone || isExtraMonsterZone);
        }).length || 0;

        const handElement = document.getElementById("hand-card-count");
        const fieldElement = document.getElementById("field-card-count");
        const graveyardElement = document.getElementById("graveyard-card-count");

        if (handElement) handElement.textContent = handCount;
        if (fieldElement) fieldElement.textContent = fieldCount;
        if (graveyardElement) graveyardElement.textContent = this.graveyard.length;
    }

    /**
     * カードの選択状態および盤面のハイライトを解除する
     */
    deselect() {
        this.summonManager.reset();
        this.spellTrapManager.reset();
        if (this.selectedCard) {
            this.selectedCard.deselect();
            this.selectedCard = null;
        }
        this.monsterPositionManager.reset();
        this.battleManager.hideCommands();
        this.effectDetailPanel.hide();
        this.field.clearAllHighlights();
    }

    /**
     * 盤面の余白クリック時に選択解除するイベントリスナー
     */
    initGlobalEvents() {
        document.addEventListener("click", () => {
            this.deselect();
        });
    }
}

// ==============================================================================
// ゲームインスタンスの生成・デュエル開始
// ==============================================================================
export const game = new DuelGame();
