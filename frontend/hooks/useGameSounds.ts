/**
 * Game Sound Effects Hook
 *
 * Provides audio feedback for game events.
 * Sounds are muted by default - call enableSounds() to activate.
 *
 * To add actual sounds, place audio files in public/sounds/:
 * - tick.mp3 - Multiplier tick
 * - crash.mp3 - Crash sound
 * - win.mp3 - Cash out success
 * - lose.mp3 - Bet lost
 * - place-bet.mp3 - Bet placed
 * - button-click.mp3 - UI interaction
 */

interface SoundOptions {
  volume?: number;
  loop?: boolean;
}

type SoundEffect = 'tick' | 'crash' | 'win' | 'lose' | 'placeBet' | 'buttonClick';

const soundFiles: Record<SoundEffect, string> = {
  tick: '/sounds/tick.mp3',
  crash: '/sounds/crash.mp3',
  win: '/sounds/win.mp3',
  lose: '/sounds/lose.mp3',
  placeBet: '/sounds/place-bet.mp3',
  buttonClick: '/sounds/button-click.mp3',
};

export function useGameSounds() {
  const [enabled, setEnabled] = React.useState(false);
  const [volume, setVolume] = React.useState(0.3);
  const audioCache = React.useRef<Map<SoundEffect, HTMLAudioElement>>(new Map());

  // Initialize audio elements
  React.useEffect(() => {
    Object.entries(soundFiles).forEach(([key, src]) => {
      const audio = new Audio(src);
      audio.volume = volume;
      audioCache.current.set(key as SoundEffect, audio);
    });

    return () => {
      audioCache.current.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioCache.current.clear();
    };
  }, []);

  // Update volume when changed
  React.useEffect(() => {
    audioCache.current.forEach((audio) => {
      audio.volume = volume;
    });
  }, [volume]);

  const play = (effect: SoundEffect, options: SoundOptions = {}) => {
    if (!enabled) return;

    const audio = audioCache.current.get(effect);
    if (!audio) return;

    audio.currentTime = 0;
    if (options.loop !== undefined) audio.loop = options.loop;
    if (options.volume !== undefined) audio.volume = options.volume;

    audio.play().catch(() => {
      // Ignore errors from autoplay restrictions
    });
  };

  const stop = (effect: SoundEffect) => {
    const audio = audioCache.current.get(effect);
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  };

  return {
    enabled,
    setEnabled,
    volume,
    setVolume,
    play,
    stop,

    // Convenience methods
    playTick: () => play('tick', { volume: volume * 0.5 }),
    playCrash: () => play('crash'),
    playWin: () => play('win'),
    playLose: () => play('lose'),
    playPlaceBet: () => play('placeBet'),
    playButtonClick: () => play('buttonClick', { volume: volume * 0.3 }),
  };
}

import React from 'react';
