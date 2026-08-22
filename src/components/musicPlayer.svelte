<script lang="ts">
import { onDestroy, onMount } from "svelte";
import Icon from "@iconify/svelte";

import { musicPlayerConfig } from "@/config";
import type { MusicPlayerTrack } from "@/types/config";
import { getAssetPath } from "@/utils/music";
import "@styles/musicplayer.css";

const tracks = musicPlayerConfig.local?.playlist ?? [];
const emptyTrack: MusicPlayerTrack = {
    id: "empty",
    title: "No track loaded",
    artist: "Syn4pseOps",
    cover: "/assets/brand/syna4pseops-mark.png",
    url: "",
    duration: 0,
};

const STORAGE = {
    index: "syna4pseops-music-index",
    track: "syna4pseops-music-track",
    position: "syna4pseops-music-position",
    volume: "syna4pseops-music-volume-v3",
    muted: "syna4pseops-music-muted-v2",
    expanded: "syna4pseops-music-expanded",
};

let audio: HTMLAudioElement | null = null;
let currentIndex = $state(0);
let currentTrack = $derived(tracks[currentIndex] ?? emptyTrack);
let isExpanded = $state(true);
let isPlaying = $state(false);
let isMuted = $state(false);
let isLoading = $state(false);
let volume = $state(0.7);
let savedPosition = 0;
let saveTick = 0;
let autoplayFallbackArmed = false;

function readNumber(key: string, fallback: number): number {
    try {
        const storedValue = localStorage.getItem(key);
        if (storedValue === null || storedValue.trim() === "") return fallback;
        const value = Number(storedValue);
        return Number.isFinite(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function saveState() {
    if (!audio) return;
    try {
        localStorage.setItem(STORAGE.index, String(currentIndex));
        localStorage.setItem(STORAGE.track, String(currentTrack.id));
        localStorage.setItem(STORAGE.position, String(audio.currentTime || 0));
        localStorage.setItem(STORAGE.volume, String(volume));
        localStorage.setItem(STORAGE.muted, String(isMuted));
        localStorage.setItem(STORAGE.expanded, String(isExpanded));
    } catch {
        // Playback remains available when storage is disabled.
    }
}

function updatePlaybackState() {
    isPlaying = Boolean(audio && !audio.paused && !audio.ended);
}

function handleLoadedMetadata() {
    if (!audio) return;
    if (savedPosition > 0 && savedPosition < audio.duration) {
        audio.currentTime = savedPosition;
    }
    savedPosition = 0;
    isLoading = false;
}

function handleTimeUpdate() {
    saveTick += 1;
    if (saveTick % 10 === 0) saveState();
}

function handleEnded() {
    void changeTrack(1, true);
}

function handleError() {
    isLoading = false;
    isPlaying = false;
}

async function attemptPlay(): Promise<boolean> {
    if (!audio || !currentTrack.url) return false;
    if (!audio.paused && !audio.ended) return true;
    try {
        await audio.play();
        return true;
    } catch {
        isPlaying = false;
        return false;
    }
}

function removeAutoplayFallback() {
    if (!autoplayFallbackArmed || typeof document === "undefined") return;
    document.removeEventListener("click", handleAutoplayInteraction, true);
    document.removeEventListener("keydown", handleAutoplayInteraction, true);
    autoplayFallbackArmed = false;
}

function handleAutoplayInteraction(event: Event) {
    const target = event.target;
    if (target instanceof Element && target.closest(".music-deck")) return;

    void attemptPlay().then((started) => {
        if (started) removeAutoplayFallback();
    });
}

function armAutoplayFallback() {
    if (autoplayFallbackArmed || typeof document === "undefined") return;
    autoplayFallbackArmed = true;
    document.addEventListener("click", handleAutoplayInteraction, true);
    document.addEventListener("keydown", handleAutoplayInteraction, true);
}

async function togglePlay() {
    if (!audio || !currentTrack.url) return;
    if (audio.paused) {
        await attemptPlay();
    } else {
        audio.pause();
    }
}

async function changeTrack(offset: number, playAfterLoad = true) {
    if (!audio || tracks.length === 0) return;
    const nextIndex = (currentIndex + offset + tracks.length) % tracks.length;
    const nextTrack = tracks[nextIndex];
    currentIndex = nextIndex;
    savedPosition = 0;
    isLoading = true;
    audio.src = getAssetPath(nextTrack.url);
    audio.load();
    saveState();
    if (playAfterLoad) await attemptPlay();
}

function toggleMute() {
    if (!audio) return;
    isMuted = !isMuted;
    audio.muted = isMuted;
    saveState();
}

function toggleExpanded() {
    isExpanded = !isExpanded;
    saveState();
}

onMount(() => {
    if (tracks.length === 0) return;

    const restoredIndex = Math.floor(readNumber(STORAGE.index, 0));
    currentIndex = Math.min(Math.max(restoredIndex, 0), tracks.length - 1);
    let restoredTrack: string | null = null;
    try {
        restoredTrack = localStorage.getItem(STORAGE.track);
    } catch {
        restoredTrack = null;
    }
    savedPosition = restoredTrack === String(currentTrack.id)
        ? Math.max(readNumber(STORAGE.position, 0), 0)
        : 0;
    volume = Math.min(Math.max(readNumber(STORAGE.volume, 0.7), 0), 1);

    try {
        isMuted = localStorage.getItem(STORAGE.muted) === "true";
        const expanded = localStorage.getItem(STORAGE.expanded);
        isExpanded = expanded === null ? true : expanded === "true";
    } catch {
        isExpanded = true;
    }

    audio = new Audio(getAssetPath(currentTrack.url));
    audio.preload = "auto";
    audio.autoplay = Boolean(musicPlayerConfig.autoplay);
    audio.volume = volume;
    audio.muted = isMuted;
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", updatePlaybackState);
    audio.addEventListener("pause", updatePlaybackState);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.load();

    if (musicPlayerConfig.autoplay) {
        armAutoplayFallback();
        void attemptPlay().then((started) => {
            if (started) removeAutoplayFallback();
        });
    }

    window.addEventListener("pagehide", saveState);
});

onDestroy(() => {
    saveState();
    removeAutoplayFallback();
    if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", saveState);
    }
    if (!audio) return;
    audio.pause();
    audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
    audio.removeEventListener("play", updatePlaybackState);
    audio.removeEventListener("pause", updatePlaybackState);
    audio.removeEventListener("timeupdate", handleTimeUpdate);
    audio.removeEventListener("ended", handleEnded);
    audio.removeEventListener("error", handleError);
    audio.src = "";
});
</script>

{#if musicPlayerConfig.enable && tracks.length > 0}
<aside
    class="music-deck"
    class:is-expanded={isExpanded}
    class:is-playing={isPlaying}
    class:is-muted={isMuted}
    data-volume={volume}
    aria-label="Music player"
>
    <div class="deck-shell">
        <section id="music-panel" class="deck-panel" aria-hidden={!isExpanded}>
            <div class="deck-now">
                <button
                    class="deck-eq"
                    type="button"
                    aria-label={isMuted ? "Unmute music" : "Mute music"}
                    aria-pressed={isMuted}
                    onclick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                >
                    <i></i><i></i><i></i><i></i>
                </button>
                <span class="deck-track notranslate" translate="no">
                    <span class="deck-title">{currentTrack.title}</span>
                    <span class="deck-artist">{currentTrack.artist}</span>
                </span>
            </div>

            <div class="deck-controls">
                <button type="button" aria-label="Previous track" onclick={() => changeTrack(-1)}>
                    <Icon icon="material-symbols:skip-previous-rounded" />
                </button>
                <button
                    class="deck-play"
                    type="button"
                    aria-label={isPlaying ? "Pause music" : "Play music"}
                    aria-pressed={isPlaying}
                    disabled={isLoading}
                    onclick={togglePlay}
                >
                    <Icon icon={isPlaying ? "material-symbols:pause-rounded" : "material-symbols:play-arrow-rounded"} />
                </button>
                <button type="button" aria-label="Next track" onclick={() => changeTrack(1)}>
                    <Icon icon="material-symbols:skip-next-rounded" />
                </button>
            </div>
        </section>

        <button
            class="music-toggle"
            type="button"
            aria-label={isExpanded ? "Hide music controls" : "Show music controls"}
            aria-controls="music-panel"
            aria-expanded={isExpanded}
            onclick={toggleExpanded}
            title={isExpanded ? "Hide music player" : "Show music player"}
        >
            <span class="toggle-disc" aria-hidden="true">
                <img src="/assets/brand/syna4pseops-music.jpg?v=20260823" alt="" />
            </span>
        </button>
    </div>
</aside>
{/if}
