import { Deck } from "./js/Deck.js?v=2";
import { Hand } from "./js/Hand.js?v=12";
import { DuelField } from "./js/DuelField.js?v=1";
import { ToastNotification } from "./js/ToastNotification.js?v=1";
import { EffectDetailPanel } from "./js/EffectDetailPanel.js?v=1";
import { CardEffectManager } from "./js/CardEffectManager.js?v=17";
import { ControlEffectManager } from "./js/ControlEffectManager.js?v=7";
import { RitualSummonManager } from "./js/RitualSummonManager.js?v=3";
import { FieldTargetManager } from "./js/FieldTargetManager.js?v=2";
import { MonsterEffectManager } from "./js/MonsterEffectManager.js?v=12";
import { TurnManager } from "./js/TurnManager.js?v=12";
import { BattleManager } from "./js/BattleManager.js?v=20";
import { SummonManager } from "./js/SummonManager.js?v=7";
import { SpellTrapManager } from "./js/SpellTrapManager.js?v=18";
import { GraveyardManager } from "./js/GraveyardManager.js?v=5";
import { MonsterPositionManager } from "./js/MonsterPositionManager.js?v=4";
import { OpponentTestManager } from "./js/OpponentTestManager.js?v=4";
import { OpponentHand } from "./js/OpponentHand.js?v=3";
import { OpponentAI } from "./js/OpponentAI.js?v=18";
import { OpponentSpellManager } from "./js/OpponentSpellManager.js?v=3";
import { OpponentTrapManager } from "./js/OpponentTrapManager.js?v=5";
import { OpponentRevealManager } from "./js/OpponentRevealManager.js?v=1";
import { DuelRewardManager } from "./js/DuelRewardManager.js?v=1";

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
        this.opponentDeck = new Deck();
        this.banishedCards = { player: [], opponent: [] };
        this.duelRewardManager = new DuelRewardManager();
        // フィールドと手札の初期化（各イベントリスナーを接続）
        this.field = new DuelField((zone) => this.handleZoneClick(zone));
        this.hand = new Hand(".player-hand");
        this.opponentHand = new OpponentHand(".opponent-hand", {
            createCard: (cardData) => this.hand.createCard(cardData)
        });
        this.opponentRevealManager = new OpponentRevealManager({
            field: this.field,
            hand: this.opponentHand,
            onAnnounce: (message) => this.toast.show(message)
        });
        this.effectDetailPanel = new EffectDetailPanel();
        this.fieldTargetManager = new FieldTargetManager({
            field: this.field,
            onAnnounce: (message) => this.toast.show(message)
        });
        this.controlEffectManager = new ControlEffectManager({
            field: this.field,
            targetManager: this.fieldTargetManager,
            getTurnNumber: () => this.turnNumber,
            getPlayerLP: () => this.playerLP,
            getPlayerMonsterTargets: () => this.getPlayerMonsterZones(),
            getOpponentMonsterTargets: () => this.getOpponentMonsterTargets(),
            getPlayerGraveyardMonsters: () => this.graveyardManager?.cards.filter(card => card.isMonster) || [],
            getOpponentGraveyardMonsters: () => this.opponentGraveyardManager?.cards.filter(card => card.isMonster) || [],
            hasEmptyPlayerMonsterZone: () => Boolean(this.getEmptyMonsterZone("player")),
            canSpecialSummon: () => !this.turnManager?.isSummonRestricted("player"),
            onPayLP: (target, amount) => this.battleManager.payLP(target, amount),
            onRecoverLP: (target, amount) => this.battleManager.recoverLP(target, amount),
            onMoveMonster: (zone, controller) => this.moveMonsterToController(zone, controller),
            onSwapMonsters: (playerZone, opponentZone) => this.swapMonsterControl(playerZone, opponentZone),
            onSpecialSummon: (card) => this.specialSummonFromGraveyard(card),
            onDestroyZone: (zone, options) => this.destroyZoneByEffect(zone, options),
            onSendEquipToGraveyard: (zone) => this.sendEquipToGraveyard(zone),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.ritualSummonManager = new RitualSummonManager({
            getHandCards: () => this.hand.cards,
            getPlayerMonsterZones: () => this.getPlayerMonsterZones(),
            hasEmptyPlayerMonsterZone: () => Boolean(this.getEmptyMonsterZone("player")),
            canSpecialSummon: () => !this.turnManager?.isSummonRestricted("player"),
            onReleaseHandCard: (card) => this.releaseHandCard(card),
            onReleaseFieldCard: (zone) => this.sendCardToGraveyard(
                "player",
                zone,
                zone.placedElement,
                zone.placedCard,
                { announce: false, reason: "tribute" }
            ),
            onRitualSummon: (card) => this.ritualSummonFromHand(card),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.monsterEffectManager = new MonsterEffectManager({
            field: this.field,
            targetManager: this.fieldTargetManager,
            getTurnNumber: () => this.turnNumber,
            isPlayerTurn: () => this.turnManager?.isPlayerTurn ?? true,
            getDeckCards: () => this.deck.cards,
            getPlayerGraveyardCards: () => this.graveyardManager?.cards || [],
            createCard: (cardData) => this.hand.createCard(cardData),
            onAddCardFromDeck: (cardData) => this.addCardFromDeck(cardData),
            onReturnGraveyardCardToHand: (card) => this.returnGraveyardCardToHand(card),
            onDestroyZone: (zone, options) => this.destroyZoneByEffect(zone, options),
            onBanishZone: (zone) => this.banishZoneByEffect(zone),
            onEquipMonster: (context) => this.equipMonsterToSacrifice(context),
            onSendEquipToGraveyard: (zone) => this.sendCardToGraveyard(
                zone.placedCard?.owner || "player",
                zone,
                zone.placedElement,
                zone.placedCard,
                { announce: false }
            ),
            onStateChange: () => this.turnManager?.updateStatus(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.cardEffectManager = new CardEffectManager({
            getDeckCount: () => this.deck.count,
            getHandCards: () => this.hand.cards,
            getAllMonsterZones: () => this.getAllMonsterZones(),
            getOpponentMonsterZones: () => this.getOpponentMonsterTargets(),
            getOpponentAttackMonsters: () => this.getOpponentAttackMonsters(),
            controlEffectManager: this.controlEffectManager,
            ritualSummonManager: this.ritualSummonManager,
            targetManager: this.fieldTargetManager,
            getSpellTrapTargets: (sourceCard) => this.getSpellTrapTargets(sourceCard),
            canActivateScapegoat: (card, context) => this.canActivateScapegoat(card, context),
            onCreateScapegoatTokens: () => this.createScapegoatTokens(),
            onRevealOpponentMonsters: () => this.revealOpponentMonsters(),
            onExpireSwords: (zone, card) => this.expireSwordsOfRevealingLight(zone, card),
            onDraw: () => this.drawOneCard({ announce: false }),
            onDiscard: (card) => {
                this.hand.removeCard(card);
                this.graveyardManager.add(card, { announce: false });
            },
            onDestroyZone: (zone) => this.destroyZoneByEffect(zone),
            onBanishZone: (zone) => this.banishZoneByEffect(zone),
            onDestroySpellTraps: (sourceCard) => this.destroyAllSpellTraps(sourceCard),
            onSetMonsterFaceDown: (zone) => this.setMonsterFaceDown(zone),
            onSimultaneousDamage: (amount) => this.battleManager.applySimultaneousDamage(amount),
            onStateChange: () => this.turnManager?.updateStatus(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.graveyardManager = new GraveyardManager({
            field: this.field,
            onBeforeOpen: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.opponentGraveyardManager = new GraveyardManager({
            field: this.field,
            ownerSelector: ".opponent-field",
            onBeforeOpen: () => this.deselect(),
            viewerOptions: {
                listButtonSelector: null,
                kicker: "OPPONENT CARD ARCHIVE",
                title: "OPPONENT GRAVEYARD",
                titleId: "opponent-graveyard-dialog-title",
                emptyMessage: "相手の墓地にカードはありません",
                variant: "opponent"
            },
            onCountsChanged: () => this.opponentTestManager?.updateButtonState()
        });
        this.opponentSpellManager = new OpponentSpellManager({
            field: this.field,
            hand: this.opponentHand,
            createCard: (cardData) => this.hand.createCard(cardData),
            onChainResponse: (context) => this.spellTrapManager?.requestChainResponse({
                eventTrigger: "opponent-spell-activation",
                message: `相手が魔法カード【${context.card.name}】を発動しました`,
                chainSource: context
            }),
            onDestroyZone: (zone) => this.destroyZoneByEffect(zone),
            onSendToGraveyard: (...args) => this.sendCardToGraveyard("opponent", ...args),
            onFieldChanged: () => this.updateCardCounts(),
            onStateChange: () => this.turnManager?.updateStatus(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.opponentTrapManager = new OpponentTrapManager({
            field: this.field,
            getTurnNumber: () => this.turnNumber,
            onDamage: (target, amount) => this.battleManager.applyDamage(target, amount),
            onDestroyZone: (zone) => this.destroyZoneByEffect(zone),
            onSendToGraveyard: (...args) => this.sendCardToGraveyard("opponent", ...args),
            onChainResponse: (context) => this.spellTrapManager?.requestChainResponse({
                eventTrigger: "opponent-trap-activation",
                message: `相手が罠カード【${context.card.name}】を発動しました`,
                chainSource: context
            }),
            onStateChange: () => this.turnManager?.updateStatus(),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.battleManager = new BattleManager({
            field: this.field,
            getTurnNumber: () => this.turnNumber,
            getCurrentPhase: () => this.currentPhase,
            onBeforeSelect: () => this.deselect(),
            onBeforeFinish: () => this.deselect(),
            onAnnounce: (message) => this.toast.show(message),
            onShowEffect: (card, element) => this.effectDetailPanel.show(card, element),
            onMonsterFlipped: (context) => this.monsterEffectManager.handleFlip(context),
            onAfterDamageCalculation: (context) => this.monsterEffectManager.handleAfterDamageCalculation(context),
            isBattleProtected: (controller) => controller === "opponent"
                && this.opponentTrapManager.isBattleProtected(),
            isSharingBattleDamage: (card) => this.monsterEffectManager.isSharingBattleDamage(card),
            canInflictPiercingDamage: (card) => this.monsterEffectManager.canInflictPiercingDamage(card),
            isAttackLocked: (controller) => controller === "opponent"
                && this.cardEffectManager.isOpponentAttackLocked(),
            onBeforeBattleDestroy: (target) => this.monsterEffectManager.replaceBattleDestruction(target),
            onAttackStarted: (card) => this.monsterEffectManager.handleAttackStarted(card),
            onMonsterDestroyedByBattle: (context) => this.monsterEffectManager.handleBattleDestruction(context),
            onPlayerAttackDeclared: (attacker) => this.opponentTrapManager.respondToPlayerAttack(attacker),
            onOpponentAttackDeclared: (attacker) => this.spellTrapManager?.requestAttackResponse(attacker),
            onSendToGraveyard: (...args) => this.handleBattleGraveyard(...args),
            onDuelFinished: (result) => this.duelRewardManager.grant(result)
        });
        this.turnManager = new TurnManager({
            canAdvance: () => !this.gameOver
                && !this.cardEffectManager.isResolving
                && !this.monsterEffectManager.isResolving
                && !this.opponentSpellManager.isResolving
                && !this.opponentTrapManager.isResolving
                && !this.spellTrapManager?.isResponsePending,
            onBeforeAdvance: () => this.deselect(),
            onDraw: (activePlayer) => this.drawTurnCard(activePlayer),
            onPhaseChange: (...args) => this.handlePhaseChange(...args),
            onAnnounce: (message) => this.toast.show(message)
        });
        this.monsterPositionManager = new MonsterPositionManager({
            turnManager: this.turnManager,
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            onBeforeSelect: () => this.deselect(),
            canActivateEffect: (card) => this.monsterEffectManager.canActivate(card),
            onActivateEffect: (target) => this.monsterEffectManager.activate(target),
            onFlipSummon: (context) => this.monsterEffectManager.handleFlip(context),
            onAnnounce: (message) => this.toast.show(message),
            onShowEffect: (card, element) => this.effectDetailPanel.show(card, element)
        });
        this.summonManager = new SummonManager({
            field: this.field,
            hand: this.hand,
            turnManager: this.turnManager,
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            getGraveyardCards: () => this.graveyardManager.cards,
            onBanishGraveyardCard: (card) => this.banishCardFromGraveyard(card),
            onAnnounce: (message) => this.toast.show(message),
            onDeselect: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onSendToGraveyard: (...args) => this.sendCardToGraveyard("player", ...args),
            onPlacedMonsterClick: (...args) => this.handlePlacedMonsterClick(...args),
            onMonsterSummoned: (context) => this.monsterEffectManager.handleSummon(context),
            onShowEffect: (card) => this.effectDetailPanel.show(card)
        });
        this.spellTrapManager = new SpellTrapManager({
            field: this.field,
            hand: this.hand,
            getTurnNumber: () => this.turnNumber,
            canPlayerAct: () => this.requirePlayerTurn("カードの発動"),
            requireMainPhase: (actionName) => this.requireMainPhase(actionName),
            canActivateEffect: (card, context) => this.cardEffectManager.canActivate(card, context),
            isEffectImplemented: (card) => this.cardEffectManager.hasEffect(card),
            onResolveEffect: (card, context) => this.cardEffectManager.resolve(card, context),
            onAnnounce: (message) => this.toast.show(message),
            onDeselect: () => this.deselect(),
            onCountsChanged: () => this.updateCardCounts(),
            onSendToGraveyard: (...args) => this.sendCardToGraveyard("player", ...args),
            onShowEffect: (card) => this.effectDetailPanel.show(card)
        });
        this.opponentTestManager = new OpponentTestManager({
            field: this.field,
            createCard: (cardData) => this.hand.createCard(cardData),
            onBeforePlace: () => this.deselect(),
            onAnnounce: (message) => this.toast.show(message),
            onMonsterClick: (...args) => this.handleOpponentMonsterClick(...args)
        });
        this.opponentAI = new OpponentAI({
            field: this.field,
            hand: this.opponentHand,
            turnManager: this.turnManager,
            createCard: (cardData) => this.hand.createCard(cardData),
            isAttackLocked: (controller) => controller === "opponent"
                && this.cardEffectManager.isOpponentAttackLocked(),
            onAnnounce: (message) => this.toast.show(message),
            onMonsterClick: (...args) => this.handleOpponentMonsterClick(...args),
            onMonsterSummoned: (context) => this.spellTrapManager.requestSummonResponse(context),
            onActivateSpell: () => this.opponentSpellManager.activateFirstAvailable(),
            onActionResolved: (context) => this.spellTrapManager.requestFastEffectResponse({
                eventTrigger: context.type,
                message: context.type === "set-spell-trap"
                    ? "相手が魔法・罠カードをセットしました"
                    : "相手がモンスターの表示形式を変更しました",
                actionContext: context
            }),
            onFieldChanged: () => {
                this.opponentTestManager.updateButtonState();
                this.updateCardCounts();
            },
            onSendToGraveyard: (...args) => this.sendCardToGraveyard("opponent", ...args),
            onBattle: (...args) => this.battleManager.executeOpponentAttack(...args)
        });
        // 盤面外クリックによる選択解除イベント
        this.initGlobalEvents();
        this.initDeckClickDraw();
        this.updateCardCounts();

        // 開始アナウンス
        this.initDecks();
    }

    /**
     * 自分・相手のJSONからデッキを読み込み、それぞれ初期手札5枚を生成する
     */
    async initDecks() {
        try {
            const [playerResponse, opponentResponse] = await Promise.all([
                fetch("cards.json", { cache: "no-store" }),
                fetch("opponent-deck.json", { cache: "no-store" })
            ]);
            if (!playerResponse.ok || !opponentResponse.ok) {
                throw new Error("デッキデータを取得できませんでした");
            }

            const [playerCardCatalog, opponentCards] = await Promise.all([
                playerResponse.json(),
                opponentResponse.json()
            ]);
            const playerCards = this.loadSavedPlayerDeck(playerCardCatalog);
            this.deck = new Deck(playerCards);
            this.opponentDeck = new Deck(opponentCards);
            this.opponentTestManager.setCardPool(opponentCards);
            this.hand.clear();
            this.opponentHand.clear();
            this.drawInitialHands();
            this.updateDeckCounts();
            this.updateCardCounts();
            this.toast.show("デュエル開始！ TURN 1・MAIN 1");
        } catch (error) {
            console.error("デッキの読み込みに失敗しました:", error);
            this.toast.show("デッキの読み込みに失敗しました");
        }
    }

    /**
     * ===== デッキ編集画面との連携部分 =====
     * 保存済みの40枚が正しければカードIDからデッキを復元し、未完成なら初期デッキを使う。
     */
    loadSavedPlayerDeck(cardCatalog) {
        try {
            const savedIds = JSON.parse(localStorage.getItem("duelPlayerDeck") || "null");
            if (!Array.isArray(savedIds) || savedIds.length !== 40) return cardCatalog;

            const cardsById = new Map(cardCatalog.map(card => [card.id, card]));
            const copyCounts = new Map();
            const hasInvalidCard = savedIds.some(id => {
                copyCounts.set(id, (copyCounts.get(id) || 0) + 1);
                return !cardsById.has(id) || copyCounts.get(id) > 3;
            });
            if (hasInvalidCard) return cardCatalog;

            // 同名カードを複数入れた時も、各カードを独立したデータとして扱う。
            return savedIds.map(id => ({ ...cardsById.get(id) }));
        } catch {
            return cardCatalog;
        }
    }

    /**
     * 初期手札として5枚ドローする
     */
    drawInitialHands() {
        for (let i = 0; i < 5; i++) {
            this.hand.addCardFromData(this.deck.draw(), (card) => this.handleCardClick(card));
            this.opponentHand.addCard(this.opponentDeck.draw());
        }
    }

    drawTurnCard(activePlayer) {
        return activePlayer === "player"
            ? this.drawOneCard({ announce: false })
            : this.drawOpponentCard();
    }

    drawOpponentCard() {
        const drawnCard = this.opponentDeck.draw();
        if (!drawnCard) {
            this.battleManager.finishByDeckOut("opponent");
            return null;
        }

        this.opponentHand.addCard(drawnCard);
        this.updateDeckCounts();
        return drawnCard;
    }

    async handlePhaseChange(activePlayer, phase) {
        this.controlEffectManager.handlePhaseChange(activePlayer, phase);
        await this.monsterEffectManager.handlePhaseChange(activePlayer, phase);
        await this.cardEffectManager.handlePhaseChange(activePlayer, phase);
        if (activePlayer === "opponent") {
            await this.spellTrapManager.requestFastEffectResponse({
                eventTrigger: "phase-start",
                message: `相手の${phase}フェイズ開始時です`,
                phase
            });
        }
        return this.opponentAI?.handlePhaseChange(activePlayer, phase);
    }

    /**
     * 自分のデッキをクリックした時のドロー処理を登録する
     */
    initDeckClickDraw() {
        const playerDeck = document.getElementById("player-deck");
        if (!playerDeck) return;

        playerDeck.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!this.requirePlayerTurn("デッキの操作")) return;
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
            this.battleManager.finishByDeckOut("player");
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
        const playerCount = document.querySelector("#player-deck .deck-count");
        const opponentCount = document.querySelector("#opponent-deck .deck-count");
        if (playerCount) playerCount.textContent = this.deck.count;
        if (opponentCount) opponentCount.textContent = this.opponentDeck.count;
    }

    handlePlacedMonsterClick(zone, card, placedElement, onPositionChange) {
        if (this.summonManager.pendingTributeSummon) {
            this.summonManager.handleTributeSelection(zone);
            return;
        }

        if (!this.requirePlayerTurn("モンスターの操作")) return;

        if (this.currentPhase === "BATTLE") {
            this.battleManager.showCommands(zone, card, placedElement, onPositionChange);
            return;
        }

        this.monsterPositionManager.show(zone, card, placedElement, onPositionChange);
    }

    handleOpponentMonsterClick(zone, card, placedElement) {
        if (this.fieldTargetManager.handleZoneClick(zone)) return;
        if (this.battleManager.selectAttackTarget(zone, card, placedElement)) return;
        if (placedElement.classList.contains("face-down")) {
            this.toast.show("裏側表示カードの情報は確認できません");
            return;
        }

        this.effectDetailPanel.show(card, placedElement);
    }

    handleBattleGraveyard(controller, zone, placedElement, card) {
        return this.sendCardToGraveyard(controller, zone, placedElement, card, {
            announce: false,
            reason: "destroy"
        });
    }

    async sendCardToGraveyard(controller, zone, placedElement, card, options = {}) {
        this.cardEffectManager.handleCardLeavesField(card);
        await this.controlEffectManager.handleCardLeavesField(card, {
            reason: options.reason || "send"
        });
        await this.monsterEffectManager.handleCardLeavesField(card, {
            reason: options.reason || "send"
        });
        await this.opponentSpellManager.handleCardLeavesField(card, {
            reason: options.reason || "send"
        });
        if (card.isToken) {
            zone.clearPlacedCard(placedElement);
            this.updateCardCounts();
            this.opponentTestManager?.updateButtonState();
            return;
        }
        const owner = card.owner || controller;
        const manager = owner === "opponent"
            ? this.opponentGraveyardManager
            : this.graveyardManager;
        manager.send(zone, placedElement, card, options);
        this.updateCardCounts();
        await this.monsterEffectManager.handleCardSentToGraveyard(card);
    }

    addCardFromDeck(cardData) {
        const removedCard = this.deck.remove(cardData);
        if (!removedCard) return false;

        this.hand.addCardFromData(removedCard, card => this.handleCardClick(card));
        this.updateDeckCounts();
        this.updateCardCounts();
        return true;
    }

    returnGraveyardCardToHand(card) {
        if (!this.graveyardManager.remove(card)) return false;

        card.controller = "player";
        card.isDefenseMode = false;
        card.atk = card.originalAtk;
        card.def = card.originalDef;
        card.isEquipCard = false;
        card.equippedTo = null;
        this.hand.addCard(card, returnedCard => this.handleCardClick(returnedCard));
        this.updateCardCounts();
        return true;
    }

    sendEquipToGraveyard(zone) {
        const card = zone?.placedCard;
        if (!card) return Promise.resolve(false);
        return this.sendCardToGraveyard("player", zone, zone.placedElement, card, { announce: false });
    }

    getEmptyMonsterZone(controller) {
        const ownerSelector = controller === "opponent" ? ".opponent-field" : ".you-field";
        return this.field.zones.find(zone =>
            zone.element.closest(ownerSelector)
            && zone.element.classList.contains("zone-monster")
            && !zone.isOccupied
        ) || null;
    }

    getEmptyPlayerMainMonsterZones() {
        return this.field.zones.filter(zone =>
            zone.element.closest(".you-field")
            && zone.element.classList.contains("zone-monster")
            && !zone.isOccupied
        );
    }

    canActivateScapegoat(card, context = {}) {
        const isSetThisTurn = card?.placedTurn === this.turnNumber
            && this.field.zones.some(zone => zone.placedCard === card);
        if (isSetThisTurn) {
            if (!context.silent) this.toast.show("速攻魔法はセットしたターンには発動できません");
            return false;
        }
        if (this.turnManager.hasSummonedThisTurn("player")) {
            if (!context.silent) this.toast.show("このターンすでに召喚・反転召喚・特殊召喚を行っているため、【スケープ・ゴート】は発動できません");
            return false;
        }
        if (this.getEmptyPlayerMainMonsterZones().length < 4) {
            if (!context.silent) this.toast.show("【スケープ・ゴート】の発動には空きモンスターゾーンが4か所必要です");
            return false;
        }
        return true;
    }

    createScapegoatTokens() {
        this.turnManager.restrictSummons("player");
        const zones = this.getEmptyPlayerMainMonsterZones();
        if (zones.length < 4) return [];

        const tokenData = {
            id: "TOKEN-SHEEP",
            name: "羊トークン",
            cardType: "monster",
            frame: "normal",
            attribute: "EARTH",
            race: "獣族",
            level: 1,
            atk: 0,
            def: 0,
            subTypes: ["トークン"],
            isToken: true,
            cannotBeTributedForAdvanceSummon: true,
            description: "「スケープ・ゴート」の効果で特殊召喚されたトークン。アドバンス召喚のためにはリリースできない。"
        };

        const tokens = zones.slice(0, 4).map(zone => {
            const card = this.hand.createCard(tokenData);
            card.owner = "player";
            card.controller = "player";
            card.placedTurn = this.turnNumber;
            const placedElement = zone.placeCard(card, positionText => {
                this.toast.show(`【${card.name}】${positionText}に変更！`);
            }, {
                onMonsterClick: (placedZone, placedCard, element, onPositionChange) => {
                    this.handlePlacedMonsterClick(placedZone, placedCard, element, onPositionChange);
                }
            });
            card.setBattlePosition(placedElement, true);
            placedElement.classList.add("sheep-token");
            placedElement.title = "羊トークン（表側守備表示）";
            return { zone, card, placedElement };
        });
        this.updateCardCounts();
        this.opponentTestManager?.updateButtonState();
        return tokens;
    }

    async revealOpponentMonsters() {
        const targets = this.getOpponentMonsterTargets()
            .filter(zone => zone.placedElement?.classList.contains("face-down"));

        targets.forEach(zone => {
            const { placedCard: card, placedElement } = zone;
            placedElement.classList.remove("face-down");
            placedElement.innerHTML = card.faceHtml;
            placedElement.title = `${card.name}（表側守備表示）`;
        });
        this.updateCardCounts();

        for (const zone of targets) {
            if (zone.placedCard && zone.placedElement) {
                await this.monsterEffectManager.handleFlip({
                    card: zone.placedCard,
                    zone,
                    placedElement: zone.placedElement,
                    reason: "card-effect"
                });
            }
        }
        return targets.length;
    }

    async expireSwordsOfRevealingLight(zone, card) {
        if (zone?.placedCard !== card) return false;
        await this.sendCardToGraveyard("player", zone, zone.placedElement, card, {
            announce: false,
            reason: "expiration"
        });
        return true;
    }

    getOpponentMonsterTargets({ faceUpOnly = false } = {}) {
        return this.field.zones.filter(zone => {
            const card = zone.placedCard;
            const isOpponentCard = card?.controller === "opponent"
                || Boolean(zone.element.closest(".opponent-field"));
            if (!card?.isMonster || card.isEquipCard || !isOpponentCard) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            return !faceUpOnly || !zone.placedElement?.classList.contains("face-down");
        });
    }

    equipMonsterToSacrifice({ sourceCard, targetZone }) {
        const targetCard = targetZone?.placedCard;
        const targetElement = targetZone?.placedElement;
        const destinationZone = this.monsterEffectManager.getEmptySpellTrapZone(sourceCard.controller);
        if (!targetCard?.isMonster || !targetElement || !destinationZone) return null;

        targetZone.clearPlacedCard(targetElement);
        targetCard.controller = sourceCard.controller;
        targetCard.isEquipCard = true;
        targetCard.equippedTo = sourceCard;
        const placedElement = destinationZone.placeCard(targetCard);
        placedElement.classList.add("equipped-monster-card");
        placedElement.title = `【${sourceCard.name}】に装備中: ${targetCard.name}`;
        this.updateCardCounts();
        this.opponentTestManager?.updateButtonState();
        return { zone: destinationZone, placedElement, card: targetCard };
    }

    getPlayerMonsterZones() {
        return this.field.zones.filter(zone => {
            if (!zone.placedCard?.isMonster || zone.placedCard.isEquipCard) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            const isPlayerZone = Boolean(zone.element.closest(".you-field"));
            const isPlayerEMZ = zone.element.classList.contains("zone-emz")
                && zone.placedCard.controller !== "opponent";
            return isPlayerZone || isPlayerEMZ;
        });
    }

    moveMonsterToController(sourceZone, controller) {
        const card = sourceZone?.placedCard;
        const sourceElement = sourceZone?.placedElement;
        const destinationZone = this.getEmptyMonsterZone(controller);
        if (!card?.isMonster || !sourceElement || !destinationZone) return null;

        const wasFaceDown = sourceElement.classList.contains("face-down");
        const wasDefenseMode = card.isDefenseMode;
        sourceZone.clearPlacedCard(sourceElement);
        card.controller = controller;

        const onMonsterClick = controller === "opponent"
            ? (zone, placedCard, element) => this.handleOpponentMonsterClick(zone, placedCard, element)
            : (zone, placedCard, element, onPositionChange) => {
                this.handlePlacedMonsterClick(zone, placedCard, element, onPositionChange);
            };
        const placedElement = destinationZone.placeCard(card, positionText => {
            this.toast.show(`【${card.name}】${positionText}に変更！`);
        }, {
            faceDown: wasFaceDown,
            onMonsterClick
        });

        if (!wasFaceDown && wasDefenseMode) placedElement.classList.add("defense-mode");
        if (controller === "opponent") {
            placedElement.classList.add("opponent-monster");
            placedElement.title = wasFaceDown
                ? "裏側守備表示モンスター"
                : `${card.name}（${wasDefenseMode ? "表側守備表示" : "表側攻撃表示"}）`;
        }

        this.updateCardCounts();
        this.opponentTestManager?.updateButtonState();
        return { zone: destinationZone, placedElement, card };
    }

    swapMonsterControl(playerZone, opponentZone) {
        const playerCard = playerZone?.placedCard;
        const opponentCard = opponentZone?.placedCard;
        const playerElement = playerZone?.placedElement;
        const opponentElement = opponentZone?.placedElement;
        if (!playerCard?.isMonster || !opponentCard?.isMonster || !playerElement || !opponentElement) {
            return null;
        }

        const playerState = {
            faceDown: playerElement.classList.contains("face-down"),
            defense: playerCard.isDefenseMode
        };
        const opponentState = {
            faceDown: opponentElement.classList.contains("face-down"),
            defense: opponentCard.isDefenseMode
        };

        playerZone.clearPlacedCard(playerElement);
        opponentZone.clearPlacedCard(opponentElement);
        playerCard.controller = "opponent";
        opponentCard.controller = "player";

        const newPlayerElement = playerZone.placeCard(opponentCard, positionText => {
            this.toast.show(`【${opponentCard.name}】${positionText}に変更！`);
        }, {
            faceDown: opponentState.faceDown,
            onMonsterClick: (zone, card, element, onPositionChange) => {
                this.handlePlacedMonsterClick(zone, card, element, onPositionChange);
            }
        });
        newPlayerElement.classList.remove("opponent-monster");
        if (!opponentState.faceDown && opponentState.defense) {
            newPlayerElement.classList.add("defense-mode");
        }
        newPlayerElement.title = opponentState.faceDown
            ? `${opponentCard.name}（裏側守備表示）`
            : `${opponentCard.name}（${opponentState.defense ? "表側守備表示" : "表側攻撃表示"}）`;

        const newOpponentElement = opponentZone.placeCard(playerCard, null, {
            faceDown: playerState.faceDown,
            onMonsterClick: (zone, card, element) => {
                this.handleOpponentMonsterClick(zone, card, element);
            }
        });
        newOpponentElement.classList.add("opponent-monster");
        if (!playerState.faceDown && playerState.defense) {
            newOpponentElement.classList.add("defense-mode");
        }
        newOpponentElement.title = playerState.faceDown
            ? "相手のセットモンスター"
            : `${playerCard.name}（${playerState.defense ? "表側守備表示" : "表側攻撃表示"}）`;

        this.updateCardCounts();
        this.opponentTestManager?.updateButtonState();
        return {
            player: { zone: playerZone, card: opponentCard, placedElement: newPlayerElement },
            opponent: { zone: opponentZone, card: playerCard, placedElement: newOpponentElement }
        };
    }

    specialSummonFromGraveyard(card) {
        if (this.turnManager.isSummonRestricted("player")) {
            this.toast.show("【スケープ・ゴート】を発動したターンは特殊召喚できません");
            return null;
        }
        const destinationZone = this.getEmptyMonsterZone("player");
        const sourceGraveyard = [this.graveyardManager, this.opponentGraveyardManager]
            .find(manager => manager.cards.includes(card));
        if (!destinationZone || !sourceGraveyard?.remove(card)) return null;

        card.controller = "player";
        card.isDefenseMode = false;
        card.atk = card.originalAtk;
        card.def = card.originalDef;
        card.spellCounters = 0;
        card.isEquipCard = false;
        card.equippedTo = null;
        card.placedTurn = this.turnNumber;
        const placedElement = destinationZone.placeCard(card, positionText => {
            this.toast.show(`【${card.name}】${positionText}に変更！`);
        }, {
            onMonsterClick: (zone, placedCard, element, onPositionChange) => {
                this.handlePlacedMonsterClick(zone, placedCard, element, onPositionChange);
            }
        });
        placedElement.title = `${card.name}（表側攻撃表示）`;
        this.turnManager.markSummonPerformed("player");
        this.updateCardCounts();
        return { zone: destinationZone, placedElement, card };
    }

    releaseHandCard(card) {
        if (!this.hand.cards.includes(card)) return false;
        this.hand.removeCard(card);
        const manager = card.owner === "opponent"
            ? this.opponentGraveyardManager
            : this.graveyardManager;
        manager.add(card, { announce: false });
        return true;
    }

    banishCardFromGraveyard(card) {
        const sourceGraveyard = [this.graveyardManager, this.opponentGraveyardManager]
            .find(manager => manager.cards.includes(card));
        if (!sourceGraveyard?.remove(card)) return false;

        const owner = card.owner === "opponent" ? "opponent" : "player";
        this.banishedCards[owner].push(card);
        this.updateCardCounts();
        return true;
    }

    ritualSummonFromHand(card) {
        if (this.turnManager.isSummonRestricted("player")) return null;
        const destinationZone = this.getEmptyMonsterZone("player");
        if (!destinationZone || !this.hand.cards.includes(card)) return null;

        card.controller = "player";
        card.isDefenseMode = false;
        card.wasProperlySummoned = true;
        card.placedTurn = this.turnNumber;
        const placedElement = destinationZone.placeCard(card, positionText => {
            this.toast.show(`【${card.name}】${positionText}に変更！`);
        }, {
            onMonsterClick: (zone, placedCard, element, onPositionChange) => {
                this.handlePlacedMonsterClick(zone, placedCard, element, onPositionChange);
            }
        });
        placedElement.title = `${card.name}（儀式召喚・表側攻撃表示）`;
        this.hand.removeCard(card);
        this.turnManager.markSummonPerformed("player");
        this.updateCardCounts();
        return { zone: destinationZone, placedElement, card };
    }

    getSpellTrapTargets(excludedCard = null) {
        return this.field.zones.filter(zone => {
            const isSpellTrapZone = zone.element.classList.contains("zone-spell")
                || zone.element.classList.contains("zone-field");
            const card = zone.placedCard;
            return isSpellTrapZone
                && (card?.isSpell || card?.isTrap || card?.isEquipCard)
                && card !== excludedCard;
        });
    }

    getAllMonsterZones() {
        return this.field.zones.filter(zone =>
            zone.placedCard?.isMonster
            && !zone.placedCard.isEquipCard
            && zone.element.matches(".zone-monster, .zone-emz")
        );
    }

    setMonsterFaceDown(zone) {
        const card = zone?.placedCard;
        const element = zone?.placedElement;
        if (!card?.isMonster || card.isToken || !element || element.classList.contains("face-down")) return false;

        card.isDefenseMode = true;
        card.spellCounters = 0;
        card.atk = card.originalAtk;
        card.def = card.originalDef;
        element.classList.add("face-down", "defense-mode");
        element.innerHTML = "";
        element.title = card.controller === "opponent"
            ? "相手のセットモンスター"
            : `${card.name}（裏側守備表示）`;
        this.opponentSpellManager?.updateContinuousEffects();
        this.updateCardCounts();
        return true;
    }

    getOpponentAttackMonsters() {
        return this.field.zones.filter(zone => {
            const card = zone.placedCard;
            if (!card?.isMonster || card.isEquipCard || card.isDefenseMode) return false;
            if (!zone.element.matches(".zone-monster, .zone-emz")) return false;
            const isOpponentCard = card.controller === "opponent"
                || Boolean(zone.element.closest(".opponent-field"));
            return isOpponentCard && !zone.placedElement?.classList.contains("face-down");
        });
    }

    destroyZoneByEffect(zone, options = {}) {
        const card = zone?.placedCard;
        const element = zone?.placedElement;
        if (!card || !element) return Promise.resolve(false);

        element.classList.add("effect-destroyed");
        return new Promise(resolve => {
            window.setTimeout(async () => {
                if (zone.placedCard !== card) {
                    resolve(false);
                    return;
                }
                const controller = card.owner || (card.controller === "opponent" ? "opponent" : "player");
                await this.sendCardToGraveyard(controller, zone, element, card, {
                    announce: false,
                    reason: options.reason || "destroy"
                });
                resolve(true);
            }, 360);
        });
    }

    banishZoneByEffect(zone) {
        const card = zone?.placedCard;
        const element = zone?.placedElement;
        if (!card || !element) return Promise.resolve(false);

        element.classList.add("effect-destroyed");
        return new Promise(resolve => {
            window.setTimeout(async () => {
                if (zone.placedCard !== card) {
                    resolve(false);
                    return;
                }

                const owner = card.owner || (card.controller === "opponent" ? "opponent" : "player");
                await this.controlEffectManager.handleCardLeavesField(card, { reason: "banish" });
                this.cardEffectManager.handleCardLeavesField(card);
                await this.monsterEffectManager.handleCardLeavesField(card, { reason: "banish" });
                await this.opponentSpellManager.handleCardLeavesField(card, { reason: "banish" });
                zone.clearPlacedCard(element);
                if (!card.isToken) this.banishedCards[owner].push(card);
                this.updateCardCounts();
                this.opponentTestManager?.updateButtonState();
                resolve(true);
            }, 360);
        });
    }

    destroyAllSpellTraps(sourceCard) {
        const targets = this.field.zones
            .filter(zone => {
                const isSpellTrapZone = zone.element.classList.contains("zone-spell")
                    || zone.element.classList.contains("zone-field");
                const card = zone.placedCard;
                return isSpellTrapZone
                    && (card?.isSpell || card?.isTrap || card?.isEquipCard)
                    && card !== sourceCard;
            })
            .map(zone => ({ zone, card: zone.placedCard, element: zone.placedElement }));

        targets.forEach(target => target.element?.classList.add("effect-destroyed"));
        return new Promise(resolve => {
            window.setTimeout(async () => {
                let destroyedCount = 0;
                for (const target of targets) {
                    if (target.zone.placedCard !== target.card) continue;
                    const controller = target.card.owner
                        || (target.card.controller === "opponent" ? "opponent" : "player");
                    await this.sendCardToGraveyard(controller, target.zone, target.element, target.card, {
                        announce: false,
                        reason: "destroy"
                    });
                    destroyedCount += 1;
                }
                resolve(destroyedCount);
            }, 360);
        });
    }

    get currentPhase() {
        return this.turnManager.currentPhase;
    }

    get activePlayer() {
        return this.turnManager.activePlayer;
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

    requirePlayerTurn(actionName) {
        if (this.cardEffectManager?.isResolving
            || this.monsterEffectManager?.isResolving
            || this.opponentSpellManager?.isResolving
            || this.opponentTrapManager?.isResolving
            || this.spellTrapManager?.isResponsePending) {
            this.toast.show("発動中のカード効果を完了してください");
            return false;
        }

        if (this.turnManager.isPlayerTurn) return true;

        this.toast.show(`${actionName}は自分のターンに行えます`);
        return false;
    }

    requireMainPhase(actionName) {
        if (!this.requirePlayerTurn(actionName)) return false;
        if (this.isMainPhase()) return true;

        this.toast.show(`${actionName}はメインフェイズに行えます`);
        return false;
    }

    /**
     * 手札カードがクリックされたときのハンドラー
     * @param {Card} card - クリックされたカード
     */
    handleCardClick(card) {
        if (!this.requirePlayerTurn("手札の操作")) return;

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
        if (this.fieldTargetManager.handleZoneClick(zone)) return;
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
        this.opponentSpellManager?.updateContinuousEffects();
        this.opponentRevealManager?.refreshFieldCards();
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
