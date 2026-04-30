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
  play(): void;
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
  constructor(public castPlayer: CastPlayer) { }
  setTarget(target: PlayerTarget) {
    this.target = target;
  }
  play() { this.target?.play(); }
  pause() { this.target?.pause(); }
  stop() { this.target?.stop(); }
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
        localPlayer.play();
        const vi = document.getElementById('video_image');
        if (vi) vi.style.display = 'none';
        localPlayer.style.display = 'block';
      },
      pause: () => {
        localPlayer.pause();
      },
      stop: () => {
        localPlayer.pause();
        localPlayer.currentTime = 0;
      },
      load: (mediaIndex: number) => {
        if (this.mediaContents) {
          localPlayer.src = this.mediaContents[mediaIndex].sources[0];
          localPlayer.load();
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
        '<img src="' + MEDIA_SOURCE_ROOT + this.mediaContents[i].thumb +
        '" class="thumbnail">';

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

        console.log('Loading...' + this.mediaContents[mediaIndex].title);
        const mediaInfo = new chrome.cast.media.MediaInfo(
          this.mediaContents[mediaIndex].sources[0], 'video/mp4');

        mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.metadataType = chrome.cast.media.MetadataType.GENERIC;
        mediaInfo.metadata.title = this.mediaContents[mediaIndex].title;
        mediaInfo.metadata.images = [
          { url: MEDIA_SOURCE_ROOT + this.mediaContents[mediaIndex].thumb }
        ];

        const request = new chrome.cast.media.LoadRequest(mediaInfo);
        (request as any).credentials = 'user-credentials';
        (request as any).atvCredentials = 'atv-user-credentials';
        request.currentTime = this.currentMediaTime;

        castSession.loadMedia(request).then(
          () => {
            this.playerHandler.loaded();
          },
          (errorCode) => {
            this.playerState = PlayerState.IDLE;
            console.log('Remote media load error: ' + errorCode);
          }
        );
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

    this.playerHandler.play();
  }

  private initializeUI() { }

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
          description: "24 96 flac",
          sources: [
            "https://chenpinchieh.github.io/cast_sender_sample/test.flac",
          ],
          subtitle: "24 96 flac",
          thumb: "images/WhatCarCanYouGetForAGrand.jpg",
          title: "24 96 flac",
        },
        {
          description:
            "Big Buck Bunny tells the story of a giant rabbit with a heart bigger than himself. When one sunny day three rodents rudely harass him, something snaps... and the rabbit ain't no bunny anymore! In the typical cartoon tradition he prepares the nasty rodents a comical revenge.\n\nLicensed under the Creative Commons Attribution license\nhttp://www.bigbuckbunny.org",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
          ],
          subtitle: "By Blender Foundation",
          thumb: "images/BigBuckBunny.jpg",
          title: "Big Buck Bunny",
        },
        {
          description: "The first Blender Open Movie from 2006",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
          ],
          subtitle: "By Blender Foundation",
          thumb: "images/ElephantsDream.jpg",
          title: "Elephant Dream",
        },
        {
          description:
            "HBO GO now works with Chromecast -- the easiest way to enjoy online video on your TV. For when you want to settle into your Iron Throne to watch the latest episodes. For $35.\nLearn how to use Chromecast with HBO GO and more at google.com/chromecast.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
          ],
          subtitle: "By Google",
          thumb: "images/ForBiggerBlazes.jpg",
          title: "For Bigger Blazes",
        },
        {
          description:
            "Introducing Chromecast. The easiest way to enjoy online video and music on your TV. For when Batman's escapes aren't quite big enough. For $35. Learn how to use Chromecast with Google Play Movies and more at google.com/chromecast.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
          ],
          subtitle: "By Google",
          thumb: "images/ForBiggerEscapes.jpg",
          title: "For Bigger Escape",
        },
        {
          description:
            "Introducing Chromecast. The easiest way to enjoy online video and music on your TV. For $35.  Find out more at google.com/chromecast.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
          ],
          subtitle: "By Google",
          thumb: "images/ForBiggerFun.jpg",
          title: "For Bigger Fun",
        },
        {
          description:
            "Introducing Chromecast. The easiest way to enjoy online video and music on your TV. For the times that call for bigger joyrides. For $35. Learn how to use Chromecast with YouTube and more at google.com/chromecast.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
          ],
          subtitle: "By Google",
          thumb: "images/ForBiggerJoyrides.jpg",
          title: "For Bigger Joyrides",
        },
        {
          description:
            "Introducing Chromecast. The easiest way to enjoy online video and music on your TV. For when you want to make Buster's big meltdowns even bigger. For $35. Learn how to use Chromecast with Netflix and more at google.com/chromecast.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
          ],
          subtitle: "By Google",
          thumb: "images/ForBiggerMeltdowns.jpg",
          title: "For Bigger Meltdowns",
        },
        {
          description:
            "Sintel is an independently produced short film, initiated by the Blender Foundation as a means to further improve and validate the free/open source 3D creation suite Blender. With initial funding provided by 1000s of donations via the internet community, it has again proven to be a viable development model for both open 3D technology as for independent animation film.\nThis 15 minute film has been realized in the studio of the Amsterdam Blender Institute, by an international team of artists and developers. In addition to that, several crucial technical and creative targets have been realized online, by developers and artists and teams all over the world.\nwww.sintel.org",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
          ],
          subtitle: "By Blender Foundation",
          thumb: "images/Sintel.jpg",
          title: "Sintel",
        },
        {
          description:
            "Smoking Tire takes the all-new Subaru Outback to the highest point we can find in hopes our customer-appreciation Balloon Launch will get some free T-shirts into the hands of our viewers.",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
          ],
          subtitle: "By Garage419",
          thumb: "images/SubaruOutbackOnStreetAndDirt.jpg",
          title: "Subaru Outback On Street And Dirt",
        },
        {
          description:
            "Tears of Steel was realized with crowd-funding by users of the open source 3D creation tool Blender. Target was to improve and test a complete open and free pipeline for visual effects in film - and to make a compelling sci-fi film in Amsterdam, the Netherlands.  The film itself, and all raw material used for making it, have been released under the Creatieve Commons 3.0 Attribution license. Visit the tearsofsteel.org website to find out more about this, or to purchase the 4-DVD box with a lot of extras.  (CC) Blender Foundation - http://www.tearsofsteel.org",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
          ],
          subtitle: "By Blender Foundation",
          thumb: "images/TearsOfSteel.jpg",
          title: "Tears of Steel",
        },
        {
          description:
            "The Smoking Tire heads out to Adams Motorsports Park in Riverside, CA to test the most requested car of 2010, the Volkswagen GTI. Will it beat the Mazdaspeed3's standard-setting lap time? Watch and see...",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4",
          ],
          subtitle: "By Garage419",
          thumb: "images/VolkswagenGTIReview.jpg",
          title: "Volkswagen GTI Review",
        },
        {
          description:
            "The Smoking Tire is going on the 2010 Bullrun Live Rally in a 2011 Shelby GT500, and posting a video from the road every single day! The only place to watch them is by subscribing to The Smoking Tire or watching at BlackMagicShine.com",
          sources: [
            "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
          ],
          subtitle: "By Garage419",
          thumb: "images/WeAreGoingOnBullrun.jpg",
          title: "We Are Going On Bullrun",
        },
      ],
    },
  ],
};
