'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type SoundEffect = 'crash' | 'win' | 'bet';

const SOUND_FILES: Record<SoundEffect, string> = {
  crash: '/sounds/crash.mp3',
  win: '/sounds/win.mp3',
  bet: '/sounds/bet.mp3',
};

export function useGameSounds() {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(0.3);
  const audioCache = useRef<Map<SoundEffect, HTMLAudioElement>>(new Map());
  const unlocked = useRef(false);

  // Preload all sounds immediately to eliminate first-play delay
  useEffect(() => {
    Object.entries(SOUND_FILES).forEach(([key, src]) => {
      const effect = key as SoundEffect;
      if (!audioCache.current.has(effect)) {
        const audio = new Audio(src);
        audio.volume = volume;
        audio.preload = 'auto';
        audioCache.current.set(effect, audio);
      }
    });

    // Unlock audio on first user interaction (browser autoplay policy)
    const unlock = () => {
      if (unlocked.current) return;
      audioCache.current.forEach((audio) => {
        audio.volume = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = volume;
        }).catch(() => {});
      });
      unlocked.current = true;
    };

    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getAudio = useCallback((effect: SoundEffect) => {
    const existing = audioCache.current.get(effect);
    if (existing) return existing;

    const audio = new Audio(SOUND_FILES[effect]);
    audioCache.current.set(effect, audio);
    return audio;
  }, []);

  useEffect(() => {
    audioCache.current.forEach((audio) => {
      audio.volume = volume;
    });
  }, [volume]);

  const play = useCallback((effect: SoundEffect) => {
    if (!enabled) return;

    const audio = getAudio(effect);
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {});
  }, [enabled, volume, getAudio]);

  return {
    enabled,
    setEnabled,
    volume,
    setVolume,
    playWin: useCallback(() => play('win'), [play]),
    playCrash: useCallback(() => play('crash'), [play]),
    playBet: useCallback(() => play('bet'), [play]),
  };
}
