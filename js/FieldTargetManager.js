export class FieldTargetManager {
    constructor({ field, onAnnounce } = {}) {
        this.field = field;
        this.onAnnounce = onAnnounce;
        this.targets = [];
        this.onSelect = null;
        this.bindCapture();
    }

    bindCapture() {
        document.addEventListener("click", event => {
            if (!this.isActive) return;
            const zoneElement = event.target.closest(".zone-slot");
            if (!zoneElement) return;

            const zone = this.field.zones.find(item => item.element === zoneElement);
            if (!zone) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.handleZoneClick(zone);
        }, true);
    }

    get isActive() {
        return this.targets.length > 0;
    }

    start({ targets, prompt, onSelect }) {
        this.clear();
        if (!targets?.length) return false;

        this.targets = [...targets];
        this.onSelect = onSelect;
        this.targets.forEach(zone => zone.element.classList.add("effect-target"));
        this.onAnnounce?.(prompt);
        return true;
    }

    handleZoneClick(zone) {
        if (!this.isActive) return false;
        if (!this.targets.includes(zone)) {
            this.onAnnounce?.("光っているカードから対象を選んでください");
            return true;
        }

        const onSelect = this.onSelect;
        this.clear();
        onSelect?.(zone);
        return true;
    }

    clear() {
        this.targets.forEach(zone => zone.element.classList.remove("effect-target"));
        this.targets = [];
        this.onSelect = null;
    }
}
