/**
 * @fileoverview Constants for the Google Cast project.
 * Complies with Google's TypeScript Style Guide.
 */
/**
 * States for media playback.
 */
export var PlayerState;
(function (PlayerState) {
    PlayerState["IDLE"] = "IDLE";
    PlayerState["BUFFERING"] = "BUFFERING";
    PlayerState["LOADED"] = "LOADED";
    PlayerState["PLAYING"] = "PLAYING";
    PlayerState["PAUSED"] = "PAUSED";
})(PlayerState || (PlayerState = {}));
/**
 * The active receiver application ID.
 * Found in CastVideos.js as customReceiverNoCss which is assigned to options.receiverApplicationId.
 *
 * Alternative receiver IDs from CastVideos.js:
 * const options = {};
 * const defaultAppId = 'CC1AD845';
 * const customReceiverNoCss = '90CF7469';
 * const styleMediaReceiverId ='46BC63E5';
 * const bugniserTestID='60F3C295';
 * const bugnisertestDrmId='16920947';
 * const customeReceiverWithCastMediaPlayerId = '89F02783';
 * const performanceId = 'B70DBD76';
 */
export const ACTIVE_RECEIVER_ID = 'CC1AD845';
/**
 * Media source root URL.
 */
export const MEDIA_SOURCE_ROOT = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/';
/**
 * Width of progress bar in pixels.
 */
export const PROGRESS_BAR_WIDTH = 600;
/**
 * Time in milliseconds for minimal progress update.
 */
export const TIMER_STEP = 1000;
/**
 * Cast volume upon initial connection.
 */
export const DEFAULT_VOLUME = 0.5;
/**
 * Height, in pixels, of volume bar.
 */
export const FULL_VOLUME_HEIGHT = 100;
//# sourceMappingURL=constants.js.map