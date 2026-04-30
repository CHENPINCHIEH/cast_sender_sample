import { CastPlayer } from './CastPlayer.js';
const castPlayer = new CastPlayer();
// 將實例掛載到 window 方便除錯
window.castPlayer = castPlayer;
/**
 * 當 Google Cast SDK 腳本載入完成時會觸發此回呼
 */
window['__onGCastApiAvailable'] = (isAvailable) => {
    if (isAvailable) {
        // 使用輪詢機制確保 cast.framework 真正準備就緒
        // 這是解決 "cast is not defined" 的最穩健做法
        const checkCastInterval = setInterval(() => {
            const cast = window.cast;
            if (typeof cast !== 'undefined' && cast.framework) {
                console.log("Google Cast SDK 真正準備就緒了！");
                clearInterval(checkCastInterval);
                // 確保初始化在 SDK 完全可用後執行
                castPlayer.initializeCastPlayer();
            }
        }, 50); // 每 50ms 檢查一次
        // 設定超時保護（5秒），避免在 SDK 載入失敗時無限循環
        setTimeout(() => {
            clearInterval(checkCastInterval);
        }, 5000);
    }
    else {
        console.error("Google Cast API 不可用，請檢查網路連線或是否被廣告攔截器阻擋。");
    }
};
//# sourceMappingURL=main.js.map