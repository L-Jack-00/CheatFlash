/**
 * Virtual Clock Hook Engine (Universal Speedhack & Frame-Stepper Rig)
 * 
 * Intercepts browser timing primitives:
 * - window.performance.now
 * - Date.now
 * - window.requestAnimationFrame / cancelAnimationFrame
 * - window.setTimeout / clearTimeout
 * - window.setInterval / clearInterval
 * 
 * Implements Drift-Free Virtual Time Dilation:
 *   vTime += realDelta * timeScale (when playing)
 *   vTime += stepDelta (when paused & stepping)
 *   vTime += 0 (when paused)
 */

(function (root) {
  'use strict';

  // Store native pristine timing functions
  const nativePerfNow = window.performance.now.bind(window.performance);
  const nativeDateNow = Date.now.bind(Date);
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeCancelRAF = window.cancelAnimationFrame.bind(window);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);

  class VirtualClockEngine {
    constructor() {
      this.timeScale = 1.0;
      this.isPaused = false;

      this.realStartTime = nativePerfNow();
      this.realLastTime = this.realStartTime;

      this.virtualTime = 0.0;
      this.virtualDateOffset = nativeDateNow();

      this.stepPending = false;
      this.stepDelta = 0.0;

      // Listeners for telemetry
      this.listeners = new Set();

      // Active virtual timers
      this.timers = new Map();
      this.intervals = new Map();
      this.timerIdCounter = 1;

      // Active RAF callbacks
      this.rafCallbacks = new Map();
      this.rafIdCounter = 1;

      // Active audio contexts and sources
      this.audioContexts = new Set();
      this.audioNodes = new Set();

      this._isInstalled = false;
      this._nativeHeartbeatId = null;
    }

    _registerAudioContext(ctx) {
      this.audioContexts.add(ctx);
      if (this.isPaused && ctx.state === 'running') {
        try { ctx.suspend(); } catch (e) {}
      }
    }

    _registerAudioSource(node) {
      this.audioNodes.add(node);
      this._applyAudioPlaybackRate(node);
    }

    _applyAudioPlaybackRate(node) {
      try {
        if (node && node.playbackRate && typeof node.playbackRate.setValueAtTime === 'function') {
          node.playbackRate.setValueAtTime(this.timeScale, 0);
        } else if (node && 'playbackRate' in node) {
          node.playbackRate = this.timeScale;
        }
      } catch (e) {}
    }

    _syncAllAudio() {
      // 1. Suspend or Resume AudioContexts
      for (const ctx of this.audioContexts) {
        try {
          if (this.isPaused && ctx.state === 'running') {
            ctx.suspend();
          } else if (!this.isPaused && ctx.state === 'suspended') {
            ctx.resume();
          }
        } catch (e) {}
      }

      // 2. Adjust playbackRate for all active audio sources
      for (const node of this.audioNodes) {
        this._applyAudioPlaybackRate(node);
      }
    }

    install() {
      if (this._isInstalled) return;

      const self = this;

      // 1. Hook performance.now()
      window.performance.now = function () {
        return self.getVirtualTime();
      };

      // 2. Hook Date.now()
      Date.now = function () {
        return Math.floor(self.virtualDateOffset + self.getVirtualTime());
      };

      // 3. Hook requestAnimationFrame
      window.requestAnimationFrame = function (cb) {
        const id = self.rafIdCounter++;
        self.rafCallbacks.set(id, cb);
        return id;
      };

      window.cancelAnimationFrame = function (id) {
        self.rafCallbacks.delete(id);
      };

      // 4. Hook setTimeout & setInterval
      window.setTimeout = function (handler, timeout, ...args) {
        const id = self.timerIdCounter++;
        const delay = Math.max(0, timeout || 0);
        const targetVTime = self.virtualTime + delay;
        self.timers.set(id, {
          handler,
          targetVTime,
          args
        });
        return id;
      };

      window.clearTimeout = function (id) {
        self.timers.delete(id);
      };

      window.setInterval = function (handler, interval, ...args) {
        const id = self.timerIdCounter++;
        const period = Math.max(1, interval || 0);
        self.intervals.set(id, {
          handler,
          period,
          nextVTime: self.virtualTime + period,
          args
        });
        return id;
      };

      window.clearInterval = function (id) {
        self.intervals.delete(id);
      };

      // 5. Hook Web Audio API (AudioContext & webkitAudioContext)
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        const OrigAudioCtx = AudioCtxClass;
        window.AudioContext = function (...args) {
          const ctx = new OrigAudioCtx(...args);
          self._registerAudioContext(ctx);

          // Hook createBufferSource
          const origCreateBufferSource = ctx.createBufferSource.bind(ctx);
          ctx.createBufferSource = function (...sArgs) {
            const source = origCreateBufferSource(...sArgs);
            self._registerAudioSource(source);
            return source;
          };

          return ctx;
        };
        window.AudioContext.prototype = OrigAudioCtx.prototype;
        if (window.webkitAudioContext) {
          window.webkitAudioContext = window.AudioContext;
        }
      }

      // 6. Hook HTMLMediaElement playbackRate (Audio/Video tags)
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...pArgs) {
        self._registerAudioSource(this);
        return origPlay.apply(this, pArgs);
      };

      // 7. Hook WebAssembly.Memory & Instance (True Ruffle Memory Rig)
      if (window.WebAssembly) {
        window._capturedWasmMemories = window._capturedWasmMemories || new Set();
        const origWasmMemory = window.WebAssembly.Memory;
        window.WebAssembly.Memory = function (descriptor) {
          const mem = new origWasmMemory(descriptor);
          window._capturedWasmMemories.add(mem);
          console.log('[WasmHook] Captured WebAssembly.Memory instance via constructor:', mem);
          return mem;
        };
        window.WebAssembly.Memory.prototype = origWasmMemory.prototype;

        // Hook Memory.prototype.grow to detect heap expansion and invalidate detached buffers
        const origGrow = origWasmMemory.prototype.grow;
        if (origGrow) {
          origWasmMemory.prototype.grow = function (...gArgs) {
            const oldBytes = this.buffer ? this.buffer.byteLength : 0;
            const res = origGrow.apply(this, gArgs);
            const newBytes = this.buffer ? this.buffer.byteLength : 0;
            console.log(`[WasmHook] 📈 WebAssembly memory expanded (grow): ${(oldBytes / (1024 * 1024)).toFixed(1)}MB -> ${(newBytes / (1024 * 1024)).toFixed(1)}MB`);
            if (window._capturedWasmMemories) {
              window._capturedWasmMemories.add(this);
            }
            if (window.Harness && typeof window.Harness.onWasmMemoryGrown === 'function') {
              try {
                window.Harness.onWasmMemoryGrown(this, oldBytes, newBytes);
              } catch (e) {}
            }
            return res;
          };
        }

        const origInstantiate = window.WebAssembly.instantiate;
        window.WebAssembly.instantiate = async function (...args) {
          const res = await origInstantiate.apply(this, args);
          try {
            const instance = res.instance || res;
            if (instance && instance.exports) {
              for (const key in instance.exports) {
                if (instance.exports[key] instanceof origWasmMemory) {
                  window._capturedWasmMemories.add(instance.exports[key]);
                  console.log(`[WasmHook] Captured exported memory [${key}]:`, instance.exports[key]);
                }
              }
            }
          } catch (e) {}
          return res;
        };

        if (window.WebAssembly.instantiateStreaming) {
          const origInstantiateStreaming = window.WebAssembly.instantiateStreaming;
          window.WebAssembly.instantiateStreaming = async function (...args) {
            const res = await origInstantiateStreaming.apply(this, args);
            try {
              const instance = res.instance || res;
              if (instance && instance.exports) {
                for (const key in instance.exports) {
                  if (instance.exports[key] instanceof origWasmMemory) {
                    window._capturedWasmMemories.add(instance.exports[key]);
                    console.log(`[WasmHook] Captured streaming exported memory [${key}]:`, instance.exports[key]);
                  }
                }
              }
            } catch (e) {}
            return res;
          };
        }
      }

      // Start internal high-precision native supervisor loop
      this._startNativeHeartbeat();
      this._isInstalled = true;
    }

    _startNativeHeartbeat() {
      const loop = () => {
        this._updateTick();
        this._nativeHeartbeatId = nativeRAF(loop);
      };
      this._nativeHeartbeatId = nativeRAF(loop);
    }

    _updateTick() {
      const now = nativePerfNow();
      const realDelta = now - this.realLastTime;
      this.realLastTime = now;

      let vDelta = 0;

      if (!this.isPaused) {
        vDelta = realDelta * this.timeScale;
      } else if (this.stepPending) {
        vDelta = this.stepDelta;
        this.stepPending = false;
        this.stepDelta = 0;
      }

      this.virtualTime += vDelta;

      // Process Virtual Timers
      if (vDelta > 0) {
        this._processVirtualTimers();
        this._processVirtualIntervals();
      }

      // Flush RAF callbacks with current virtual time
      if (!this.isPaused || vDelta > 0) {
        this._flushRAF(this.virtualTime);
      }

      this._notifyListeners({
        realTime: now,
        virtualTime: this.virtualTime,
        timeScale: this.timeScale,
        isPaused: this.isPaused,
        fps: realDelta > 0 ? (1000 / realDelta) : 60
      });
    }

    _processVirtualTimers() {
      for (const [id, timer] of Array.from(this.timers.entries())) {
        if (this.virtualTime >= timer.targetVTime) {
          this.timers.delete(id);
          try {
            if (typeof timer.handler === 'function') {
              timer.handler(...timer.args);
            } else {
              (new Function(timer.handler))();
            }
          } catch (e) {
            console.error('[VirtualClock] Timer exception:', e);
          }
        }
      }
    }

    _processVirtualIntervals() {
      for (const [id, interval] of Array.from(this.intervals.entries())) {
        if (this.virtualTime >= interval.nextVTime) {
          interval.nextVTime += interval.period;
          try {
            if (typeof interval.handler === 'function') {
              interval.handler(...interval.args);
            } else {
              (new Function(interval.handler))();
            }
          } catch (e) {
            console.error('[VirtualClock] Interval exception:', e);
          }
        }
      }
    }

    _flushRAF(vTime) {
      if (this.rafCallbacks.size === 0) return;
      const callbacks = Array.from(this.rafCallbacks.entries());
      this.rafCallbacks.clear();

      for (const [id, cb] of callbacks) {
        try {
          cb(vTime);
        } catch (e) {
          console.error('[VirtualClock] RAF exception:', e);
        }
      }
    }

    getVirtualTime() {
      return this.virtualTime;
    }

    setTimeScale(scale) {
      this.timeScale = Math.max(0.01, Math.min(50.0, scale));
      this._syncAllAudio();
    }

    pause() {
      this.isPaused = true;
      this._syncAllAudio();
    }

    resume() {
      this.isPaused = false;
      this.realLastTime = nativePerfNow(); // Avoid sudden leap on resume
      this._syncAllAudio();
    }

    togglePause() {
      if (this.isPaused) {
        this.resume();
      } else {
        this.pause();
      }
      return this.isPaused;
    }

    stepFrame(ms = 16.666) {
      this.isPaused = true;
      this.stepPending = true;
      this.stepDelta = ms;
      this._syncAllAudio();
    }

    addListener(fn) {
      this.listeners.add(fn);
    }

    removeListener(fn) {
      this.listeners.delete(fn);
    }

    _notifyListeners(data) {
      for (const listener of this.listeners) {
        try {
          listener(data);
        } catch (e) {
          // ignore listener errors
        }
      }
    }
  }

  // Export singleton instance
  root.VirtualClock = new VirtualClockEngine();
})(window);
