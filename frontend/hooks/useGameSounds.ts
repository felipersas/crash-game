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

  useEffect(() => {
    Object.entries(SOUND_FILES).forEach(([key, src]) => {
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

  useEffect(() => {
    audioCache.current.forEach((audio) => {
      audio.volume = volume;
    });
  }, [volume]);

  const play = useCallback((effect: SoundEffect) => {
    if (!enabled) return;

    const audio = audioCache.current.get(effect);
    if (!audio) return;

    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {});
  }, [enabled, volume]);

  return {
    enabled,
    setEnabled,
    volume,
    setVolume,
    playWin: useCallback(() => play('win'), [play]),
    playCrash: useCallback(() => play('crash'), [play]),
  };
}
