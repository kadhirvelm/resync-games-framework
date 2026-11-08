"use client";

import {
  type AudioAsset,
  type CrosswordCryptPublicState,
  isServiceError,
} from "@resync-game-framework/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { CROSSWORD_CRYPT_ART_TAGS } from "./data/art";
import { CROSSWORD_CRYPT_AUDIO_IDS } from "./data/audio";

type ArtTag =
  (typeof CROSSWORD_CRYPT_ART_TAGS)[keyof typeof CROSSWORD_CRYPT_ART_TAGS];
type AudioId =
  (typeof CROSSWORD_CRYPT_AUDIO_IDS)[keyof typeof CROSSWORD_CRYPT_AUDIO_IDS];

/** Loads optional generated media and synchronizes it with public run moments. */
export function useCrosswordCryptAssets(
  state: CrosswordCryptPublicState | undefined,
) {
  const { clientServiceCallers } = useClientServiceCallers();
  const [art, setArt] = useState<Partial<Record<ArtTag, string>>>({});
  const [pictureHints, setPictureHints] = useState<Record<string, string>>({});
  const [audioReady, setAudioReady] = useState(false);
  const audio = useRef<Partial<Record<AudioId, AudioAsset>>>({});
  const previous = useRef<CrosswordCryptPublicState | undefined>(undefined);
  const phase = state?.phase;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      clientServiceCallers.staticImage.list(),
      clientServiceCallers.audio.list(),
    ])
      .then(([images, clips]) => {
        if (cancelled) return;
        if (!isServiceError(images)) {
          const next: Partial<Record<ArtTag, string>> = {};
          for (const tag of Object.values(CROSSWORD_CRYPT_ART_TAGS)) {
            const image = images.staticImages.find((candidate) =>
              candidate.prompt.startsWith(tag),
            );
            if (image) next[tag] = image.imageUrl;
          }
          setArt(next);
          setPictureHints(
            Object.fromEntries(
              images.staticImages
                .filter((candidate) =>
                  candidate.prompt.startsWith("Crossword Crypt picture hint:"),
                )
                .map((candidate) => [
                  candidate.prompt.split(".")[0] ?? candidate.prompt,
                  candidate.imageUrl,
                ]),
            ),
          );
        }
        if (isServiceError(clips)) return;
        for (const id of Object.values(CROSSWORD_CRYPT_AUDIO_IDS)) {
          const tag = `[crossword-crypt:audio:${id}]`;
          const clip = clips.clips.find((candidate) =>
            candidate.prompt.startsWith(tag),
          );
          if (clip) audio.current[id] = clip;
        }
      })
      .catch(() => {
        // Generated media is optional; CSS and silence are the stand-ins.
      });
    return () => {
      cancelled = true;
    };
  }, [clientServiceCallers]);

  useEffect(() => {
    const unlock = () => setAudioReady(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const play = useCallback(
    (id: AudioId) => {
      if (!audioReady) return;
      const clip = audio.current[id];
      if (!clip) return;
      const player = new Audio(clip.audioUrl);
      player.volume = clip.role === "music" ? 0.22 : 0.45;
      void player.play().catch(() => undefined);
    },
    [audioReady],
  );

  useEffect(() => {
    const prior = previous.current;
    previous.current = state;
    if (!state || !prior) return;
    if (state.torches < prior.torches) play(CROSSWORD_CRYPT_AUDIO_IDS.torch);
    if (state.lastGuess?.correct && !prior.lastGuess?.correct)
      play(CROSSWORD_CRYPT_AUDIO_IDS.doorOpens);
    if (state.relics.length > prior.relics.length)
      play(CROSSWORD_CRYPT_AUDIO_IDS.relic);
    if (state.hintTokens < prior.hintTokens)
      play(CROSSWORD_CRYPT_AUDIO_IDS.hint);
    if (state.phase === "escaped" && prior.phase !== "escaped")
      play(CROSSWORD_CRYPT_AUDIO_IDS.escape);
    if (state.phase === "sealed" && prior.phase !== "sealed")
      play(CROSSWORD_CRYPT_AUDIO_IDS.sealed);
  }, [play, state]);

  useEffect(() => {
    if (!audioReady || !phase || phase === "lobby") return;
    const ids: AudioId[] = [CROSSWORD_CRYPT_AUDIO_IDS.ambience];
    if (phase === "vault") ids.push(CROSSWORD_CRYPT_AUDIO_IDS.vault);
    if (phase === "room") ids.push(CROSSWORD_CRYPT_AUDIO_IDS.solving);
    const players = ids.flatMap((id) => {
      const clip = audio.current[id];
      if (!clip) return [];
      const player = new Audio(clip.audioUrl);
      player.loop = true;
      player.volume = clip.role === "music" ? 0.16 : 0.12;
      void player.play().catch(() => undefined);
      return [player];
    });
    return () => {
      for (const player of players) player.pause();
    };
  }, [audioReady, phase]);

  return { art, pictureHints };
}
