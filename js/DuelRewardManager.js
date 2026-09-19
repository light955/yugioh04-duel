const DEFAULT_DUEL_POINTS = 2000;
const DUEL_POINTS_STORAGE_KEY = "duelMetaverseDp";

const REWARD_BY_RESULT = {
    VICTORY: 500,
    DRAW: 250,
    DEFEAT: 150
};

export class DuelRewardManager {
    constructor() {
        this.rewardGranted = false;
    }

    /**
     * ===== デュエル報酬の追加部分 =====
     * 勝敗に応じたDPを一度だけ付与し、メタバースと共通の保存先へ記録する。
     */
    grant(result) {
        const currentPoints = this.getCurrentPoints();
        if (this.rewardGranted) {
            return { amount: 0, total: currentPoints, alreadyGranted: true };
        }

        const amount = REWARD_BY_RESULT[result] ?? 0;
        const total = currentPoints + amount;
        localStorage.setItem(DUEL_POINTS_STORAGE_KEY, String(total));
        this.rewardGranted = true;
        return { amount, total, alreadyGranted: false };
    }

    getCurrentPoints() {
        const savedValue = localStorage.getItem(DUEL_POINTS_STORAGE_KEY);
        const savedPoints = Number(savedValue);
        return savedValue !== null && Number.isFinite(savedPoints) && savedPoints >= 0
            ? savedPoints
            : DEFAULT_DUEL_POINTS;
    }
}
