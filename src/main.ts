import { CastPlayer } from './CastPlayer';

const castPlayer = new CastPlayer();

(window as any).castPlayer = castPlayer;

(window as any)['__onGCastApiAvailable'] = (isAvailable: boolean) => {
  if (isAvailable) {
    castPlayer.initializeCastPlayer();
  }
};