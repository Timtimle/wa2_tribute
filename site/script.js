const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const hasFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

const tracks = [
  {
    number: "01",
    title: "Itsukamita Keshiki",
    jp: "いつか見た景色",
    chapter: "Entry · A remembered landscape",
    duration: 156,
    src: "/audio/itsukamita-keshiki.mp3",
    tint: "#a7c4e4",
    waveSeed: 2.1,
  },
  {
    number: "02",
    title: "Twinkle Snow",
    jp: "トゥインクル・スノー",
    chapter: "Introductory Chapter · Instrumental",
    duration: 287,
    src: "/audio/twinkle-snow-instrumental.mp3",
    tint: "#91a4c4",
    waveSeed: 3.7,
  },
  {
    number: "03",
    title: "Honesty",
    jp: "Honesty",
    chapter: "Closing Chapter",
    duration: 224,
    src: "/audio/honesty.mp3",
    tint: "#c09a7a",
    waveSeed: 5.2,
  },
  {
    number: "04",
    title: "POWDER SNOW",
    jp: "POWDER SNOW",
    chapter: "Kazusa · Piano",
    duration: 221,
    src: "/audio/powder-snow-piano-kazusa.mp3",
    tint: "#b4c8df",
    waveSeed: 6.9,
  },
  {
    number: "05",
    title: "Siawasenakioku",
    jp: "幸せな記憶",
    chapter: "After the last note · Piano",
    duration: 219,
    src: "/audio/siawasenakioku-piano.mp3",
    tint: "#d2b18d",
    waveSeed: 8.4,
  },
  {
    number: "06",
    title: "Tokinomahou",
    jp: "時の魔法",
    chapter: "Extra · Instrumental",
    duration: 213,
    src: "/audio/tokinomahou-instrumental.mp3",
    tint: "#9db1cc",
    waveSeed: 10.3,
  },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

class WinterAudio {
  constructor(onChange) {
    this.onChange = onChange;
    this.elements = [$("#audio-a"), $("#audio-b")];
    this.activeSlot = 0;
    this.activeIndex = 0;
    this.playing = false;
    this.starting = false;
    this.volume = 0.58;
    this.mixLevels = [1, 0];
    this.fadeFrame = 0;
    this.fadeToken = 0;
    this.fadeResolve = null;
    this.requestToken = 0;
    this.pendingIndex = null;
    this.queuedIndex = null;

    this.elements.forEach((element, slot) => {
      element.volume = slot === this.activeSlot ? this.volume : 0;
      element.addEventListener("loadedmetadata", () => {
        const index = Number(element.dataset.trackIndex);
        if (!Number.isInteger(index) || !Number.isFinite(element.duration)) return;
        tracks[index].duration = element.duration;
        const rowTime = $(`.track[data-track="${index}"] em`);
        if (rowTime) rowTime.textContent = `${formatTime(element.duration)} ↻`;
        if (index === this.activeIndex) this.onChange();
      });
    });
  }

  get current() {
    return this.elements[this.activeSlot];
  }

  loadSlot(slot, index) {
    const element = this.elements[slot];
    const track = tracks[index];
    if (element.dataset.trackIndex === String(index) && element.getAttribute("src") === track.src) return element;
    element.pause();
    element.dataset.trackIndex = String(index);
    element.src = track.src;
    element.load();
    try { element.currentTime = 0; } catch { /* metadata has not arrived yet */ }
    return element;
  }

  applyVolumes() {
    this.elements.forEach((element, slot) => {
      element.volume = clamp(this.volume * this.mixLevels[slot], 0, 1);
    });
  }

  cancelFade() {
    this.fadeToken += 1;
    if (this.fadeFrame) cancelAnimationFrame(this.fadeFrame);
    this.fadeFrame = 0;
    this.fadeResolve?.();
    this.fadeResolve = null;
  }

  fadeBetween(previousSlot, nextSlot, duration = 1400) {
    this.cancelFade();
    const token = this.fadeToken;
    const startedAt = performance.now();
    const previousStart = Math.max(0, this.mixLevels[previousSlot]);
    this.mixLevels[nextSlot] = 0;
    this.applyVolumes();

    return new Promise((resolve) => {
      this.fadeResolve = resolve;
      const step = (now) => {
        if (token !== this.fadeToken) return;
        const progress = clamp((now - startedAt) / duration, 0, 1);
        this.mixLevels[previousSlot] = previousStart * (1 - progress);
        this.mixLevels[nextSlot] = progress;
        this.applyVolumes();

        if (progress < 1) {
          this.fadeFrame = requestAnimationFrame(step);
          return;
        }

        this.fadeFrame = 0;
        this.fadeResolve = null;
        this.mixLevels[previousSlot] = 0;
        this.mixLevels[nextSlot] = 1;
        this.elements[previousSlot].pause();
        try { this.elements[previousSlot].currentTime = 0; } catch { /* safely reset when possible */ }
        this.applyVolumes();
        resolve();
      };
      this.fadeFrame = requestAnimationFrame(step);
    });
  }

  async changeTrack(index) {
    const nextIndex = clamp(Number(index), 0, tracks.length - 1);

    if (this.starting && !this.playing) {
      if (nextIndex === this.pendingIndex) {
        this.onChange();
        return;
      }
      await this.start(nextIndex);
      return;
    }

    if (this.playing && this.fadeResolve) {
      this.queuedIndex = nextIndex === this.activeIndex ? null : nextIndex;
      this.onChange();
      return;
    }

    if (nextIndex === this.pendingIndex) {
      this.onChange();
      return;
    }

    if (nextIndex === this.activeIndex) {
      if (this.pendingIndex !== null) {
        this.requestToken += 1;
        this.pendingIndex = null;
        this.cancelFade();
        const inactiveSlot = this.activeSlot === 0 ? 1 : 0;
        this.elements[inactiveSlot].pause();
        try { this.elements[inactiveSlot].currentTime = 0; } catch { /* safely reset when possible */ }
        this.mixLevels[this.activeSlot] = 1;
        this.mixLevels[inactiveSlot] = 0;
        this.applyVolumes();
      }
      this.onChange();
      return;
    }
    const requestToken = ++this.requestToken;

    if (!this.playing) {
      this.starting = false;
      this.pendingIndex = null;
      this.queuedIndex = null;
      this.activeIndex = nextIndex;
      this.cancelFade();
      this.elements.forEach((element) => element.pause());
      this.loadSlot(this.activeSlot, nextIndex);
      this.mixLevels = this.activeSlot === 0 ? [1, 0] : [0, 1];
      this.applyVolumes();
      this.onChange();
      return;
    }

    const previousIndex = this.activeIndex;
    const previousSlot = this.activeSlot;
    const nextSlot = previousSlot === 0 ? 1 : 0;
    const next = this.loadSlot(nextSlot, nextIndex);
    this.pendingIndex = nextIndex;
    this.mixLevels[nextSlot] = 0;
    this.applyVolumes();

    try {
      await next.play();
    } catch (error) {
      if (requestToken !== this.requestToken) return;
      this.pendingIndex = null;
      next.pause();
      this.activeIndex = previousIndex;
      this.activeSlot = previousSlot;
      this.mixLevels[previousSlot] = 1;
      this.mixLevels[nextSlot] = 0;
      this.applyVolumes();
      throw error;
    }

    if (requestToken !== this.requestToken) return;

    this.pendingIndex = null;
    this.activeIndex = nextIndex;
    this.activeSlot = nextSlot;
    this.onChange();
    await this.fadeBetween(previousSlot, nextSlot);

    const queuedIndex = this.queuedIndex;
    this.queuedIndex = null;
    if (this.playing && queuedIndex !== null && queuedIndex !== this.activeIndex) {
      await this.changeTrack(queuedIndex);
    }
  }

  async start(index = this.activeIndex) {
    const nextIndex = clamp(Number(index), 0, tracks.length - 1);
    if (this.playing) {
      await this.changeTrack(nextIndex);
      return;
    }

    if (this.starting && nextIndex === this.pendingIndex) {
      this.onChange();
      return;
    }

    const requestToken = ++this.requestToken;
    this.starting = true;
    this.pendingIndex = nextIndex;
    this.queuedIndex = null;
    this.activeIndex = nextIndex;
    const current = this.loadSlot(this.activeSlot, nextIndex);
    this.cancelFade();
    this.mixLevels = this.activeSlot === 0 ? [1, 0] : [0, 1];
    this.applyVolumes();
    try {
      await current.play();
    } catch (error) {
      if (requestToken !== this.requestToken) return;
      this.pendingIndex = null;
      this.starting = false;
      throw error;
    }
    if (requestToken !== this.requestToken) return;
    this.pendingIndex = null;
    this.starting = false;
    this.playing = true;
    this.onChange();
  }

  async toggle() {
    if (this.playing || this.starting) {
      this.requestToken += 1;
      this.cancelFade();
      this.elements.forEach((element) => element.pause());
      this.pendingIndex = null;
      this.queuedIndex = null;
      this.mixLevels = this.activeSlot === 0 ? [1, 0] : [0, 1];
      this.applyVolumes();
      this.playing = false;
      this.starting = false;
      this.onChange();
      return;
    }
    await this.start(this.activeIndex);
  }

  setVolume(value) {
    this.volume = clamp(Number(value), 0, 1);
    this.applyVolumes();
  }

  elapsed() {
    return Number.isFinite(this.current?.currentTime) ? this.current.currentTime : 0;
  }

  progress() {
    const duration = Number.isFinite(this.current?.duration) ? this.current.duration : tracks[this.activeIndex].duration;
    return duration > 0 ? clamp(this.elapsed() / duration, 0, 1) : 0;
  }
}

const playerElements = {
  room: $("#music"),
  title: $("#track-title"),
  jp: $("#track-jp"),
  number: $("#track-number"),
  playStatus: $("#play-status"),
  playButton: $("#play-button"),
  soundToggle: $("#sound-toggle"),
  soundLabel: $("#sound-label"),
  total: $("#time-total"),
  current: $("#time-current"),
  shell: $("#waveform-shell"),
  canvas: $("#waveform"),
};

let playbackFrame = 0;
let lastDisplayedSecond = -1;
let drawnWaveformTrack = -1;

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function startPlaybackTicker() {
  if (playbackFrame || !audio.playing || document.hidden) return;
  const tick = () => {
    if (!audio.playing || document.hidden) {
      playbackFrame = 0;
      return;
    }
    const progress = audio.progress();
    playerElements.shell.style.setProperty("--wave-progress", progress.toFixed(4));
    const elapsed = Math.floor(audio.elapsed());
    if (elapsed !== lastDisplayedSecond) {
      playerElements.current.textContent = formatTime(elapsed);
      lastDisplayedSecond = elapsed;
    }
    playbackFrame = requestAnimationFrame(tick);
  };
  playbackFrame = requestAnimationFrame(tick);
}

function stopPlaybackTicker() {
  if (playbackFrame) cancelAnimationFrame(playbackFrame);
  playbackFrame = 0;
}

function drawWaveform() {
  const canvas = playerElements.canvas;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.floor(bounds.width * dpr);
  const height = Math.floor(bounds.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  const track = tracks[audio.activeIndex];
  const bars = clamp(Math.floor(bounds.width / 5), 56, 132);
  const gap = 2 * dpr;
  const barWidth = Math.max(1, width / bars - gap);
  const center = height / 2;
  context.fillStyle = track.tint;

  for (let index = 0; index < bars; index += 1) {
    const phase = index / Math.max(1, bars - 1);
    const musical = Math.abs(Math.sin(phase * Math.PI * (6 + track.waveSeed) + track.waveSeed));
    const detail = Math.abs(Math.sin(phase * Math.PI * (29 + track.waveSeed) + track.waveSeed * 0.43));
    const envelope = 0.48 + Math.sin(phase * Math.PI) * 0.52;
    const amplitude = (0.13 + musical * 0.47 + detail * 0.22) * envelope;
    const barHeight = Math.max(2 * dpr, amplitude * height * 0.78);
    const x = index * (barWidth + gap);
    context.globalAlpha = 0.44 + musical * 0.46;
    context.fillRect(x, center - barHeight / 2, barWidth, barHeight);
  }
  context.globalAlpha = 1;
}

function updatePlayer() {
  const track = tracks[audio.activeIndex];
  const elapsed = Math.floor(audio.elapsed());
  playerElements.title.textContent = track.title;
  playerElements.jp.textContent = track.jp;
  playerElements.number.textContent = track.number;
  playerElements.total.textContent = formatTime(track.duration);
  playerElements.room.dataset.activeTrack = String(audio.activeIndex);
  playerElements.playStatus.textContent = audio.playing ? "Now playing" : "Selected track";
  playerElements.playButton.classList.toggle("is-playing", audio.playing);
  playerElements.playButton.setAttribute("aria-pressed", String(audio.playing));
  playerElements.playButton.setAttribute("aria-label", `${audio.playing ? "Pause" : "Play"} ${track.title}`);
  playerElements.soundToggle.classList.toggle("is-playing", audio.playing);
  playerElements.soundToggle.setAttribute("aria-pressed", String(audio.playing));
  playerElements.soundToggle.setAttribute("aria-label", `${audio.playing ? "Pause" : "Play"} ${track.title}`);
  playerElements.soundLabel.textContent = audio.playing ? track.title : "Sound off";
  playerElements.current.textContent = formatTime(elapsed);
  playerElements.shell.style.setProperty("--wave-progress", audio.progress().toFixed(4));
  lastDisplayedSecond = elapsed;

  $$(".track").forEach((button) => {
    const isActive = Number(button.dataset.track) === audio.activeIndex;
    button.classList.toggle("is-active", isActive);
    if (isActive) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });

  if (drawnWaveformTrack !== audio.activeIndex) {
    drawnWaveformTrack = audio.activeIndex;
    drawWaveform();
  }
  if (audio.playing) startPlaybackTicker();
  else stopPlaybackTicker();
}

const audio = new WinterAudio(updatePlayer);

let storySync = true;
let sceneTrack = 0;
const syncToggle = $("#sync-toggle");

function updateSyncControl() {
  syncToggle.classList.toggle("is-on", storySync);
  syncToggle.setAttribute("aria-pressed", String(storySync));
  $("span", syncToggle).textContent = `Story sync ${storySync ? "on" : "off"}`;
}

async function setManualTrack(index) {
  storySync = false;
  updateSyncControl();
  try {
    await audio.start(index);
  } catch (error) {
    console.error("Audio could not start:", error);
    playerElements.playStatus.textContent = "Audio unavailable";
  }
}

$$(".track").forEach((button) => {
  button.addEventListener("click", () => setManualTrack(Number(button.dataset.track)));
});

playerElements.playButton.addEventListener("click", async () => {
  try {
    await audio.toggle();
  } catch (error) {
    console.error("Audio could not start:", error);
    playerElements.playStatus.textContent = "Audio unavailable";
  }
});

playerElements.soundToggle.addEventListener("click", async () => {
  try {
    await audio.toggle();
  } catch (error) {
    console.error("Audio could not start:", error);
    playerElements.soundLabel.textContent = "Unavailable";
  }
});

$("#volume").addEventListener("input", (event) => audio.setVolume(event.currentTarget.value));

syncToggle.addEventListener("click", () => {
  storySync = !storySync;
  updateSyncControl();
  if (storySync && audio.activeIndex !== sceneTrack) {
    audio.changeTrack(sceneTrack).catch((error) => console.error("Track change failed:", error));
  }
});

const prelude = $("#prelude");
const enterSound = $("#enter-sound");
const enterSilent = $("#enter-silent");
const pageSurfaces = [$("#site-header"), $(".mobile-nav"), $(".chapter-rail"), $("main")].filter(Boolean);
let hasDismissedPrelude = false;

pageSurfaces.forEach((surface) => { surface.inert = true; });
requestAnimationFrame(() => prelude.classList.add("is-ready"));
requestAnimationFrame(() => enterSound.focus({ preventScroll: true }));

async function dismissPrelude(withSound) {
  if (hasDismissedPrelude) return;
  hasDismissedPrelude = true;
  enterSound.disabled = true;
  enterSilent.disabled = true;

  if (withSound) {
    audio.start(sceneTrack).catch((error) => {
      console.error("Audio could not start:", error);
      playerElements.playStatus.textContent = "Audio unavailable";
    });
  }

  document.body.classList.remove("is-locked");
  document.body.classList.add("has-entered");
  pageSurfaces.forEach((surface) => { surface.inert = false; });
  prelude.classList.add("is-leaving");
  window.setTimeout(() => {
    prelude.hidden = true;
    $(".hero .scene-link")?.focus({ preventScroll: true });
  }, 880);
}

enterSound.addEventListener("click", (event) => {
  activateFrost(enterSound, event);
  dismissPrelude(true);
});
enterSilent.addEventListener("click", (event) => {
  activateFrost(enterSilent, event);
  dismissPrelude(false);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !hasDismissedPrelude) dismissPrelude(false);
  if (event.key !== "Tab" || hasDismissedPrelude) return;
  const first = enterSound;
  const last = enterSilent;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

const frostActions = $$(
  ".entry-button, .scene-link, .sound-pill, .play-button, .track, .sync-toggle, .chapter-rail a, .site-mark, .site-nav a, .mobile-nav a, .character-tabs button",
);
const frostActivationTimers = new WeakMap();
const frostActivationFrames = new WeakMap();
let frostDustLayer;
let waveformResponseTimer = 0;
let waveformResponseFrames = [0, 0];

function ensureFrostDustLayer() {
  if (frostDustLayer) return frostDustLayer;
  frostDustLayer = document.createElement("div");
  frostDustLayer.className = "frost-dust-layer";
  frostDustLayer.setAttribute("aria-hidden", "true");
  document.body.append(frostDustLayer);
  return frostDustLayer;
}

function getFrostTone(target) {
  if (target === enterSound) return "warm";
  if (target.matches(".sound-pill, .play-button, .track, .sync-toggle")) return "music";
  return "cold";
}

function getFrostOrigin(target, event) {
  const rect = target.getBoundingClientRect();
  const usesPointerPosition = event.detail !== 0 && Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
  return {
    x: usesPointerPosition ? event.clientX : rect.left + rect.width / 2,
    y: usesPointerPosition ? event.clientY : rect.top + rect.height / 2,
  };
}

function releaseStaticFrost(target, event) {
  const layer = ensureFrostDustLayer();
  const origin = getFrostOrigin(target, event);
  const imprint = document.createElement("span");
  imprint.className = `frost-static-imprint frost-static-imprint--${getFrostTone(target)}`;
  imprint.style.setProperty("--dust-left", `${origin.x}px`);
  imprint.style.setProperty("--dust-top", `${origin.y}px`);
  layer.append(imprint);
  window.setTimeout(() => imprint.remove(), 220);
}

function pulseWaveform() {
  if (waveformResponseTimer) window.clearTimeout(waveformResponseTimer);
  waveformResponseFrames.forEach((frame) => {
    if (frame) window.cancelAnimationFrame(frame);
  });
  waveformResponseFrames = [0, 0];
  playerElements.shell.classList.remove("is-responding");
  waveformResponseFrames[0] = requestAnimationFrame(() => {
    waveformResponseFrames[0] = 0;
    waveformResponseFrames[1] = requestAnimationFrame(() => {
      waveformResponseFrames[1] = 0;
      playerElements.shell.classList.add("is-responding");
    });
  });
  waveformResponseTimer = window.setTimeout(() => {
    playerElements.shell.classList.remove("is-responding");
    waveformResponseTimer = 0;
  }, 620);
}

function releaseFrostDust(target, event) {
  const layer = ensureFrostDustLayer();
  const origin = getFrostOrigin(target, event);
  const originX = origin.x;
  const originY = origin.y;
  const tone = getFrostTone(target);
  const count = tone === "warm"
    ? 10
    : tone === "music"
      ? 8
      : target === enterSilent
        ? 6
        : target.matches(".chapter-rail a, .site-nav a, .mobile-nav a, .site-mark")
          ? 5
          : 7;

  const imprint = document.createElement("span");
  imprint.className = `frost-imprint frost-imprint--${tone}`;
  imprint.style.setProperty("--dust-left", `${originX}px`);
  imprint.style.setProperty("--dust-top", `${originY}px`);
  imprint.addEventListener("animationend", () => imprint.remove(), { once: true });
  layer.append(imprint);
  window.setTimeout(() => imprint.remove(), 900);

  for (let index = 0; index < count; index += 1) {
    const dust = document.createElement("i");
    const carriesWarmth = tone === "warm" || (tone === "music" && index % 3 === 0);
    const size = 1.4 + Math.random() * 2.05;
    const direction = index % 2 === 0 ? -1 : 1;
    const distance = 16 + Math.random() * 28;
    dust.className = "frost-dust";
    dust.style.setProperty("--dust-left", `${originX}px`);
    dust.style.setProperty("--dust-top", `${originY}px`);
    dust.style.setProperty("--dust-size", `${size.toFixed(2)}px`);
    dust.style.setProperty("--dust-x", `${(direction * distance + (Math.random() - 0.5) * 14).toFixed(1)}px`);
    dust.style.setProperty("--dust-y", `${(-14 - Math.random() * 31).toFixed(1)}px`);
    dust.style.setProperty("--dust-duration", `${Math.round(430 + Math.random() * 190)}ms`);
    dust.style.setProperty(
      "--dust-color",
      carriesWarmth ? "rgba(242, 199, 142, 0.96)" : "rgba(239, 247, 255, 0.98)",
    );
    dust.style.setProperty(
      "--dust-haze",
      carriesWarmth ? "rgba(223, 168, 105, 0.4)" : "rgba(190, 219, 248, 0.46)",
    );
    dust.addEventListener("animationend", () => dust.remove(), { once: true });
    layer.append(dust);
    window.setTimeout(() => dust.remove(), 900);
  }
}

function activateFrost(target, event) {
  const previousTimer = frostActivationTimers.get(target);
  const previousFrame = frostActivationFrames.get(target);
  if (previousTimer) window.clearTimeout(previousTimer);
  if (previousFrame) window.cancelAnimationFrame(previousFrame);
  target.classList.remove("is-frost-activating", "is-frost-static");

  if (prefersReducedMotion.matches) {
    releaseStaticFrost(target, event);
    target.classList.add("is-frost-static");
    const timer = window.setTimeout(() => {
      target.classList.remove("is-frost-static");
      frostActivationTimers.delete(target);
    }, 220);
    frostActivationTimers.set(target, timer);
    return;
  }

  releaseFrostDust(target, event);

  if (target.matches(".play-button")) {
    pulseWaveform();
  }

  const resetFrame = requestAnimationFrame(() => {
    const activationFrame = requestAnimationFrame(() => {
      target.classList.add("is-frost-activating");
      frostActivationFrames.delete(target);
      const timer = window.setTimeout(() => {
        target.classList.remove("is-frost-activating");
        frostActivationTimers.delete(target);
      }, 620);
      frostActivationTimers.set(target, timer);
    });
    frostActivationFrames.set(target, activationFrame);
  });
  frostActivationFrames.set(target, resetFrame);
}

frostActions.forEach((action) => {
  if (action === enterSound || action === enterSilent) return;
  action.addEventListener("click", (event) => activateFrost(action, event));
});

const revealTargets = $$('[data-reveal]');
if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -7%" });
  revealTargets.forEach((target) => revealObserver.observe(target));
} else {
  revealTargets.forEach((target) => target.classList.add("is-visible"));
}

const railLinks = $$('[data-rail]');
const sceneSections = $$('[data-scene-track]');

function setSceneTrack(index) {
  sceneTrack = index;
  railLinks.forEach((link) => link.classList.toggle("is-active", Number(link.dataset.rail) === index));
  if (storySync && audio.activeIndex !== index) {
    audio.changeTrack(index).catch((error) => console.error("Track change failed:", error));
  }
}

if ("IntersectionObserver" in window) {
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setSceneTrack(Number(entry.target.dataset.sceneTrack));
    });
  }, { rootMargin: "-43% 0px -43% 0px", threshold: 0 });
  sceneSections.forEach((section) => sceneObserver.observe(section));
}

const navTargets = $$('[data-nav-section]');
const navigationLinks = $$(".site-nav a, .mobile-nav a");
if ("IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.dataset.navSection;
      navigationLinks.forEach((link) => {
        const target = link.getAttribute("href")?.slice(1);
        link.classList.toggle("is-active", target === id);
      });
    });
  }, { rootMargin: "-38% 0px -52% 0px", threshold: 0 });
  navTargets.forEach((section) => navObserver.observe(section));
}

const siteHeader = $("#site-header");
const scrollLine = $(".scroll-line");
let scrollFrame = 0;

function updateScrollState() {
  scrollFrame = 0;
  const scrollTop = window.scrollY;
  const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  siteHeader.classList.toggle("is-condensed", scrollTop > 36);
  scrollLine.style.setProperty("--scroll-progress", (scrollTop / scrollable).toFixed(4));
}

window.addEventListener("scroll", () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(updateScrollState);
}, { passive: true });
updateScrollState();

const characterSection = $("#characters");
const characterButtons = $$("[data-character]");
let activeCharacter = "kazusa";

function setCharacter(name, focusButton = false) {
  if (name === activeCharacter) return;
  const currentProfile = $(`[data-profile="${activeCharacter}"]`);
  const nextProfile = $(`[data-profile="${name}"]`);
  activeCharacter = name;
  characterSection.dataset.characterStage = name;
  currentProfile.classList.add("is-changing");

  window.setTimeout(() => {
    currentProfile.hidden = true;
    currentProfile.classList.remove("is-active", "is-changing");
    nextProfile.hidden = false;
    nextProfile.classList.add("is-changing");
    requestAnimationFrame(() => {
      nextProfile.classList.add("is-active");
      nextProfile.classList.remove("is-changing");
    });
  }, 190);

  characterButtons.forEach((button) => {
    const isActive = button.dataset.character === name;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
    if (isActive && focusButton) button.focus();
  });
}

characterButtons.forEach((button) => {
  button.addEventListener("click", () => setCharacter(button.dataset.character));
  button.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextCharacter = activeCharacter === "kazusa" ? "setsuna" : "kazusa";
    setCharacter(nextCharacter, true);
    const nextButton = characterButtons.find((item) => item.dataset.character === nextCharacter);
    if (nextButton) activateFrost(nextButton, event);
  });
});

const hero = $(".hero");
if (hasFinePointer.matches && !prefersReducedMotion.matches) {
  let heroBounds = null;
  let pointerFrame = 0;
  let pointerEvent = null;

  const updatePointer = () => {
    pointerFrame = 0;
    if (!heroBounds || !pointerEvent) return;
    const x = clamp((pointerEvent.clientX - heroBounds.left) / heroBounds.width - 0.5, -0.5, 0.5);
    const y = clamp((pointerEvent.clientY - heroBounds.top) / heroBounds.height - 0.5, -0.5, 0.5);
    hero.style.setProperty("--hero-shift-x", `${(x * 8).toFixed(2)}px`);
    hero.style.setProperty("--hero-shift-y", `${(y * 5).toFixed(2)}px`);
  };

  hero.addEventListener("pointerenter", () => { heroBounds = hero.getBoundingClientRect(); }, { passive: true });
  hero.addEventListener("pointermove", (event) => {
    pointerEvent = event;
    if (!pointerFrame) pointerFrame = requestAnimationFrame(updatePointer);
  }, { passive: true });
  hero.addEventListener("pointerleave", () => {
    pointerEvent = null;
    hero.style.setProperty("--hero-shift-x", "0px");
    hero.style.setProperty("--hero-shift-y", "0px");
  }, { passive: true });
  window.addEventListener("resize", () => { heroBounds = null; }, { passive: true });
}

class SnowField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.frame = 0;
    this.lastTime = 0;
    this.resizeFrame = 0;
    this.count = 0;
    this.width = 0;
    this.height = 0;
    this.x = new Float32Array(0);
    this.y = new Float32Array(0);
    this.speed = new Float32Array(0);
    this.size = new Float32Array(0);
    this.phase = new Float32Array(0);
    this.depth = new Uint8Array(0);
    this.reduced = prefersReducedMotion.matches;
    this.resize();
    this.bind();
    if (this.reduced) this.drawStatic();
    else this.start();
  }

  bind() {
    window.addEventListener("resize", () => {
      if (this.resizeFrame) return;
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = 0;
        this.resize();
        if (this.reduced) this.drawStatic();
      });
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.stop();
      else if (!this.reduced) this.start();
    });

    prefersReducedMotion.addEventListener?.("change", (event) => {
      this.reduced = event.matches;
      this.stop();
      this.resize();
      if (this.reduced) this.drawStatic();
      else this.start();
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.count = this.reduced ? 20 : this.width < 760 ? 34 : 72;
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.speed = new Float32Array(this.count);
    this.size = new Float32Array(this.count);
    this.phase = new Float32Array(this.count);
    this.depth = new Uint8Array(this.count);

    for (let index = 0; index < this.count; index += 1) {
      const layer = index % 3;
      this.depth[index] = layer;
      this.x[index] = Math.random() * this.width;
      this.y[index] = Math.random() * this.height;
      this.speed[index] = 12 + layer * 9 + Math.random() * 11;
      this.size[index] = 0.7 + layer * 0.45 + Math.random() * 0.65;
      this.phase[index] = Math.random() * Math.PI * 2;
    }
    this.lastTime = performance.now();
  }

  drawStatic() {
    this.context.clearRect(0, 0, this.width, this.height);
    this.paint();
  }

  paint() {
    const colors = ["rgba(223,234,247,.28)", "rgba(230,239,249,.46)", "rgba(245,248,252,.7)"];
    for (let layer = 0; layer < 3; layer += 1) {
      this.context.beginPath();
      for (let index = layer; index < this.count; index += 3) {
        const radius = this.size[index];
        this.context.moveTo(this.x[index] + radius, this.y[index]);
        this.context.arc(this.x[index], this.y[index], radius, 0, Math.PI * 2);
      }
      this.context.fillStyle = colors[layer];
      this.context.fill();
    }
  }

  animate = (time) => {
    const delta = Math.min(0.033, Math.max(0.001, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.context.clearRect(0, 0, this.width, this.height);

    for (let index = 0; index < this.count; index += 1) {
      this.y[index] += this.speed[index] * delta;
      this.x[index] += Math.sin(time * 0.00035 + this.phase[index]) * (0.08 + this.depth[index] * 0.055);
      if (this.y[index] > this.height + 4) {
        this.y[index] = -4;
        this.x[index] = Math.random() * this.width;
      } else if (this.x[index] < -4) {
        this.x[index] = this.width + 4;
      } else if (this.x[index] > this.width + 4) {
        this.x[index] = -4;
      }
    }

    this.paint();
    this.frame = requestAnimationFrame(this.animate);
  };

  start() {
    if (this.frame || document.hidden) return;
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}

new SnowField($("#snow"));

let waveformResizeFrame = 0;
window.addEventListener("resize", () => {
  if (waveformResizeFrame) return;
  waveformResizeFrame = requestAnimationFrame(() => {
    waveformResizeFrame = 0;
    drawWaveform();
  });
}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (!audio.playing) return;
  if (document.hidden) stopPlaybackTicker();
  else startPlaybackTicker();
});

Promise.allSettled(
  $$(".hero__art img").map((image) => image.decode?.() ?? Promise.resolve()),
).then(() => document.body.classList.add("hero-ready"));

updateSyncControl();
updatePlayer();
