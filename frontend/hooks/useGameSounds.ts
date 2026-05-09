'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type SoundEffect = 'crash' | 'win';

const SOUND_FILES: Record<SoundEffect, string> = {
  crash: '/sounds/crash.mp3',
  win: '/sounds/win.mp3',
};

export function useGameSounds() {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const audioCache = useRef<Map<SoundEffect, HTMLAudioElement>>(new Map());
  const unlocked = useRef(false);

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    const unlock = () => {
      if (unlocked.current) return;
      // Play a silent buffer to unlock the audio pipeline
      Object.entries(SOUND_FILES).forEach(([, src]) => {
        const audio = new Audio(src);
        audio.volume = 0;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
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
  }, []);

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
  };
}
