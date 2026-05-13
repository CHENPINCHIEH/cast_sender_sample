import { PlayerState, ACTIVE_RECEIVER_ID, MEDIA_SOURCE_ROOT, DEFAULT_VOLUME, FULL_VOLUME_HEIGHT, PROGRESS_BAR_WIDTH, TIMER_STEP } from './constants.js';

export interface MediaItem {
  title: string;
  subtitle: string;
  description: string;
  sources: string[];
  studio?: string;
  thumb: string;
  image480x270?: string;
  image780x1200?: string;
}

export interface MediaList {
  categories: {
    name: string;
    videos: MediaItem[];
  }[];
}

export interface PlayerTarget {
  play(): Promise<void> | void;
  pause(): void;
  stop(): void;
  load(mediaIndex: number): void;
  getCurrentMediaTime(): number;
  getMediaDuration(): number;
  updateDisplayMessage(): void;
  setVolume(volumeSliderPosition: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  seekTo(time: number): void;
}

export class PlayerHandler {
  private target: PlayerTarget | null = null;
  private playPromise: Promise<void> | null = null; // Play Lock
  constructor(public castPlayer: CastPlayer) { }
  setTarget(target: PlayerTarget) {
    this.target = target;
  }
  play() {
    const result = this.target?.play();
    if (result instanceof Promise) {
      this.playPromise = result;
      result.finally(() => { this.playPromise = null; });
    }
    this.castPlayer.setPlayPauseUI(true);
  }

  async pause() {
    if (this.playPromise) {
      await this.playPromise.catch(() => { }); // no matter what results, keep going
    }
    this.target?.pause();
    this.castPlayer.setPlayPauseUI(false);
  }

  async stop() {
    if (this.playPromise) {
      await this.playPromise.catch(() => { }); // no matter what results, keep going
    }
    this.target?.stop();
    this.castPlayer.setPlayPauseUI(false);
  }
  load(mediaIndex: number) { this.target?.load(mediaIndex); }
  getCurrentMediaTime(): number { return this.target?.getCurrentMediaTime() || 0; }
  getMediaDuration(): number { return this.target?.getMediaDuration() || 0; }
  updateDisplayMessage() { this.target?.updateDisplayMessage(); }
  setVolume(volumeSliderPosition: number) { this.target?.setVolume(volumeSliderPosition); }
  mute() { this.target?.mute(); }
  unMute() { this.target?.unMute(); }
  isMuted(): boolean { return this.target?.isMuted() || false; }
  seekTo(time: number) { this.target?.seekTo(time); }

  loaded() {
    this.castPlayer.currentMediaDuration = this.getMediaDuration();
    this.castPlayer.updateMediaDuration();
    this.castPlayer.playerState = PlayerState.LOADED;
    this.play();
    this.castPlayer.startProgressTimer();
    this.updateDisplayMessage();
  }
}

export class CastPlayer {
  private playerHandler: PlayerHandler;
  public playerState: PlayerState = PlayerState.IDLE;
  public remotePlayer: cast.framework.RemotePlayer | null = null;
  public remotePlayerController: cast.framework.RemotePlayerController | null = null;
  public currentMediaIndex: number = 0;
  public currentMediaTime: number = 0;
  public currentMediaDuration: number = -1;
  private timer: number | null = null;
  public mediaContents: MediaItem[] | null = null;
  public fullscreen: boolean = false;
  public castSession: cast.framework.CastSession | null = null;
  private incrementMediaTimeHandler: (() => void) | null = null;

  constructor() {
    this.playerHandler = new PlayerHandler(this);

    this.incrementMediaTimeHandler = () => {
      this.incrementMediaTime();
    };

    this.setupLocalPlayer();
    this.addVideoThumbs();
    this.initializeUI();
  }

  private setupLocalPlayer() {
    const localPlayer = document.getElementById('video_element') as HTMLVideoElement;
    if (!localPlayer) return;

    localPlayer.addEventListener('loadeddata', () => this.onMediaLoadedLocally());

    const playerTarget: PlayerTarget = {
      play: () => {
        // play() 回傳的是一個 Promise
        const playPromise = localPlayer.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // 播放成功後才切換 UI 顯示
              const vi = document.getElementById('video_image');
              if (vi) vi.style.display = 'none';
              localPlayer.style.display = 'block';
            })
            .catch((error) => {
              // 自動播放受限或被 pause() 中斷時會進入這裡
              console.warn("Playback was prevented or interrupted:", error);
            });
        }
      },
      pause: () => {
        // 只有在影片正在播放時才執行暫停
        if (!localPlayer.paused) {
          localPlayer.pause();
          this.playerState = PlayerState.PAUSED;
        }
      },
      stop: () => {
        localPlayer.pause();
        localPlayer.currentTime = 0;
        this.playerState = PlayerState.IDLE;
      },
      load: (mediaIndex: number) => {
        if (this.mediaContents) {
          // 在加載新資源前，先停止目前的計時器與狀態
          this.stopProgressTimer();

          localPlayer.src = this.mediaContents[mediaIndex].sources[0];
          localPlayer.load();

          // 重置當前播放時間，避免舊影片的時間點帶入新影片
          this.currentMediaTime = 0;

          this.updateMediaInfoUI(mediaIndex);
        }
      },
      getCurrentMediaTime: () => localPlayer.currentTime,
      getMediaDuration: () => localPlayer.duration,
      updateDisplayMessage: () => {
        const playerStateElem = document.getElementById('playerstate');
        const playerStateBgElem = document.getElementById('playerstatebg');
        const videoImageOverlayElem = document.getElementById('video_image_overlay');
        if (playerStateElem) playerStateElem.style.display = 'none';
        if (playerStateBgElem) playerStateBgElem.style.display = 'none';
        if (videoImageOverlayElem) videoImageOverlayElem.style.display = 'none';
      },
      setVolume: (volumeSliderPosition: number) => {
        localPlayer.volume = volumeSliderPosition < FULL_VOLUME_HEIGHT ?
          volumeSliderPosition / FULL_VOLUME_HEIGHT : 1;
        const p = document.getElementById('audio_bg_level');
        if (p) {
          p.style.height = volumeSliderPosition + 'px';
          p.style.marginTop = -volumeSliderPosition + 'px';
        }
      },
      mute: () => {
        localPlayer.muted = true;
      },
      unMute: () => {
        localPlayer.muted = false;
      },
      isMuted: () => localPlayer.muted,
      seekTo: (time: number) => {
        localPlayer.currentTime = time;
      }
    };

    this.playerHandler.setTarget(playerTarget);
    this.playerHandler.setVolume(DEFAULT_VOLUME * FULL_VOLUME_HEIGHT);

    this.showFullscreenButton();

    if (this.currentMediaTime > 0) {
      this.playerHandler.play();
    }
  }

  public setPlayPauseUI(isPlaying: boolean) {
    const playElem = document.getElementById('play');
    const pauseElem = document.getElementById('pause');
    if (isPlaying) {
      if (playElem) playElem.style.display = 'none';
      if (pauseElem) pauseElem.style.display = 'block';
    } else {
      if (playElem) playElem.style.display = 'block';
      if (pauseElem) pauseElem.style.display = 'none';
    }
  }

  private updateMediaInfoUI(mediaIndex: number) {
    if (!this.mediaContents) return;
    const media = this.mediaContents[mediaIndex];

    const titleEl = document.getElementById('media_title');
    if (titleEl) {
      titleEl.innerText = media.title;
    }

    const subtitleEl = document.getElementById('media_subtitle');
    if (subtitleEl) {
      subtitleEl.innerText = media.subtitle;
    }

    const descEl = document.getElementById('media_desc');
    if (descEl) {
      descEl.innerText = media.description;
    }
  }

  private addVideoThumbs() {
    this.mediaContents = mediaJSON.categories[0].videos;
    const ni = document.getElementById('carousel');
    if (!ni) return;

    for (let i = 0; i < this.mediaContents.length; i++) {
      const newdiv = document.createElement('div');
      const divIdName = 'thumb' + i + 'Div';
      newdiv.setAttribute('id', divIdName);
      newdiv.setAttribute('class', 'thumb');
      newdiv.innerHTML =
        '<img src="' + this.mediaContents[i].thumb +
        '" class="thumbnail" crossorigin="anonymous">';

      newdiv.addEventListener('click', () => {
        this.currentMediaIndex = i;
        this.playerHandler.load(i);
      });
      ni.appendChild(newdiv);
    }
  }

  private onMediaLoadedLocally() {
    const localPlayer = document.getElementById('video_element') as HTMLVideoElement;
    if (localPlayer) {
      localPlayer.currentTime = this.currentMediaTime;
    }
    this.playerHandler.loaded();
  }

  private showFullscreenButton() {
    // Dummy implementation
  }

  public updateMediaDuration() {
    const durationElem = document.getElementById('duration');
    if (durationElem) {
      durationElem.innerHTML = CastPlayer.getDurationString(this.currentMediaDuration);
    }
  }

  public startProgressTimer() {
    this.stopProgressTimer();
    if (this.playerState === PlayerState.PLAYING) {
      this.timer = window.setInterval(this.incrementMediaTimeHandler!, TIMER_STEP);
    }
  }

  public stopProgressTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public initializeCastPlayer() {
    const options = {
      receiverApplicationId: ACTIVE_RECEIVER_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      androidReceiverCompatible: false
    };

    try {
      cast.framework.CastContext.getInstance().setOptions(options);

      const credentialsData = new (chrome as any).cast.CredentialsData('{"userId": "abc"}');
      (cast.framework.CastContext.getInstance() as any).setLaunchCredentialsData(credentialsData);

      this.remotePlayer = new cast.framework.RemotePlayer();
      this.remotePlayerController = new cast.framework.RemotePlayerController(this.remotePlayer);

      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        () => this.switchPlayer()
      );

      const castContext = cast.framework.CastContext.getInstance();
      castContext.addEventListener(
        cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event: cast.framework.SessionStateEventData) => {
          console.log('CastContext SESSION_STATE_CHANGED:', event.sessionState, event);
          if (event.sessionState === cast.framework.SessionState.SESSION_STARTING ||
            event.sessionState === cast.framework.SessionState.SESSION_STARTED) {
            this.switchPlayer();
          }
          if (event.sessionState === cast.framework.SessionState.SESSION_ENDED) {
            console.log('Session ended.');
            this.switchPlayer();
          }
        }
      );

      console.log('RemotePlayer and Controller initialized.');
    } catch (error) {
      console.error('Error initializing Cast Player:', error);
    }
  }

  public switchPlayer() {
    this.playerHandler.stop();
    this.playerState = PlayerState.IDLE;

    if (this.remotePlayer && this.remotePlayer.isConnected) {
      this.setupRemotePlayer();
    } else {
      this.setupLocalPlayer();
    }
  }

  private setupRemotePlayer() {
    const castSession = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!castSession) return;

    this.castSession = castSession;

    if (this.remotePlayerController) {
      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
        () => {
          if (this.remotePlayer?.isPaused) {
            this.playerHandler.pause();
          } else {
            this.playerHandler.play();
          }
        }
      );

      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_MUTED_CHANGED,
        () => {
          if (this.remotePlayer?.isMuted) {
            this.playerHandler.mute();
          } else {
            this.playerHandler.unMute();
          }
        }
      );

      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.VOLUME_LEVEL_CHANGED,
        () => {
          const newVolume = (this.remotePlayer?.volumeLevel || 0) * FULL_VOLUME_HEIGHT;
          const p = document.getElementById('audio_bg_level');
          if (p) {
            p.style.height = newVolume + 'px';
            p.style.marginTop = -newVolume + 'px';
          }
        }
      );
    }

    const playerTarget: PlayerTarget = {
      play: () => {
        if (this.remotePlayer?.isPaused) {
          this.remotePlayerController?.playOrPause();
        }
        const vi = document.getElementById('video_image');
        if (vi) vi.style.display = 'block';
        const localPlayer = document.getElementById('video_element');
        if (localPlayer) localPlayer.style.display = 'none';
      },
      pause: () => {
        if (!this.remotePlayer?.isPaused) {
          this.remotePlayerController?.playOrPause();
        }
      },
      stop: () => {
        this.remotePlayerController?.stop();
      },
      load: (mediaIndex: number) => {
        if (!this.mediaContents) return;

        const sourceUrl = this.mediaContents[mediaIndex].sources[0];
        const contentType = getMimeType(sourceUrl); // 動態獲取類型

        console.log(`Loading... [${contentType}] ${this.mediaContents[mediaIndex].title}`);

        const mediaInfo = new chrome.cast.media.MediaInfo(sourceUrl, contentType);

        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.GENERIC;
        mediaInfo.metadata.title = this.mediaContents[mediaIndex].title;
        mediaInfo.metadata.images = [
          { url: this.mediaContents[mediaIndex].thumb }
        ];

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        console.log('setupRemotePlayer load request', request);

        // 原有的 credentials 設定
        (request as any).credentials = 'user-credentials';
        (request as any).atvCredentials = 'atv-user-credentials';
        request.currentTime = this.currentMediaTime;

        castSession.loadMedia(request).then(
          () => {
            this.playerHandler.loaded();
            console.log('Remote media load success');
          },
          (errorCode) => {
            this.playerState = PlayerState.IDLE;
            console.log('Remote media load error: ' + errorCode);
          }
        );

        this.updateMediaInfoUI(mediaIndex);
      },
      getCurrentMediaTime: () => this.remotePlayer?.currentTime || 0,
      getMediaDuration: () => this.remotePlayer?.duration || 0,
      updateDisplayMessage: () => {
        const playerStateElem = document.getElementById('playerstate');
        const playerStateBgElem = document.getElementById('playerstatebg');
        const videoImageOverlayElem = document.getElementById('video_image_overlay');

        if (playerStateElem) playerStateElem.style.display = 'block';
        if (playerStateBgElem) playerStateBgElem.style.display = 'block';
        if (videoImageOverlayElem) videoImageOverlayElem.style.display = 'block';

        if (playerStateElem && this.mediaContents) {
          playerStateElem.innerHTML =
            this.mediaContents[this.currentMediaIndex].title + ' ' +
            this.playerState + ' on ' + castSession.getCastDevice().friendlyName;
        }
      },
      setVolume: (volumeSliderPosition: number) => {
        let currentVolume = this.remotePlayer?.volumeLevel || 0;
        const p = document.getElementById('audio_bg_level');
        if (volumeSliderPosition < FULL_VOLUME_HEIGHT) {
          const vScale = currentVolume * FULL_VOLUME_HEIGHT;
          if (volumeSliderPosition > vScale) {
            volumeSliderPosition = vScale + (volumeSliderPosition - vScale) / 2;
          }
          if (p) {
            p.style.height = volumeSliderPosition + 'px';
            p.style.marginTop = -volumeSliderPosition + 'px';
          }
          currentVolume = volumeSliderPosition / FULL_VOLUME_HEIGHT;
        } else {
          currentVolume = 1;
        }
        if (this.remotePlayer) this.remotePlayer.volumeLevel = currentVolume;
        this.remotePlayerController?.setVolumeLevel();
      },
      mute: () => {
        if (!this.remotePlayer?.isMuted) {
          this.remotePlayerController?.muteOrUnmute();
        }
      },
      unMute: () => {
        if (this.remotePlayer?.isMuted) {
          this.remotePlayerController?.muteOrUnmute();
        }
      },
      isMuted: () => this.remotePlayer?.isMuted || false,
      seekTo: (time: number) => {
        if (this.remotePlayer) this.remotePlayer.currentTime = time;
        this.remotePlayerController?.seek();
      }
    };

    this.playerHandler.setTarget(playerTarget);

    if (this.remotePlayer?.isMuted) {
      this.playerHandler.mute();
    }
    const currentVolume = (this.remotePlayer?.volumeLevel || 0) * FULL_VOLUME_HEIGHT;
    const p = document.getElementById('audio_bg_level');
    if (p) {
      p.style.height = currentVolume + 'px';
      p.style.marginTop = -currentVolume + 'px';
    }
    const getMimeType = (url: string): string => {
      if (url.endsWith('.m3u8')) return 'application/x-mpegurl';
      if (url.endsWith('.mpd')) return 'application/dash+xml';
      if (url.endsWith('.flac')) return 'audio/flac';
      return 'video/mp4'; // 預設值
    };
    this.playerHandler.play();
  }

  private initializeUI() {
    // 1. 播放 / 暫停按鈕
    const playElem = document.getElementById('play');
    const pauseElem = document.getElementById('pause');

    playElem?.addEventListener('click', () => {
      this.playerHandler.play();
      if (playElem) playElem.style.display = 'none';
      if (pauseElem) pauseElem.style.display = 'block';
    });

    pauseElem?.addEventListener('click', () => {
      this.playerHandler.pause();
      if (playElem) playElem.style.display = 'block';
      if (pauseElem) pauseElem.style.display = 'none';
    });

    // 2. 進度條點擊跳轉 (Seek)
    const progressBg = document.getElementById('progress_bg');
    progressBg?.addEventListener('click', (event) => {
      if (this.currentMediaDuration > 0) {
        // 計算點擊位置比例
        const rect = progressBg.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percent = clickX / rect.width;
        const seekTime = percent * this.currentMediaDuration;

        this.playerHandler.seekTo(seekTime);
      }
    });

    // 3. 音量控制
    const audioBg = document.getElementById('audio_bg_track');
    audioBg?.addEventListener('click', (event) => {
      const rect = audioBg.getBoundingClientRect();
      const clickY = event.clientY - rect.top;
      // 這裡的 FULL_VOLUME_HEIGHT 通常定義在 constants.ts
      const volumePosition = FULL_VOLUME_HEIGHT - clickY;
      this.playerHandler.setVolume(volumePosition);
    });

    // 4. 靜音切換
    const audioOn = document.getElementById('audio_on');
    const audioOff = document.getElementById('audio_off');

    audioOn?.addEventListener('click', () => {
      this.playerHandler.mute();
      if (audioOn) audioOn.style.display = 'none';
      if (audioOff) audioOff.style.display = 'block';
    });

    audioOff?.addEventListener('click', () => {
      this.playerHandler.unMute();
      if (audioOn) audioOn.style.display = 'block';
      if (audioOff) audioOff.style.display = 'none';
    });
  }

  private incrementMediaTime() {
    this.currentMediaTime = this.playerHandler.getCurrentMediaTime();
    this.currentMediaDuration = this.playerHandler.getMediaDuration();

    if (this.playerState === PlayerState.PLAYING) {
      if (this.currentMediaTime < this.currentMediaDuration) {
        this.currentMediaTime += 1;
        this.updateProgressBarByTimer();
      } else {
        this.endPlayback();
      }
    }
  }

  private updateProgressBarByTimer() {
    const p = document.getElementById('progress');
    const pi = document.getElementById('progress_indicator');
    const currentTimeElem = document.getElementById('current_time');

    if (!p || !pi) return;

    let pp = 0;
    if (this.currentMediaDuration > 0) {
      pp = Math.floor(PROGRESS_BAR_WIDTH * this.currentMediaTime / this.currentMediaDuration);
    }

    p.style.width = pp + 'px';
    pi.style.marginLeft = -21 - PROGRESS_BAR_WIDTH + pp + 'px';

    if (currentTimeElem) {
      currentTimeElem.innerHTML = CastPlayer.getDurationString(this.currentMediaTime);
    }

    if (pp >= PROGRESS_BAR_WIDTH) {
      this.endPlayback();
    }
  }

  private endPlayback() {
    this.currentMediaTime = 0;
    this.stopProgressTimer();
    this.playerState = PlayerState.IDLE;
    this.playerHandler.updateDisplayMessage();

    const playElem = document.getElementById('play');
    const pauseElem = document.getElementById('pause');
    if (playElem) playElem.style.display = 'block';
    if (pauseElem) pauseElem.style.display = 'none';
  }

  private static getDurationString(durationInSec: number): string {
    let durationString = '' + Math.floor(durationInSec % 60);
    const durationInMin = Math.floor(durationInSec / 60);
    if (durationInMin === 0) {
      return durationString;
    }
    durationString = (durationInMin % 60) + ':' + durationString;
    const durationInHour = Math.floor(durationInMin / 60);
    if (durationInHour === 0) {
      return durationString;
    }
    return durationInHour + ':' + durationString;
  }
}

const mediaJSON = {
  categories: [
    {
      name: "Movies",
      videos: [
        {
          description: "24 96 flac music file",
          sources: ["https://chenpinchieh.github.io/cast_sender_sample/test.flac"],
          subtitle: "Song by Simon & Garfunkel",
          thumb: "images/2496fac.jpeg",
          title: "You Can Tell the World",
        },
        {
          description: "BigBuckBunny Video",
          sources: [
            // "https://ia601903.us.archive.org/32/items/BigBuckBunny_328/BigBuckBunny_512kb.mp4?cnt=0"
            "https://storage.googleapis.com/cpe-sample-media/content/big_buck_bunny/big_buck_bunny_m4s_master.m3u8"
          ],
          subtitle: "BigBuckBunny",
          thumb: "images/bunny.jpg",
          title: "BigBuckBunny",
        }
      ],
    },
  ],
};
