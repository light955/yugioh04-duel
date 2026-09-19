import { CardActionPanel } from "./CardActionPanel.js?v=1";
import { TrapActivationDialog } from "./TrapActivationDialog.js?v=4";

export class SpellTrapManager {
    constructor({ field, hand, getTurnNumber, canPlayerAct, requireMainPhase, canActivateEffect, isEffectImplemented, onResolveEffect, onAnnounce, onDeselect, onCountsChanged, onSendToGraveyard, onShowEffect }) {
        this.field = field;
        this.hand = hand;
        this.getTurnNumber = getTurnNumber;
        this.canPlayerAct = canPlayerAct;
        this.requireMainPhase = requireMainPhase;
        this.canActivateEffect = canActivateEffect;
        this.isEffectImplemented = isEffectImplemented || (() => false);
        this.onResolveEffect = onResolveEffect;
        this.onAnnounce = onAnnounce;
        this.onDeselect = onDeselect;
        this.onCountsChanged = onCountsChanged;
        this.onSendToGraveyard = onSendToGraveyard;
        this.onShowEffect = onShowEffect;
        this.selectedCard = null;
        this.selectedAction = null;
        this.isResponsePending = false;
        this.fastEffectCardIds = new Set(["04-020", "04-023", "04-036", "04-037"]);
        this.trapActivationDialog = new TrapActivationDialog();

        this.spellActionPanel = CardActionPanel.createSpell({
            onAction: (action) => this.chooseSpellAction(action),
            onEffect: () => this.onShowEffect?.(this.selectedCard)
        });
        this.trapActionPanel = CardActionPanel.createTrap({
            onAction: (action) => this.chooseTrapAction(action),
            onEffect: () => this.onShowEffect?.(this.selectedCard)
        });
    }

    selectCard(card) {
        this.selectedCard = card;
        this.selectedAction = null;

        if (card.isSpell) {
            this.spellActionPanel.show(card.element);
            this.onAnnounce?.(`【${card.name}】発動するかセットするか選んでください`);
            return;
        }

        if (card.isTrap) {
            this.trapActionPanel.show(card.element);
            this.onAnnounce?.(`【${card.name}】セットまたは効果確認を選んでください`);
        }
    }

    chooseSpellAction(action) {
        const card = this.selectedCard;
        if (!card?.isSpell) return;
        if (!this.requireMainPhase("手札からの魔法カードの発動・セット")) return;
        if (action === "activate" && this.canActivateEffect && !this.canActivateEffect(card)) return;

        this.selectedAction = action;
        this.spellActionPanel.hide();
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);

        const actionText = action === "activate" ? "発動" : "セット";
        this.onAnnounce?.(`【${card.name}】${actionText}する魔法・罠ゾーンを選んでください`);
    }

    chooseTrapAction(action) {
        const card = this.selectedCard;
        if (!card?.isTrap || action !== "set") return;
        if (!this.requireMainPhase("罠カードのセット")) return;

        this.selectedAction = action;
        this.trapActionPanel.hide();
        this.field.clearAllHighlights();
        this.field.highlightValidZones(card);
        this.onAnnounce?.(`【${card.name}】セットする魔法・罠ゾーンを選んでください`);
    }

    handleZoneClick(zone) {
        const card = this.selectedCard;
        if (!card) return false;
        if (!this.requireMainPhase("手札のカードをフィールドに出す操作")) return true;

        if (!this.selectedAction) {
            this.selectCard(card);
            return true;
        }

        if (zone.canAccept(card)) this.placeCard(zone);
        return true;
    }

    placeCard(zone) {
        const card = this.selectedCard;
        if (!card) return;

        const isActivatingSpell = card.isSpell && this.selectedAction === "activate";
        const isSetting = (card.isSpell && this.selectedAction === "set") || card.isTrap;
        if (isSetting) card.placedTurn = this.getTurnNumber?.() ?? null;

        const placedElement = zone.placeCard(card, null, {
            faceDown: isSetting,
            onSetCardClick: (placedZone, placedCard, element) => {
                this.activateSetCard(placedZone, placedCard, element);
            }
        });

        this.hand.removeCard(card);
        this.onCountsChanged?.();
        this.onDeselect?.();

        if (isActivatingSpell) {
            this.onAnnounce?.(`【${card.name}】を発動！`);
            this.resolveActivatedCard(zone, placedElement, card);
        } else {
            this.onAnnounce?.(`【${card.name}】をフィールドにセット！`);
        }
    }

    async activateSetCard(zone, card, placedElement, effectContext = {}) {
        if (!placedElement.classList.contains("face-down") || zone.placedCard !== card) return;
        const isOpponentResponse = effectContext.trigger?.startsWith("opponent-");
        if (!isOpponentResponse && this.canPlayerAct && !this.canPlayerAct()) return;
        if (this.canActivateEffect && !this.canActivateEffect(card, effectContext)) return;

        this.onDeselect?.();
        placedElement.classList.remove("face-down");
        placedElement.classList.add("activating-card");
        placedElement.innerHTML = card.faceHtml;
        placedElement.title = `${card.name}（発動中）`;

        const cardType = card.isTrap ? "罠カード" : "魔法カード";
        this.onAnnounce?.(`セットされていた${cardType}【${card.name}】を発動！`);

        return this.resolveActivatedCard(zone, placedElement, card, effectContext);
    }

    async resolveActivatedCard(zone, placedElement, card, effectContext = {}) {
        const displayPromise = new Promise(resolve => window.setTimeout(resolve, 900));
        const context = {
            ...effectContext,
            sourceZone: zone,
            sourceElement: placedElement
        };
        let effectResult = false;

        try {
            [effectResult] = await Promise.all([this.onResolveEffect?.(card, context), displayPromise]);
        } catch (error) {
            console.error("カード効果の処理に失敗しました:", error);
            this.onAnnounce?.(`【${card.name}】の効果処理に失敗しました`);
            await displayPromise;
        }

        if (zone.placedCard !== card) return effectResult;

        if (effectResult?.keepOnField) {
            placedElement.classList.remove("activating-card");
            placedElement.title = `${card.name}（${effectResult.statusText || "装備中"}）`;
        } else {
            await this.onSendToGraveyard?.(zone, placedElement, card, { announce: false });
        }
        return effectResult;
    }

    async requestAttackResponse(attacker) {
        const effectContext = {
            trigger: "opponent-attack",
            attackerZone: attacker.zone,
            attackerCard: attacker.card
        };
        const activated = await this.requestTrapResponse({
            trapZones: this.getAttackResponseTraps(),
            effectContext,
            message: `相手の【${attacker.card.name}】が攻撃を宣言しました`,
            kicker: "ATTACK RESPONSE"
        });
        if (!activated && attacker.zone.placedCard === attacker.card) {
            await this.requestFastEffectResponse({
                eventTrigger: "attack-declaration",
                message: `相手の【${attacker.card.name}】が攻撃を宣言しました`,
                attackerZone: attacker.zone,
                attackerCard: attacker.card
            });
        }
        return attacker.zone.placedCard !== attacker.card;
    }

    getAttackResponseTraps() {
        return this.getReadyTrapZones(["04-021", "04-040"]);
    }

    async requestSummonResponse({ card, zone, placedElement, isSet = false }) {
        if (isSet || !card || zone.placedCard !== card) return false;

        const effectContext = {
            trigger: "opponent-summon",
            summonedZone: zone,
            summonedCard: card,
            summonedElement: placedElement
        };
        const activated = await this.requestTrapResponse({
            trapZones: this.getSummonResponseTraps(card),
            effectContext,
            message: `相手が【${card.name}】を召喚しました`,
            kicker: "SUMMON RESPONSE"
        });
        if (!activated && zone.placedCard === card) {
            await this.requestFastEffectResponse({
                eventTrigger: "summon-resolved",
                message: `相手が【${card.name}】を召喚しました`,
                summonedZone: zone,
                summonedCard: card,
                summonedElement: placedElement
            });
        }
        return zone.placedCard !== card;
    }

    getSummonResponseTraps(summonedCard) {
        const ids = ["04-022"];
        if (Number(summonedCard?.atk) >= 1500) ids.unshift("04-024");
        return this.getReadyTrapZones(ids);
    }

    getReadyTrapZones(cardIds) {
        const turnNumber = this.getTurnNumber?.();
        return this.field.zones.filter(zone =>
            zone.element.closest(".you-field")
            && zone.element.classList.contains("zone-spell")
            && cardIds.includes(zone.placedCard?.id)
            && zone.placedElement?.classList.contains("face-down")
            && zone.placedCard.placedTurn !== turnNumber
        );
    }

    requestFastEffectResponse({ eventTrigger = "open-state", message = "相手の行動後です", ...eventContext } = {}) {
        return this.requestQuickEffectResponse({
            trigger: "opponent-fast-effect-window",
            eventTrigger,
            message,
            kicker: "FAST EFFECT",
            eventContext
        });
    }

    requestChainResponse({ eventTrigger = "effect-activation", message = "相手が効果を発動しました", ...eventContext } = {}) {
        return this.requestQuickEffectResponse({
            trigger: "opponent-chain-response",
            eventTrigger,
            message,
            kicker: "CHAIN RESPONSE",
            eventContext
        });
    }

    async requestQuickEffectResponse({ trigger, eventTrigger, message, kicker, eventContext }) {
        const effectContext = {
            ...eventContext,
            trigger,
            eventTrigger,
            silent: true
        };
        const trapZones = this.getReadyTrapZones([...this.fastEffectCardIds])
            .filter(zone => this.isEffectImplemented(zone.placedCard))
            .filter(zone => !this.canActivateEffect || this.canActivateEffect(zone.placedCard, effectContext));

        return this.requestTrapResponse({
            trapZones,
            effectContext,
            message,
            kicker
        });
    }

    async requestTrapResponse({ trapZones, effectContext, message, kicker }) {
        if (this.isResponsePending || trapZones.length === 0) return false;
        this.isResponsePending = true;

        try {
            for (const trapZone of trapZones) {
                const card = trapZone.placedCard;
                if (!card || !trapZone.placedElement?.classList.contains("face-down")) continue;

                const shouldActivate = await this.trapActivationDialog.open({
                    card,
                    message,
                    kicker,
                    title: card.isTrap
                        ? "罠カードを発動しますか？"
                        : "速攻魔法を発動しますか？"
                });
                await new Promise(resolve => window.setTimeout(resolve, 200));
                if (!shouldActivate) {
                    this.onAnnounce?.(`【${card.name}】の発動を見送りました`);
                    continue;
                }

                await this.activateSetCard(trapZone, card, trapZone.placedElement, effectContext);
                return true;
            }
            return false;
        } finally {
            this.isResponsePending = false;
        }
    }

    reset() {
        this.selectedCard = null;
        this.selectedAction = null;
        this.spellActionPanel.hide();
        this.trapActionPanel.hide();
    }
}
