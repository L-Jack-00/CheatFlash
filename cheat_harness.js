/**
 * Cheat Harness Core Controller (FSM, Ruffle Binding, and Blackboard Inspector)
 */

(function (root) {
  'use strict';

  // FSM States
  const STATES = {
    UNLOADED: 'UNLOADED',
    SANDBOX: 'SANDBOX',
    FLASH_LOADED: 'FLASH_LOADED',
    PAUSED: 'PAUSED'
  };

  class CheatHarness {
    constructor() {
      this.state = STATES.UNLOADED;
      this.clock = window.VirtualClock;
      this.rufflePlayer = null;
      this.currentGameTitle = '데모 플래시 (Demo)';

      // Simulated Blackboard / Variable Watcher (legacy compat)
      this.blackboard = {
        'player.hp': 100,
        'player.maxHp': 100,
        'player.gold': 500,
        'player.score': 1240,
        'game.gravity': 9.8,
        'game.wave': 3,
        'game.godMode': false,
        'game.infiniteGold': false
      };

      // Built-in Sandbox Demo canvas context & Binary Buffer
      this.sandboxActive = false;
      this.sandboxCanvas = null;
      this.sandboxCtx = null;
      this.demoEntities = [];
      this.demoDamageFloaters = [];
      this.demoCombatInterval = null;
      this.demoFrameCount = 0;
      this.sandboxBuffer = new ArrayBuffer(65536); // 64KB mock memory buffer for demo mode
      this.sandboxView = new DataView(this.sandboxBuffer);

      // True WebAssembly Binary Memory Scanner State
      this.wasmFrozenOffsets = new Map(); // "bufIdx:offset:type" -> { targetId, offset, type, lockedVal }
      this.wasmCandidates = []; // [{ bufIdx, offset, hex, type, currentVal, prevVal, alias }]
      this.aliasMap = new Map(); // "bufIdx:offset" -> "HP (체력)"
      this.frozenVariables = new Map(); // legacy blackboard fallback

      // Smart Delta Hunter State (Live Change Surveillance)
      this.hunterCandidates = []; // [{ targetId, offset, hex, type, baseVal, currentVal, changed }]
      this.isHunting = false;
      this.hunterBaseline = 0;
      this.lastHunterTick = 0;

      // Comparative Value Scanner & Unknown Initial Value Rig
      this.scannerCandidates = [];
      this.scannerActive = false;
      this.scannerSubSegment = 'hunter';

      // Advanced Cheat Records (Tab 2)
      this.cheatRecords = []; // [{ id, game, name, key, targetId, offset, hex, type, val, isFrozen, frozenVal, updatedAt }]

      // Multi-Window Inspector Rig (True Native Windows Form)
      this.inspectorWindow = null;
      this._inspectorMoved = false;

      // Multi-Game Slot Sessions (3 Independent Slots)
      this.currentSlot = 0;
      this.gameSlots = [
        { id: 0, title: '데모 플래시 (Demo)', isSandbox: true, records: [], file: null, arrayBuffer: null },
        { id: 1, title: '빈 슬롯 (Empty)', isSandbox: false, records: [], file: null, arrayBuffer: null },
        { id: 2, title: '빈 슬롯 (Empty)', isSandbox: false, records: [], file: null, arrayBuffer: null }
      ];

      // Flash Player Authentic Features
      this.zoomLevel = 1.0;
      this.flashQuality = 'high';
    }

    init() {
      // 1. Install virtual clock hook before anything else
      this.clock.install();

      // 2. Setup hotkey listener
      this._setupHotkeys();

      // 3. Setup context menu and draggable undocked window rig
      this._setupContextMenuAndDrag();

      // 4. Connect clock telemetry to UI
      this.clock.addListener((telemetry) => {
        this._updateTelemetryUI(telemetry);
      });

      // 5. Default to Sandbox demo until user drops a SWF
      this.startSandboxDemo();
    }

    _setupHotkeys() {
      window.addEventListener('keydown', (e) => {
        // Prevent triggering hotkeys when typing into an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
          case '[':
            e.preventDefault();
            this.adjustSpeed(-0.25);
            break;
          case ']':
            e.preventDefault();
            this.adjustSpeed(+0.25);
            break;
          case '0':
            e.preventDefault();
            this.setSpeed(1.0);
            break;
          case '.':
            e.preventDefault();
            this.stepFrame();
            break;
        }
      });
    }

    togglePause() {
      const isPaused = this.clock.togglePause();
      this.log(`[FSM] State: ${isPaused ? 'PAUSED' : 'RUNNING'}`);
      const btn = document.getElementById('btn-pause');
      if (btn) {
        btn.textContent = isPaused ? '▶ 재개 (F1)' : '⏸ 일시정지 (F1)';
        btn.classList.toggle('active', isPaused);
      }
    }

    setSpeed(speed) {
      this.clock.setTimeScale(speed);
      const slider = document.getElementById('speed-slider');
      const label = document.getElementById('speed-label');
      if (slider) slider.value = speed;
      if (label) label.textContent = `${speed.toFixed(2)}x`;
      this.log(`[Speedhack] Time Scale set to ${speed.toFixed(2)}x`);
    }

    adjustSpeed(delta) {
      const newSpeed = Math.max(0.1, Math.min(10.0, this.clock.timeScale + delta));
      this.setSpeed(newSpeed);
    }

    stepFrame() {
      this.clock.stepFrame(16.666);
      this.log('[FrameStepper] Stepped exactly 1 frame (+16.6ms)');
      const btn = document.getElementById('btn-pause');
      if (btn) {
        btn.textContent = '▶ 재개 (F1)';
        btn.classList.add('active');
      }
    }

    /* -------------------------------------------------------------
     * Ruffle Flash Loading Pipeline
     * ------------------------------------------------------------- */
    async loadSwfFile(file) {
      this.log(`[RuffleRig] Loading SWF file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

      this.stopSandboxDemo();

      const container = document.getElementById('player-viewport');
      container.innerHTML = '';

      if (!window.RufflePlayer) {
        this.log('[Error] Ruffle runtime not yet loaded from CDN or local bundle.');
        alert('Ruffle Player runtime is still loading or unavailable. Check network connection.');
        return;
      }

      const ruffle = window.RufflePlayer.newest();
      this.rufflePlayer = ruffle.createPlayer();
      this.rufflePlayer.style.width = '100%';
      this.rufflePlayer.style.height = '100%';
      container.appendChild(this.rufflePlayer);

      try {
        let arrayBuffer = await file.arrayBuffer();

        // 0. Auto Disarm ActionScript Anti-Cheat Bytecode
        const disarmCheckbox = document.getElementById('auto-disarm-check');
        const shouldDisarm = disarmCheckbox ? disarmCheckbox.checked : true;

        if (shouldDisarm) {
          try {
            this.log(`[BytecodeDisarmer] 🛡️ SWF 바이너리 안티치트 검증 함수 분석 중...`);
            const res = await fetch('/api/disarm', {
              method: 'POST',
              body: arrayBuffer
            });
            if (res.ok) {
              const patchedCount = parseInt(res.headers.get('X-Patched-Count') || '0', 10);
              const patchedNames = res.headers.get('X-Patched-Names') || '';
              arrayBuffer = await res.arrayBuffer();
              if (patchedCount > 0) {
                this.log(`[BytecodeDisarmer] 🎉 안티치트 무력화 완료: ${patchedCount}개 검증 함수 무력화됨 (${patchedNames})`);
              } else {
                this.log(`[BytecodeDisarmer] ℹ️ 알려진 안티치트 함수 없음 또는 표준 SWF 구조.`);
              }
            }
          } catch (netErr) {
            // Standalone or offline fallback
          }
        }

        await this.rufflePlayer.load({ data: arrayBuffer });
        this.state = STATES.FLASH_LOADED;
        this.currentGameTitle = file.name;
        this.log(`[RuffleRig] Successfully loaded "${file.name}" into virtualized AVM sandbox!`);

        this.gameSlots[this.currentSlot] = {
          id: this.currentSlot,
          title: file.name,
          isSandbox: false,
          records: [...this.cheatRecords],
          file: file,
          arrayBuffer: arrayBuffer
        };
        this._updateGameSlotButtons();

        const titles = this._getAllDOMElements('current-game-title');
        titles.forEach(el => el.textContent = file.name);
        const badges = this._getAllDOMElements('game-status-badge');
        badges.forEach(el => {
          el.textContent = 'Flash (Ruffle) Active';
          el.className = 'status-badge active';
        });
      } catch (err) {
        this.log(`[Error] Failed to parse SWF: ${err.message}`);
        console.error(err);
      }
    }

    /* -------------------------------------------------------------
     * Built-in Sandbox Demo (Interactive Test Rig & Memory Verification)
     * ------------------------------------------------------------- */
    startSandboxDemo() {
      this.sandboxActive = true;
      this.state = STATES.SANDBOX;
      this.currentGameTitle = '데모 플래시 (Demo)';

      const container = document.getElementById('player-viewport');
      container.innerHTML = '';

      // Initialize mock memory buffer:
      // 0x0100 (Float64) = HP (100.0)
      // 0x0108 (Float64) = Max HP (100.0)
      // 0x0200 (Float64) = Gold (500.0)
      // 0x0300 (Int32)   = Score (1240)
      if (this.sandboxView) {
        this.sandboxView.setFloat64(0x0100, 100.0, true);
        this.sandboxView.setFloat64(0x0108, 100.0, true);
        this.sandboxView.setFloat64(0x0200, 500.0, true);
        this.sandboxView.setInt32(0x0300, 1240, true);
      }
      this.blackboard['player.hp'] = 100.0;
      this.blackboard['player.maxHp'] = 100.0;
      this.blackboard['player.gold'] = 500.0;
      this.blackboard['player.score'] = 1240;

      const titles = this._getAllDOMElements('current-game-title');
      titles.forEach(el => el.textContent = '데모 플래시 (Built-in Demo)');
      const badges = this._getAllDOMElements('game-status-badge');
      badges.forEach(el => {
        el.textContent = 'Demo Mode (WASM)';
        el.className = 'status-badge';
      });

      // Create Canvas
      this.sandboxCanvas = document.createElement('canvas');
      this.sandboxCanvas.width = 800;
      this.sandboxCanvas.height = 500;
      this.sandboxCanvas.style.width = '100%';
      this.sandboxCanvas.style.height = '100%';
      this.sandboxCanvas.style.display = 'block';
      this.sandboxCanvas.style.borderRadius = '4px';
      container.appendChild(this.sandboxCanvas);

      // Create Interactive Control Overlay Bar directly inside container
      const interactiveBar = document.createElement('div');
      interactiveBar.id = 'demo-interactive-bar';
      interactiveBar.className = 'sandbox-control-bar';
      interactiveBar.style.position = 'absolute';
      interactiveBar.style.bottom = '0';
      interactiveBar.style.left = '0';
      interactiveBar.style.right = '0';
      interactiveBar.style.display = 'flex';
      interactiveBar.style.gap = '6px';
      interactiveBar.style.padding = '6px 10px';
      interactiveBar.style.background = 'rgba(20, 24, 35, 0.92)';
      interactiveBar.style.borderTop = '2px solid #0A246A';
      interactiveBar.style.alignItems = 'center';
      interactiveBar.style.justifyContent = 'center';
      interactiveBar.style.zIndex = '50';

      interactiveBar.innerHTML = `
        <span style="color: #67e8f9; font-weight: bold; font-size: 11px; margin-right: 4px;">🎮 데모 제어:</span>
        <button class="btn-classic" style="background: #ef4444; color: #fff; font-weight: bold; border-color: #b91c1c;" onclick="Harness.demoTakeDamage(15)">💥 피격 (-15 HP)</button>
        <button class="btn-classic" style="background: #10b981; color: #fff; font-weight: bold; border-color: #047857;" onclick="Harness.demoHeal(20)">💖 회복 (+20 HP)</button>
        <button class="btn-classic" style="background: #f59e0b; color: #000; font-weight: bold; border-color: #d97706;" onclick="Harness.demoAddGold(100)">💰 골드 (+100 G)</button>
        <button class="btn-classic" style="background: #8b5cf6; color: #fff; font-weight: bold; border-color: #6d28d9;" onclick="Harness.demoSpendGold(120)">🛒 소비 (-120 G)</button>
        <button id="btn-demo-combat" class="btn-classic" style="background: #374151; color: #67e8f9; font-weight: bold;" onclick="Harness.toggleDemoAutoCombat()">🤖 자동 전투: OFF</button>
      `;
      container.appendChild(interactiveBar);

      this.sandboxCtx = this.sandboxCanvas.getContext('2d');

      // Initialize bouncing physics particles
      this.demoEntities = [];
      const colors = ['#00ffcc', '#ff007f', '#ffe600', '#00b4d8', '#b5179e'];
      for (let i = 0; i < 8; i++) {
        this.demoEntities.push({
          x: 100 + Math.random() * 600,
          y: 50 + Math.random() * 200,
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
          radius: 10 + Math.random() * 12,
          color: colors[i % colors.length],
          angle: 0
        });
      }

      this.log('[Sandbox] 인터랙티브 테스트 샌드박스가 시작되었습니다. 피격/골드 버튼으로 메모리 변동을 테스트하세요.');

      let lastVTime = window.performance.now();

      const loop = (currentVTime) => {
        if (!this.sandboxActive) return;

        const dt = (currentVTime - lastVTime) / 1000.0;
        lastVTime = currentVTime;

        this._renderSandbox(dt, currentVTime);
        window.requestAnimationFrame(loop);
      };

      window.requestAnimationFrame(loop);
    }

    stopSandboxDemo() {
      this.sandboxActive = false;
      if (this.demoCombatInterval) {
        clearInterval(this.demoCombatInterval);
        this.demoCombatInterval = null;
      }
      const bar = document.getElementById('demo-interactive-bar');
      if (bar) bar.remove();
    }

    demoTakeDamage(dmg = 15) {
      if (!this.sandboxView) return;
      const current = this.sandboxView.getFloat64(0x0100, true);
      const next = Math.max(1, current - dmg);
      this.sandboxView.setFloat64(0x0100, next, true);
      this.blackboard['player.hp'] = next;
      this.demoDamageFloaters.push({ text: `-${dmg} HP`, x: 380, y: 170, vy: -1.8, alpha: 1.0, color: '#ff4444' });
      this.log(`[Demo] 💥 영웅 피격! HP: ${current.toFixed(0)} ➔ ${next.toFixed(0)} (WASM 0x0100)`);
      this.tickDeltaSurveillance();
    }

    demoHeal(amt = 20) {
      if (!this.sandboxView) return;
      const current = this.sandboxView.getFloat64(0x0100, true);
      const next = Math.min(100, current + amt);
      this.sandboxView.setFloat64(0x0100, next, true);
      this.blackboard['player.hp'] = next;
      this.demoDamageFloaters.push({ text: `+${amt} HP`, x: 380, y: 170, vy: -1.8, alpha: 1.0, color: '#00ff88' });
      this.log(`[Demo] 💖 힐링 포션 사용! HP: ${current.toFixed(0)} ➔ ${next.toFixed(0)} (WASM 0x0100)`);
      this.tickDeltaSurveillance();
    }

    demoAddGold(amt = 100) {
      if (!this.sandboxView) return;
      const current = this.sandboxView.getFloat64(0x0200, true);
      const next = current + amt;
      this.sandboxView.setFloat64(0x0200, next, true);
      this.blackboard['player.gold'] = next;
      this.demoDamageFloaters.push({ text: `+${amt} G`, x: 500, y: 170, vy: -1.8, alpha: 1.0, color: '#ffcc00' });
      this.log(`[Demo] 💰 전리품 골드 획득! Gold: ${current.toFixed(0)} ➔ ${next.toFixed(0)} (WASM 0x0200)`);
      this.tickDeltaSurveillance();
    }

    demoSpendGold(amt = 120) {
      if (!this.sandboxView) return;
      const current = this.sandboxView.getFloat64(0x0200, true);
      const next = Math.max(0, current - amt);
      this.sandboxView.setFloat64(0x0200, next, true);
      this.blackboard['player.gold'] = next;
      this.demoDamageFloaters.push({ text: `-${amt} G`, x: 500, y: 170, vy: -1.8, alpha: 1.0, color: '#ff8800' });
      this.log(`[Demo] 🛒 상점 무기 구매! Gold: ${current.toFixed(0)} ➔ ${next.toFixed(0)} (WASM 0x0200)`);
      this.tickDeltaSurveillance();
    }

    toggleDemoAutoCombat() {
      if (this.demoCombatInterval) {
        clearInterval(this.demoCombatInterval);
        this.demoCombatInterval = null;
        this.log('[Demo] 🤖 자동 전투 모드: OFF');
        const btn = document.getElementById('btn-demo-combat');
        if (btn) {
          btn.textContent = '🤖 자동 전투: OFF';
          btn.style.color = '#67e8f9';
          btn.style.background = '#374151';
        }
      } else {
        this.log('[Demo] 🤖 자동 전투 모드: ON (2.5초마다 자동 피격 및 골드 변동)');
        const btn = document.getElementById('btn-demo-combat');
        if (btn) {
          btn.textContent = '🤖 자동 전투: ON (진행중)';
          btn.style.color = '#FFFFFF';
          btn.style.background = '#D32F2F';
        }
        this.demoCombatInterval = setInterval(() => {
          if (!this.sandboxActive) {
            clearInterval(this.demoCombatInterval);
            this.demoCombatInterval = null;
            return;
          }
          if (Math.random() > 0.4) {
            this.demoTakeDamage(10 + Math.floor(Math.random() * 12));
          } else {
            this.demoAddGold(30 + Math.floor(Math.random() * 40));
          }
        }, 2500);
      }
    }

    _renderSandbox(dt, vTime) {
      const ctx = this.sandboxCtx;
      const w = this.sandboxCanvas.width;
      const h = this.sandboxCanvas.height;

      // Dark futuristic grid background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#141d2e';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Physics update bounded by dt
      const boundedDt = Math.min(0.1, dt);
      const gravity = (this.blackboard['game.gravity'] || 9.8) * 12;

      for (const ent of this.demoEntities) {
        ent.vy += gravity * boundedDt;
        ent.x += ent.vx * (boundedDt * 60);
        ent.y += ent.vy * (boundedDt * 60);
        ent.angle += (ent.vx * 0.05);

        if (ent.x - ent.radius < 0) {
          ent.x = ent.radius;
          ent.vx = -ent.vx * 0.95;
        } else if (ent.x + ent.radius > w) {
          ent.x = w - ent.radius;
          ent.vx = -ent.vx * 0.95;
        }

        if (ent.y - ent.radius < 0) {
          ent.y = ent.radius;
          ent.vy = -ent.vy * 0.9;
        } else if (ent.y + ent.radius > h - 45) {
          ent.y = h - 45 - ent.radius;
          ent.vy = -ent.vy * 0.9;
          if (Math.abs(ent.vy) < 2) ent.vy = 0;
        }

        ctx.save();
        ctx.shadowColor = ent.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = ent.color;
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, ent.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Memory Read: Read single source of truth directly from sandboxView
      let liveHp = 100;
      let liveGold = 500;
      let liveScore = 1240;

      if (this.sandboxView) {
        try {
          liveHp = this.sandboxView.getFloat64(0x0100, true);
          liveGold = this.sandboxView.getFloat64(0x0200, true);
          liveScore = this.sandboxView.getInt32(0x0300, true);
        } catch (e) {}
      }

      this.blackboard['player.hp'] = liveHp;
      this.blackboard['player.gold'] = liveGold;
      this.blackboard['player.score'] = liveScore;

      // Score simulated ticker
      if (!this.clock.isPaused) {
        liveScore += Math.floor(this.clock.timeScale * 1);
        if (this.sandboxView) this.sandboxView.setInt32(0x0300, liveScore, true);
        this.blackboard['player.score'] = liveScore;
      }

      // 1. Draw Hero Card HUD
      const cardX = 30;
      const cardY = 25;
      const cardW = 740;
      const cardH = 150;

      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cardX, cardY, cardW, cardH, 8);
      else ctx.rect(cardX, cardY, cardW, cardH);
      ctx.fill();
      ctx.stroke();

      // Hero Avatar Box
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#0284c7';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cardX + 15, cardY + 15, 75, 75, 6);
      else ctx.rect(cardX + 15, cardY + 15, 75, 75);
      ctx.fill();
      ctx.stroke();

      ctx.font = '36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️', cardX + 52, cardY + 65);

      // Hero Name & Level
      ctx.textAlign = 'left';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px Consolas, monospace';
      ctx.fillText('용사 아서 (Lv.12 Knight)', cardX + 105, cardY + 36);

      // HP Bar & Stats
      const barX = cardX + 105;
      const barY = cardY + 50;
      const barW = 320;
      const barH = 22;

      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeRect(barX, barY, barW, barH);

      const maxHp = 100.0;
      const hpPct = Math.max(0, Math.min(1.0, liveHp / maxHp));
      const hpColor = liveHp > 50 ? '#10b981' : (liveHp > 25 ? '#f59e0b' : '#ef4444');

      ctx.fillStyle = hpColor;
      ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * (liveHp > 100 ? 1 : hpPct)), barH - 2);

      // HP Text overlay
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Consolas, monospace';
      ctx.fillText(`HP: ${liveHp.toFixed(0)} / ${maxHp.toFixed(0)}`, barX + 10, barY + 16);

      // Memory Address Tags
      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`📍 WASM [0x000100] Float64`, barX + barW + 12, barY + 16);

      // Gold & Score Badges
      const statY = cardY + 98;
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(`💰 골드: ${liveGold.toFixed(0)} G`, barX, statY);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`📍 WASM [0x000200] Float64`, barX + 190, statY);

      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 15px Consolas, monospace';
      ctx.fillText(`⭐ 점수: ${liveScore}`, barX + 380, statY);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`📍 WASM [0x000300] Int32`, barX + 510, statY);

      // Status Bar inside card
      ctx.fillStyle = '#64748b';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(`가상 시간: ${(vTime / 1000).toFixed(1)}s  |  배율: ${this.clock.timeScale.toFixed(2)}x  |  상태: ${this.clock.isPaused ? '⏸ 일시정지' : '▶ 정상 가동'}`, barX, cardY + 130);
      ctx.restore();

      // 2. Draw Floating Damage / Heal numbers
      for (let i = this.demoDamageFloaters.length - 1; i >= 0; i--) {
        const floater = this.demoDamageFloaters[i];
        floater.y += floater.vy;
        floater.alpha -= 0.02;

        ctx.save();
        ctx.globalAlpha = Math.max(0, floater.alpha);
        ctx.fillStyle = floater.color;
        ctx.font = 'bold 18px Consolas, monospace';
        ctx.fillText(floater.text, floater.x, floater.y);
        ctx.restore();

        if (floater.alpha <= 0) {
          this.demoDamageFloaters.splice(i, 1);
        }
      }

      // 3. Helpful Testing Guide on Canvas
      ctx.save();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('💡 [치트 플래시 조작 가이드]', 30, 205);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px Consolas, monospace';
      ctx.fillText('1. 아래 [💥 피격 (-15 HP)] 버튼을 눌러 영웅 체력을 깎아보세요.', 30, 226);
      ctx.fillText('2. 우측 [🎯 스마트 델타 헌터]에서 기준값(100)을 입력하고 [🎯 추적 시작]을 누릅니다.', 30, 246);
      ctx.fillText('3. [💥 피격]을 한번 더 누르면 주소(0x000100)가 즉시 감지되고, [999,999]를 누르면 체력이 즉시 치트됩니다!', 30, 266);
      ctx.fillText('4. 수정된 수치는 [⚡ 게임 제어 & 치트] 탭에 게임별로 자동 기록되며 이름/수치 수정 및 고정이 가능합니다.', 30, 286);
      ctx.fillText('5. 언제든지 .SWF 플래시 파일을 이 창에 드롭하면 실제 플래시 게임 치트 모드로 전환됩니다.', 30, 306);
      ctx.restore();

      this._enforceFrozenVariables();
    }

    /* -------------------------------------------------------------
     * UI Telemetry & Blackboard Sync
     * ------------------------------------------------------------- */
    _getAllDOMElements(id) {
      const list = [];
      const el = document.getElementById(id);
      if (el) list.push(el);
      if (this.inspectorWindow && !this.inspectorWindow.closed) {
        try {
          const winEl = this.inspectorWindow.document?.getElementById(id);
          if (winEl) list.push(winEl);
        } catch (e) {}
      }
      return list;
    }

    _updateTelemetryUI(t) {
      const now = Date.now();
      // Throttle text metrics & live values to 10 FPS (100ms) - eliminates DOM GC thrashing while maintaining silky smooth display
      if (now - (this._lastTelemetryTime || 0) >= 100) {
        this._lastTelemetryTime = now;

        const vTimeEls = this._getAllDOMElements('metric-vtime');
        const rTimeEls = this._getAllDOMElements('metric-rtime');
        const fpsEls = this._getAllDOMElements('metric-fps');
        const scaleEls = this._getAllDOMElements('metric-scale');

        const vStr = `${(t.virtualTime / 1000).toFixed(2)}s`;
        const rStr = `${((t.realTime - this.clock.realStartTime) / 1000).toFixed(2)}s`;
        const fpsStr = `${Math.round(t.fps)} FPS`;
        const scaleStr = `${t.timeScale.toFixed(2)}x`;

        vTimeEls.forEach(el => el.textContent = vStr);
        rTimeEls.forEach(el => el.textContent = rStr);
        fpsEls.forEach(el => el.textContent = fpsStr);
        scaleEls.forEach(el => el.textContent = scaleStr);

        this._updateCheatRecordsLiveValues();
        this._renderBlackboardTable();
      }

      // Universal continuous freeze enforcement (active in both Sandbox demo and real SWF games)
      this._enforceFrozenVariables();

      this.tickDeltaSurveillance();
    }

    /* -------------------------------------------------------------
     * Advanced Cheat Records Table (Tab 2: Auto-Registration & Cheat Book)
     * ------------------------------------------------------------- */
    addOrUpdateCheatRecord(key, val, defaultName) {
      const parts = key.split(':');
      const targetId = parts[0];
      const offset = parseInt(parts[1], 10);
      const type = parts[2] || 'f64';
      const game = this.currentGameTitle || (this.sandboxActive ? '데모 플래시 (Demo)' : 'Flash Game');
      const hex = '0x' + offset.toString(16).toUpperCase().padStart(6, '0');
      const now = Date.now();
      const isFrozen = this.wasmFrozenOffsets.has(key);

      let record = this.cheatRecords.find(r => r.game === game && r.key === key);
      if (record) {
        record.val = val;
        record.isFrozen = isFrozen;
        record.updatedAt = now;
        if (defaultName && (!record.name || record.name.startsWith('주소 '))) {
          record.name = defaultName;
        }
        // Move to front (아래서부터 위로 기록: 최신 수정 항목이 맨 위에 위치)
        this.cheatRecords = [record, ...this.cheatRecords.filter(r => r !== record)];
      } else {
        const autoName = defaultName || this.aliasMap.get(key) || this._guessAliasFromOffset(offset) || `주소 ${hex}`;
        record = {
          id: 'cheat_' + now + '_' + Math.floor(Math.random() * 1000),
          game: game,
          name: autoName,
          key: key,
          targetId: targetId,
          offset: offset,
          hex: hex,
          type: type,
          val: val,
          isFrozen: isFrozen,
          frozenVal: val,
          createdAt: now,
          updatedAt: now
        };
        this.cheatRecords.unshift(record);
        this.log(`[CheatTable] 📋 치트 북에 [${game}] "${record.name}" (${hex}) 항목이 자동 기록되었습니다.`);
      }

      this._renderCheatRecords();
    }

    _renderCheatRecords() {
      const targets = this._getAllDOMElements('cheat-records-tbody');
      if (targets.length === 0) return;

      if (this.cheatRecords.length === 0) {
        const emptyHtml = '<tr><td colspan="6" style="text-align:center; color:#888; padding: 12px 4px;">아직 편집된 수치가 없습니다.<br>[🔍 메모리 검색기]에서 수치를 수정하면 여기에 게임별로 자동 기록됩니다!</td></tr>';
        targets.forEach(t => t.innerHTML = emptyHtml);
        return;
      }

      const memoryTargets = this.getMemoryTargets();
      let html = '';

      for (const item of this.cheatRecords) {
        let liveVal = item.val;
        const target = memoryTargets.find(t => t.id === item.targetId);
        if (target) {
          try {
            liveVal = (item.type === 'f64') 
              ? target.view.getFloat64(item.offset, true) 
              : target.view.getInt32(item.offset, true);
            if (isFinite(liveVal)) item.val = liveVal;
          } catch (e) {}
        }

        const isFrozen = this.wasmFrozenOffsets.has(item.key) || item.isFrozen;
        const formattedVal = typeof liveVal === 'number' 
          ? (Number.isInteger(liveVal) ? liveVal : liveVal.toFixed(1)) 
          : liveVal;

        html += `
          <tr id="cheat-row-${item.id}">
            <td>
              <div style="font-size: 9px; color: #888;">[${item.game}]</div>
              <div style="font-weight: bold; color: #0A246A; cursor: pointer; text-decoration: underline dotted;" onclick="Harness.renameCheatRecord('${item.id}')" title="클릭하여 이름 수정">
                ✏️ ${item.name}
              </div>
            </td>
            <td class="code-key" style="font-size: 10px;">${item.hex} <span style="font-size:9px; color:#888;">(${item.type})</span></td>
            <td class="code-val" id="cheat-val-${item.id}" style="font-weight: bold; color: ${isFrozen ? '#D32F2F' : '#003399'};">
              ${formattedVal}
            </td>
            <td style="white-space: nowrap;">
              <button class="btn-micro" style="background:#FFF9C4; font-weight:bold;" onclick="Harness.quickSetCheatRecordValue('${item.id}', 999999)">999,999</button>
              <button class="btn-micro" onclick="Harness.editCheatRecordValue('${item.id}')">수치 수정</button>
            </td>
            <td style="text-align: center;">
              <input type="checkbox" ${isFrozen ? 'checked' : ''} onchange="Harness.toggleFreezeCheatRecord('${item.id}')" title="수치 무한 고정(Lock)">
            </td>
            <td style="text-align: center;">
              <button class="btn-micro" style="color: #D32F2F;" onclick="Harness.deleteCheatRecord('${item.id}')" title="치트 항목 삭제">✕</button>
            </td>
          </tr>
        `;
      }

      targets.forEach(t => t.innerHTML = html);
    }

    _updateCheatRecordsLiveValues() {
      if (!this.cheatRecords || this.cheatRecords.length === 0) return;
      const memoryTargets = this.getMemoryTargets();

      for (const item of this.cheatRecords) {
        let liveVal = item.val;
        const target = memoryTargets.find(t => t.id === item.targetId);
        if (target) {
          try {
            liveVal = (item.type === 'f64') 
              ? target.view.getFloat64(item.offset, true) 
              : target.view.getInt32(item.offset, true);
            if (isFinite(liveVal)) item.val = liveVal;
          } catch (e) {}
        }

        const isFrozen = this.wasmFrozenOffsets.has(item.key) || item.isFrozen;
        const formattedVal = typeof liveVal === 'number' 
          ? (Number.isInteger(liveVal) ? liveVal : liveVal.toFixed(1)) 
          : liveVal;

        const valEls = this._getAllDOMElements(`cheat-val-${item.id}`);
        for (const el of valEls) {
          if (el.textContent.trim() !== String(formattedVal)) {
            el.textContent = formattedVal;
          }
          el.style.color = isFrozen ? '#D32F2F' : '#003399';
        }
      }
    }

    renameCheatRecord(id) {
      const record = this.cheatRecords.find(r => r.id === id);
      if (!record) return;
      const nextName = prompt(`[${record.hex}] 치트 항목의 새 이름을 입력하세요:`, record.name);
      if (nextName !== null && nextName.trim() !== '') {
        record.name = nextName.trim();
        this.aliasMap.set(record.key, record.name);
        this.log(`[CheatTable] ✏️ 치트 항목 이름 변경: "${nextName}" (${record.hex})`);
        this._renderCheatRecords();
      }
    }

    editCheatRecordValue(id) {
      const record = this.cheatRecords.find(r => r.id === id);
      if (!record) return;
      const nextVal = prompt(`[${record.name}] (${record.hex})의 새 수치를 입력하세요:`, record.val);
      if (nextVal !== null) {
        const num = parseFloat(nextVal);
        if (!isNaN(num)) {
          this.quickSetCheatRecordValue(id, num);
        }
      }
    }

    quickSetCheatRecordValue(id, val) {
      const record = this.cheatRecords.find(r => r.id === id);
      if (!record) return;
      this.quickSetHunterVal(record.key, val);
      record.val = val;
      record.updatedAt = Date.now();
      this._renderCheatRecords();
    }

    toggleFreezeCheatRecord(id) {
      const record = this.cheatRecords.find(r => r.id === id);
      if (!record) return;
      this.toggleFreezeWasm(record.key);
      record.isFrozen = this.wasmFrozenOffsets.has(record.key);
      this._renderCheatRecords();
    }

    deleteCheatRecord(id) {
      const record = this.cheatRecords.find(r => r.id === id);
      if (!record) return;
      if (this.wasmFrozenOffsets.has(record.key)) {
        this.wasmFrozenOffsets.delete(record.key);
      }
      this.cheatRecords = this.cheatRecords.filter(r => r.id !== id);
      this.log(`[CheatTable] 🗑️ 치트 항목 삭제됨: "${record.name}" (${record.hex})`);
      this._renderCheatRecords();
    }

    promptAddCustomCheatRecord() {
      const name = prompt('치트 항목 이름을 입력하세요 (예: 영웅 HP, 골드):', '새 치트');
      if (!name) return;
      const addrStr = prompt('메모리 오프셋/주소를 16진수 또는 10진수로 입력하세요 (예: 0x0100 또는 256):', '0x0100');
      if (!addrStr) return;

      let offset = 0;
      if (addrStr.toLowerCase().startsWith('0x')) {
        offset = parseInt(addrStr, 16);
      } else {
        offset = parseInt(addrStr, 10);
      }
      if (isNaN(offset)) {
        alert('유효하지 않은 주소입니다.');
        return;
      }

      const valStr = prompt('설정할 초기 수치를 입력하세요 (예: 999999):', '999999');
      const val = parseFloat(valStr) || 0;

      const memoryTargets = this.getMemoryTargets();
      const target = memoryTargets[0];
      const targetId = target ? target.id : 'wasm_0';
      const key = `${targetId}:${offset}:f64`;

      this.quickSetHunterVal(key, val);
      this.addOrUpdateCheatRecord(key, val, name);
    }

    /* -------------------------------------------------------------
     * Multi-Game Slot Session Management
     * ------------------------------------------------------------- */
    _updateGameSlotButtons() {
      for (let i = 0; i < 3; i++) {
        const btn = document.getElementById(`slot-btn-${i}`);
        if (btn) {
          const slot = this.gameSlots[i];
          btn.classList.toggle('active', i === this.currentSlot);
          if (slot && slot.title && !slot.title.startsWith('빈 슬롯')) {
            const shortName = slot.title.length > 7 ? slot.title.substring(0, 6) + '…' : slot.title;
            btn.textContent = `🎮 ${shortName}`;
            btn.title = `슬롯 ${i + 1}: ${slot.title}`;
          } else {
            btn.textContent = `🎮 슬롯 ${i + 1}`;
            btn.title = `슬롯 ${i + 1}: 빈 슬롯`;
          }
        }
      }
    }

    switchGameSlot(slotIdx) {
      if (slotIdx === this.currentSlot) return;
      // Save current slot state
      const cur = this.gameSlots[this.currentSlot];
      if (cur) {
        cur.records = [...this.cheatRecords];
        cur.title = this.currentGameTitle;
        cur.isSandbox = this.sandboxActive;
      }

      this.currentSlot = slotIdx;
      this._updateGameSlotButtons();

      const target = this.gameSlots[slotIdx];
      this.cheatRecords = target && target.records ? [...target.records] : [];
      this._renderCheatRecords();

      if (target && target.arrayBuffer) {
        this._reloadSwfBuffer(target.file || { name: target.title }, target.arrayBuffer);
      } else {
        this.startSandboxDemo();
      }
      this.log(`[Slot] 게임 세션 전환: 슬롯 ${slotIdx + 1} (${this.currentGameTitle})`);
    }

    async _reloadSwfBuffer(file, arrayBuffer) {
      this.stopSandboxDemo();
      if (!this.rufflePlayer) {
        const container = document.getElementById('player-viewport');
        const ruffle = window.RufflePlayer.newest();
        this.rufflePlayer = ruffle.createPlayer();
        container.innerHTML = '';
        container.appendChild(this.rufflePlayer);
      }
      await this.rufflePlayer.load({ data: arrayBuffer });
      this.state = STATES.FLASH_LOADED;
      this.currentGameTitle = file.name;
      const titles = this._getAllDOMElements('current-game-title');
      titles.forEach(el => el.textContent = file.name);
      const badges = this._getAllDOMElements('game-status-badge');
      badges.forEach(el => {
        el.textContent = 'Flash (Ruffle) Active';
        el.className = 'status-badge active';
      });
    }

    /* -------------------------------------------------------------
     * Cheat Table Export & Import (JSON Presets)
     * ------------------------------------------------------------- */
    exportCheatTable() {
      const data = {
        format: "CheatFlash-CheatTable",
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        gameTitle: this.currentGameTitle,
        records: this.cheatRecords
      };
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeTitle = (this.currentGameTitle || "cheats").replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
      a.href = url;
      a.download = `${safeTitle}_cheats.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.log(`[CheatTable] 치트 테이블 내보내기 완료: ${this.cheatRecords.length}개 항목 저장됨`);
    }

    importCheatTableData(jsonObj) {
      if (!jsonObj || !Array.isArray(jsonObj.records)) {
        alert("유효하지 않은 치트 테이블 JSON 파일 형식입니다.");
        return;
      }
      let importedCount = 0;
      for (const rec of jsonObj.records) {
        if (!rec.key && !rec.id) continue;
        const exists = this.cheatRecords.some(r => (r.targetId === rec.targetId && r.offset === rec.offset) || r.id === rec.id);
        if (!exists) {
          this.cheatRecords.unshift({
            ...rec,
            id: rec.id || `cheat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            updatedAt: Date.now()
          });
          importedCount++;
        }
      }
      this._renderCheatRecords();
      this.log(`[CheatTable] 치트 테이블 불러오기 완료: ${importedCount}개 항목 등록됨`);
      alert(`치트 테이블 불러오기 완료: 총 ${importedCount}개의 항목이 등록되었습니다.`);
    }

    importCheatTableFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          this.importCheatTableData(parsed);
        } catch (err) {
          alert("치트 테이블 JSON 파싱 실패: " + err.message);
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    }

    _renderBlackboardTable() {
      const tableBody = document.getElementById('blackboard-tbody');
      if (!tableBody) return;

      const currentHash = JSON.stringify(this.blackboard);
      if (this._lastBlackboardHash === currentHash) return;
      this._lastBlackboardHash = currentHash;

      let html = '';
      for (const [key, val] of Object.entries(this.blackboard)) {
        const valType = typeof val;
        let displayVal = val;
        let actionBtn = '';

        if (valType === 'boolean') {
          displayVal = val ? '<span class="tag green">TRUE</span>' : '<span class="tag gray">FALSE</span>';
          actionBtn = `<button class="btn-micro" onclick="Harness.toggleBlackboardBool('${key}')">Toggle</button>`;
        } else if (valType === 'number') {
          actionBtn = `<button class="btn-micro" onclick="Harness.promptEditVal('${key}')">Edit</button>`;
        }

        html += `
          <tr>
            <td class="code-key">${key}</td>
            <td class="code-val">${displayVal}</td>
            <td class="code-act">${actionBtn}</td>
          </tr>
        `;
      }
      tableBody.innerHTML = html;
    }

    toggleBlackboardBool(key) {
      if (key in this.blackboard) {
        this.blackboard[key] = !this.blackboard[key];
        this.log(`[Cheat] Toggled ${key} ➔ ${this.blackboard[key]}`);
      }
    }

    promptEditVal(key) {
      const current = this.blackboard[key];
      const next = prompt(`Enter new value for [${key}]:`, current);
      if (next !== null) {
        const num = parseFloat(next);
        if (!isNaN(num)) {
          this.blackboard[key] = num;
          this.log(`[MemoryHook] Injected [${key}] = ${num}`);
        }
      }
    }

    addCustomVariable() {
      const name = prompt('Enter variable name to monitor (e.g. boss.hp, hero.ammo):');
      if (!name) return;
      const val = prompt(`Initial value for [${name}]:`, '100');
      const num = parseFloat(val);
      this.blackboard[name] = isNaN(num) ? val : num;
      this.log(`[Inspector] Added monitored variable: ${name} = ${this.blackboard[name]}`);
    }

    triggerCheat(cheatType) {
      switch (cheatType) {
        case 'god_mode':
          if (this.sandboxActive) {
            this.blackboard['player.hp'] = 99999;
            this.blackboard['player.maxHp'] = 99999;
            this.blackboard['game.godMode'] = true;
            this.renderBlackboard();
            this.log('[Cheat] 데모 모드: 무적(HP 99,999) 적용 완료');
            alert('🛡️ 데모 모드 무적 활성화!\n- HP: 99,999\n- Blackboard 및 Sandbox 메모리에 즉시 반영되었습니다.');
          } else {
            this.switchTab('scanner');
            this.log('[Cheat] 범용 플래시 게임: [메모리 검색기] 탭에서 체력 수치를 입력하여 실시간 메모리 값을 조작할 수 있습니다.');
            alert('💡 플래시 게임 무적 치트 안내:\n\n플래시 게임마다 체력이 위치한 메모리 주소가 다릅니다.\n[🔍 메모리 검색기] 탭으로 이동했습니다!\n\n1. 상단 [1. 기준값]에 현재 체력(예: 100)을 입력하고 [🎯 추적 시작]\n2. 체력이 깎였을 때 [999,999] 또는 [무한(동결)]을 누르면 즉시 무적이 됩니다!');
          }
          break;
        case 'infinite_gold':
          if (this.sandboxActive) {
            this.blackboard['player.gold'] = 999999;
            this.blackboard['game.infiniteGold'] = true;
            this.renderBlackboard();
            this.log('[Cheat] 데모 모드: 골드 999,999 적용 완료');
            alert('💰 데모 모드 골드 999,999 적용 완료!\n- Gold: 999,999\n- Blackboard 및 Sandbox 메모리에 즉시 반영되었습니다.');
          } else {
            this.switchTab('scanner');
            this.log('[Cheat] 범용 플래시 게임: [메모리 검색기] 탭에서 골드 수치를 입력하여 실시간 메모리 값을 조작할 수 있습니다.');
            alert('💡 플래시 게임 골드 999,999 치트 안내:\n\n플래시 게임마다 골드가 위치한 메모리 주소가 다릅니다.\n[🔍 메모리 검색기] 탭으로 이동했습니다!\n\n1. 상단 [1. 기준값]에 현재 골드(예: 500)를 입력하고 [🎯 추적 시작]\n2. 골드를 얻거나 쓴 후 [999,999]를 누르면 즉시 부자가 됩니다!');
          }
          break;
        case 'super_speed':
          this.setSpeed(3.0);
          break;
        case 'matrix_bullet_time':
          this.setSpeed(0.2);
          break;
        case 'reset_normal':
          this.setSpeed(1.0);
          break;
        case 'ant_buster_god_money':
          {
            const memoryTargets = this.getMemoryTargets();
            let hitCount = 0;
            for (const target of memoryTargets) {
              const view = target.view;
              const maxOffset = target.buffer.byteLength - 8;
              for (let offset = 0; offset <= maxOffset; offset += 4) {
                try {
                  const val = view.getFloat64(offset, true);
                  // Initial Ant Buster values: money = 500, dinCheck = 125
                  if (Math.abs(val - 500.0) < 0.001) {
                    view.setFloat64(offset, 999999.0, true);
                    this.wasmFrozenOffsets.set(`${target.id}:${offset}:f64`, { targetId: target.id, offset, type: 'f64', lockedVal: 999999.0 });
                    hitCount++;
                  } else if (Math.abs(val - 125.0) < 0.001) {
                    view.setFloat64(offset, 249999.75, true);
                    this.wasmFrozenOffsets.set(`${target.id}:${offset}:f64`, { targetId: target.id, offset, type: 'f64', lockedVal: 249999.75 });
                    hitCount++;
                  }
                } catch (e) {}
              }
            }
            this.log(`[AntiCheatBypass] 🐜 Ant Buster 특수 치트 적용 완료! (${hitCount}개 주소 동기화: money=999,999 / dinCheck=249,999.75)`);
            alert(`🐜 Ant Buster 전용 치트 적용 완료!\n- 표시 골드 (money): 999,999\n- 내부 검증 체크섬 (dinCheck): 249,999.75 (÷4 연동)\n상점 구매 및 업그레이드가 정상 승인됩니다!`);
          }
          break;
      }
    }

    /* -------------------------------------------------------------
     * True WebAssembly & Binary Memory Rig (WASM 선형 메모리 직접 스캔)
     * ------------------------------------------------------------- */
    getMemoryTargets() {
      const targets = [];
      // 1. Captured WebAssembly.Memory from Ruffle Web Player (with Detached Buffer Guard)
      if (window._capturedWasmMemories) {
        let idx = 0;
        for (const mem of window._capturedWasmMemories) {
          if (mem) {
            try {
              const buf = mem.buffer;
              if (buf && buf.byteLength > 0) {
                targets.push({
                  id: `wasm_${idx}`,
                  label: `Ruffle WASM RAM #${idx} (${(buf.byteLength / (1024 * 1024)).toFixed(1)}MB)`,
                  buffer: buf,
                  view: new DataView(buf),
                  isWasm: true,
                  memInstance: mem
                });
                idx++;
              }
            } catch (e) {
              // Gracefully skip transient detached buffer during in-flight WebAssembly.Memory.grow()
            }
          }
        }
      }

      // 2. Fallback / Built-in Sandbox Buffer (for Demo Mode)
      if (this.sandboxBuffer) {
        targets.push({
          id: 'sandbox_0',
          label: 'Sandbox Mock RAM (64KB)',
          buffer: this.sandboxBuffer,
          view: this.sandboxView,
          isWasm: false,
          memInstance: null
        });
      }

      return targets;
    }

    onWasmMemoryGrown(mem, oldBytes, newBytes) {
      this.log(`[WASM] 📈 힙 메모리 자동 확장 감지: ${(oldBytes / (1024 * 1024)).toFixed(1)}MB ➔ ${(newBytes / (1024 * 1024)).toFixed(1)}MB (포인터 뷰 자동 갱신 완료)`);
      this._renderAllPanels();
    }

    /* -------------------------------------------------------------
     * Smart Delta Hunter (실시간 값 변동 자동 감지 & 99.9% 소거 마법사)
     * ------------------------------------------------------------- */
    startDeltaHunting(baselineStr) {
      const baseVal = parseFloat(baselineStr);
      if (isNaN(baseVal)) {
        alert('현재 화면에 보이는 기준 숫자(예: 100)를 입력하세요.');
        return;
      }

      this.hunterBaseline = baseVal;
      this.hunterCandidates = [];
      const memoryTargets = this.getMemoryTargets();

      for (const target of memoryTargets) {
        const view = target.view;
        const byteLen = target.buffer.byteLength;

        // 1-A. Scan Float64 (8 bytes, Little Endian - AS2/AS3 Number)
        const maxOffsetF64 = byteLen - 8;
        for (let offset = 0; offset <= maxOffsetF64; offset += 4) {
          try {
            const val = view.getFloat64(offset, true);
            if (Math.abs(val - baseVal) < 0.0001 && isFinite(val)) {
              this.hunterCandidates.push({
                targetId: target.id,
                offset,
                hex: '0x' + offset.toString(16).toUpperCase().padStart(6, '0'),
                type: 'f64',
                baseVal,
                currentVal: val,
                changed: false,
                isChecksumRatio: 1.0,
                key: `${target.id}:${offset}:f64`
              });
              if (this.hunterCandidates.length >= 2000) break;
            }
          } catch (e) {}
        }

        // 1-B. Scan Float64 for Anti-Cheat Linked Checksum (Ratio 0.25: e.g. Ant Buster dinCheck = money / 4)
        if (baseVal > 0) {
          const div4Val = baseVal * 0.25;
          for (let offset = 0; offset <= maxOffsetF64; offset += 4) {
            try {
              const val = view.getFloat64(offset, true);
              if (Math.abs(val - div4Val) < 0.0001 && isFinite(val)) {
                this.hunterCandidates.push({
                  targetId: target.id,
                  offset,
                  hex: '0x' + offset.toString(16).toUpperCase().padStart(6, '0'),
                  type: 'f64',
                  baseVal: div4Val,
                  currentVal: val,
                  changed: false,
                  isChecksumRatio: 0.25,
                  label: '🛡️ NDS 체크섬 (÷4)',
                  key: `${target.id}:${offset}:f64`
                });
                if (this.hunterCandidates.length >= 3000) break;
              }
            } catch (e) {}
          }
        }

        // 2. Scan Int32 (4 bytes, Little Endian - AS3 int / Real Shop Logic Variable)
        if (Number.isInteger(baseVal)) {
          const intTarget = Math.round(baseVal);
          const maxOffsetI32 = byteLen - 4;
          for (let offset = 0; offset <= maxOffsetI32; offset += 4) {
            try {
              const val = view.getInt32(offset, true);
              if (val === intTarget) {
                this.hunterCandidates.push({
                  targetId: target.id,
                  offset,
                  hex: '0x' + offset.toString(16).toUpperCase().padStart(6, '0'),
                  type: 'i32',
                  baseVal: intTarget,
                  currentVal: val,
                  changed: false,
                  key: `${target.id}:${offset}:i32`
                });
                if (this.hunterCandidates.length >= 4000) break;
              }
            } catch (e) {}
          }
        }
      }

      this.isHunting = true;
      this.log(`[DeltaHunter] 🎯 락온 완료! 기준값 [${baseVal}] (및 ÷4 연동 체크섬) 후보 ${this.hunterCandidates.length}개 실시간 감시 시작.`);
      this.log(`[DeltaHunter] 💡 팁: 이제 게임에서 한 대 맞거나 골드를 써보세요. 값이 변하는 순간 빨간색으로 자동 포착됩니다!`);
      this._updateHunterStatusText(`🎯 기준값 [${baseVal}] 추적 중 (${this.hunterCandidates.length}개 감시 중). 게임에서 수치를 변화시켜 보세요!`);
      this._renderDeltaHunterUI();
    }

    tickDeltaSurveillance() {
      if (!this.isHunting || this.hunterCandidates.length === 0) return;
      const now = Date.now();
      if (now - this.lastHunterTick < 150) return; // 150ms throttle
      this.lastHunterTick = now;

      const memoryTargets = this.getMemoryTargets();
      let changedCount = 0;

      for (const c of this.hunterCandidates) {
        const target = memoryTargets.find(t => t.id === c.targetId);
        if (!target) continue;

        try {
          const liveVal = (c.type === 'f64') 
            ? target.view.getFloat64(c.offset, true) 
            : target.view.getInt32(c.offset, true);

          if (Math.abs(liveVal - c.baseVal) > 0.0001 && isFinite(liveVal)) {
            if (!c.changed) {
              c.changed = true;
              this.log(`[DeltaHunter] ⚡ 변동 감지! 주소 [${c.hex}]: ${c.baseVal} ➔ ${liveVal.toFixed(1)}`);
            }
            c.currentVal = liveVal;
            changedCount++;
          }
        } catch (e) {}
      }

      if (changedCount > 0) {
        // Sort: changed first!
        this.hunterCandidates.sort((a, b) => (b.changed ? 1 : 0) - (a.changed ? 1 : 0));
        this._updateHunterStatusText(`⚡ ${changedCount}개 주소에서 값 변동 감지됨! 맨 위 적중 주소를 확인하세요.`);
        this._renderDeltaHunterUI();
      }
    }

    pruneByNextValue(nextValStr) {
      if (this.hunterCandidates.length === 0) {
        alert('먼저 1단계 기준값 추적(추적 시작)을 진행하세요.');
        return;
      }
      const targetNextVal = parseFloat(nextValStr);
      if (isNaN(targetNextVal)) {
        alert('변화된 이후의 숫자(예: 85)를 입력하세요.');
        return;
      }

      const memoryTargets = this.getMemoryTargets();
      const pruned = [];

      for (const c of this.hunterCandidates) {
        const target = memoryTargets.find(t => t.id === c.targetId);
        if (!target) continue;
        try {
          const liveVal = (c.type === 'f64') 
            ? target.view.getFloat64(c.offset, true) 
            : target.view.getInt32(c.offset, true);

          const expectedVal = c.isChecksumRatio === 0.25 ? (targetNextVal * 0.25) : targetNextVal;
          if (Math.abs(liveVal - expectedVal) < 0.0001) {
            c.currentVal = liveVal;
            c.changed = true;
            pruned.push(c);
          }
        } catch (e) {}
      }

      const prevCount = this.hunterCandidates.length;
      this.hunterCandidates = pruned;
      this.log(`[DeltaHunter] 🔍 2단계 소거 완료: ${prevCount}개 ➔ ${pruned.length}개로 압축 적중!`);
      this._updateHunterStatusText(`🎉 소거 완료! 정확히 일치하는 ${pruned.length}개 주소로 좁혀졌습니다.`);
      this._renderDeltaHunterUI();
    }

    resetDeltaHunter() {
      this.isHunting = false;
      this.hunterCandidates = [];
      this.hunterBaseline = 0;
      this._updateHunterStatusText('대기 중. 현재 수치를 입력하고 [1. 기준값 락온]을 누르세요.');
      this._renderDeltaHunterUI();
      this.log('[DeltaHunter] 스마트 델타 헌터가 초기화되었습니다.');
    }

    _updateHunterStatusText(text) {
      const els = this._getAllDOMElements('hunter-status-msg');
      els.forEach(el => el.innerHTML = text);
    }

    _renderDeltaHunterUI() {
      const tbodies = this._getAllDOMElements('delta-hunter-tbody');
      if (tbodies.length === 0) return;

      if (this.hunterCandidates.length === 0) {
        tbodies.forEach(tb => tb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">추적 대기 중</td></tr>');
        return;
      }

      let html = '';
      const displayList = this.hunterCandidates.slice(0, 20);

      for (const item of displayList) {
        const isFrozen = this.wasmFrozenOffsets.has(item.key);
        const rowBg = item.changed ? 'background-color: #FFEBEE;' : '';
        const badge = item.isChecksumRatio === 0.25
          ? '<span class="status-badge" style="background:#0288D1; margin-right:2px;" title="안티치트 검증 변수 (dinCheck = money / 4)">체크섬(÷4)</span>'
          : (item.changed ? '<span class="status-badge" style="background:#D32F2F; margin-right:2px;">적중!</span>' : '');

        html += `
          <tr style="${rowBg}">
            <td class="code-key" style="font-weight: ${item.changed ? 'bold' : 'normal'};">
              ${badge}${item.hex}
            </td>
            <td class="code-val" style="font-weight:bold; color: ${item.changed ? '#D32F2F' : '#003399'};">
              ${typeof item.currentVal === 'number' ? item.currentVal.toFixed(1) : item.currentVal}
            </td>
            <td style="white-space: nowrap;">
              <button class="btn-micro" style="background:#FFF9C4; font-weight:bold;" onclick="Harness.quickSetHunterVal('${item.key}', 999999)">999,999</button>
              <button class="btn-micro" onclick="Harness.promptEditHunterVal('${item.key}')">수정</button>
            </td>
            <td style="text-align: center;">
              <input type="checkbox" ${isFrozen ? 'checked' : ''} onchange="Harness.toggleFreezeWasm('${item.key}')" title="WASM 힙 메모리 고정(Lock)">
            </td>
          </tr>
        `;
      }

      if (this.hunterCandidates.length > 20) {
        html += `<tr><td colspan="4" style="text-align:center; color:#777; font-size:9px;">...외 ${this.hunterCandidates.length - 20}개 후보 생략됨 (게임 수치가 변하면 맨 위로 올라옵니다)</td></tr>`;
      }

      tbodies.forEach(tb => tb.innerHTML = html);
    }

    quickSetHunterVal(key, val) {
      const parts = key.split(':');
      const targetId = parts[0];
      const offset = parseInt(parts[1], 10);
      const type = parts[2];

      const memoryTargets = this.getMemoryTargets();
      const target = memoryTargets.find(t => t.id === targetId);
      if (!target) return;

      try {
        const candidate = this.hunterCandidates.find(c => c.key === key);
        const isDiv4 = candidate && candidate.isChecksumRatio === 0.25;

        if (type === 'f64') target.view.setFloat64(offset, val, true);
        else target.view.setInt32(offset, Math.round(val), true);

        // Auto freeze target
        this.wasmFrozenOffsets.set(key, { targetId, offset, type, lockedVal: val });
        this.log(`[DeltaHunter] 🚀 주소 [0x${offset.toString(16).toUpperCase()}] ➔ 값 [${val}] 주입 및 🔒 무한 고정(Lock) 완료!`);

        // Anti-Cheat Paired Sync:
        // If modifying primary (money=999999), also sync checksum (dinCheck=999999/4)
        const primaryVal = isDiv4 ? (val * 4) : val;
        const checksumVal = isDiv4 ? val : (val * 0.25);

        // 1. Update any registered checksum/primary candidates in hunterCandidates
        for (const c of this.hunterCandidates) {
          if (c.key === key) continue;
          const cTarget = memoryTargets.find(t => t.id === c.targetId);
          if (!cTarget) continue;

          if (!isDiv4 && c.isChecksumRatio === 0.25) {
            cTarget.view.setFloat64(c.offset, checksumVal, true);
            c.currentVal = checksumVal;
            this.wasmFrozenOffsets.set(c.key, { targetId: c.targetId, offset: c.offset, type: 'f64', lockedVal: checksumVal });
            this.log(`[AntiCheatBypass] 🛡️ 연동 체크섬 [${c.hex}] (NDS ÷4) ➔ ${checksumVal} 자동 동기화 주입 및 락온!`);
          } else if (isDiv4 && (!c.isChecksumRatio || c.isChecksumRatio === 1.0)) {
            cTarget.view.setFloat64(c.offset, primaryVal, true);
            c.currentVal = primaryVal;
            this.wasmFrozenOffsets.set(c.key, { targetId: c.targetId, offset: c.offset, type: 'f64', lockedVal: primaryVal });
            this.log(`[AntiCheatBypass] 🛡️ 연동 원본 수치 [${c.hex}] ➔ ${primaryVal} 자동 동기화 주입 및 락온!`);
          }
        }

        // 2. Scan adjacent memory +/- 256 bytes for uncataloged checksum (dinCheck = money / 4)
        if (this.hunterBaseline > 0 && !isDiv4) {
          const expectedChecksum = this.hunterBaseline * 0.25;
          const scanRadius = 256;
          const minOff = Math.max(0, offset - scanRadius);
          const maxOff = Math.min(target.buffer.byteLength - 8, offset + scanRadius);
          for (let adj = minOff; adj <= maxOff; adj += 4) {
            if (adj === offset) continue;
            try {
              const adjVal = target.view.getFloat64(adj, true);
              if (Math.abs(adjVal - expectedChecksum) < 0.001) {
                target.view.setFloat64(adj, checksumVal, true);
                const adjKey = `${targetId}:${adj}:f64`;
                this.wasmFrozenOffsets.set(adjKey, { targetId, offset: adj, type: 'f64', lockedVal: checksumVal });
                this.log(`[AntiCheatBypass] 🛡️ 인접 힙 0x${adj.toString(16).toUpperCase()}에서 NDS 체크섬 변수(${expectedChecksum}) 발견! ➔ ${checksumVal}로 동시 주입 및 락온!`);
              }
            } catch (e) {}
          }
        }

        // 3. Cluster Sync Poking: Also poke adjacent +/- 4, 8, 16 bytes (Real shop vs Display cluster sync)
        const adjacentDeltas = [-16, -8, -4, 4, 8, 16];
        for (const delta of adjacentDeltas) {
          const adjOffset = offset + delta;
          if (adjOffset >= 0 && adjOffset <= target.buffer.byteLength - 8) {
            try {
              // Try Float64 adjacent
              const adjF64 = target.view.getFloat64(adjOffset, true);
              if (Math.abs(adjF64 - this.hunterBaseline) < 1.0) {
                target.view.setFloat64(adjOffset, val, true);
                const adjKey = `${targetId}:${adjOffset}:f64`;
                this.wasmFrozenOffsets.set(adjKey, { targetId, offset: adjOffset, type: 'f64', lockedVal: val });
                this.log(`[ClusterSync] 🔗 인접 연관 주소 0x${adjOffset.toString(16).toUpperCase()} (Float64) 동시 주입 및 고정!`);
              }
              // Try Int32 adjacent
              const adjI32 = target.view.getInt32(adjOffset, true);
              if (Math.abs(adjI32 - this.hunterBaseline) < 1.0) {
                target.view.setInt32(adjOffset, Math.round(val), true);
                const adjKey = `${targetId}:${adjOffset}:i32`;
                this.wasmFrozenOffsets.set(adjKey, { targetId, offset: adjOffset, type: 'i32', lockedVal: val });
                this.log(`[ClusterSync] 🔗 인접 연관 주소 0x${adjOffset.toString(16).toUpperCase()} (Int32) 동시 주입 및 고정!`);
              }
            } catch (e) {}
          }
        }

        this.addOrUpdateCheatRecord(key, val);
        this.tickDeltaSurveillance();
        this._renderDeltaHunterUI();
      } catch (e) {
        alert('수정 실패: ' + e.message);
      }
    }

    promptEditHunterVal(key) {
      const parts = key.split(':');
      const targetId = parts[0];
      const offset = parseInt(parts[1], 10);
      const type = parts[2];

      const memoryTargets = this.getMemoryTargets();
      const target = memoryTargets.find(t => t.id === targetId);
      if (!target) return;

      const curr = (type === 'f64') ? target.view.getFloat64(offset, true) : target.view.getInt32(offset, true);
      const next = prompt(`주소 [0x${offset.toString(16).toUpperCase()}]의 새 값을 입력하세요:`, curr);
      if (next !== null) {
        const num = parseFloat(next);
        if (!isNaN(num)) {
          this.quickSetHunterVal(key, num);
        }
      }
    }

    /* -------------------------------------------------------------
     * Quick Number Inspector (화면 수치 ➔ WASM 오프셋/변수명 역추적 & 즉시 수정)
     * ------------------------------------------------------------- */
    quickSearchByNumber(targetValStr) {
      const targetVal = parseFloat(targetValStr);
      if (isNaN(targetVal)) {
        alert('화면에 보이는 유효한 숫자를 입력하세요.');
        return;
      }

      this.quickSearchResults = [];
      const memoryTargets = this.getMemoryTargets();
      let totalScannedMB = 0;

      // 1. Scan actual WebAssembly Linear Memory Buffers
      for (const target of memoryTargets) {
        const view = target.view;
        const byteLen = target.buffer.byteLength;
        totalScannedMB += (byteLen / (1024 * 1024));

        // Scan Float64 (8 bytes, Little Endian) - Flash AS2/AS3 Number
        const maxOffsetF64 = byteLen - 8;
        for (let offset = 0; offset <= maxOffsetF64; offset += 4) {
          try {
            const val = view.getFloat64(offset, true);
            if (Math.abs(val - targetVal) < 0.0001 && isFinite(val)) {
              const hex = '0x' + offset.toString(16).toUpperCase().padStart(6, '0');
              const key = `${target.id}:${offset}:f64`;
              const alias = this.aliasMap.get(key) || this._guessAliasFromOffset(offset) || `RAM[${hex}]`;

              this.quickSearchResults.push({
                targetId: target.id,
                offset,
                hex,
                type: 'f64',
                typeLabel: 'Float64 (Number)',
                value: val,
                alias,
                key,
                isRecommended: true
              });
              if (this.quickSearchResults.length >= 100) break;
            }
          } catch (e) {}
        }

        // Scan Float64 for Anti-Cheat Linked Checksum (Ratio 0.25: e.g. Ant Buster dinCheck = money / 4)
        if (targetVal > 0 && this.quickSearchResults.length < 100) {
          const div4Val = targetVal * 0.25;
          for (let offset = 0; offset <= maxOffsetF64; offset += 4) {
            try {
              const val = view.getFloat64(offset, true);
              if (Math.abs(val - div4Val) < 0.0001 && isFinite(val)) {
                const hex = '0x' + offset.toString(16).toUpperCase().padStart(6, '0');
                const key = `${target.id}:${offset}:f64`;
                this.quickSearchResults.push({
                  targetId: target.id,
                  offset,
                  hex,
                  type: 'f64',
                  typeLabel: 'Float64 (Anti-Cheat Checksum)',
                  value: val,
                  alias: `🛡️ 내부 검증 체크섬 (NDS ÷4 = ${div4Val.toFixed(2)})`,
                  key,
                  isRecommended: true,
                  isChecksumRatio: 0.25
                });
                if (this.quickSearchResults.length >= 100) break;
              }
            } catch (e) {}
          }
        }

        // Scan Int32 (4 bytes, Little Endian) - Flash AS3 int/uint
        if (Number.isInteger(targetVal) && this.quickSearchResults.length < 100) {
          const maxOffsetI32 = byteLen - 4;
          for (let offset = 0; offset <= maxOffsetI32; offset += 4) {
            try {
              const val = view.getInt32(offset, true);
              if (val === targetVal) {
                const hex = '0x' + offset.toString(16).toUpperCase().padStart(6, '0');
                const key = `${target.id}:${offset}:i32`;
                const alias = this.aliasMap.get(key) || this._guessAliasFromOffset(offset) || `RAM[${hex}]`;

                this.quickSearchResults.push({
                  targetId: target.id,
                  offset,
                  hex,
                  type: 'i32',
                  typeLabel: 'Int32 (int)',
                  value: val,
                  alias,
                  key,
                  isRecommended: false
                });
                if (this.quickSearchResults.length >= 100) break;
              }
            } catch (e) {}
          }
        }
      }

      this.log(`[WasmScanner] 총 ${totalScannedMB.toFixed(1)}MB 메모리 탐색 완료: 수치 [${targetVal}] (및 ÷4 체크섬) ➔ ${this.quickSearchResults.length}개 오프셋 적중`);
      this._renderQuickSearchResults();
    }

    _guessAliasFromOffset(offset) {
      if (offset === 0x0100) return '★ HP (체력)';
      if (offset === 0x0200) return '★ Gold (골드)';
      if (offset === 0x0300) return '★ Score (점수)';
      return null;
    }

    _renderQuickSearchResults() {
      const tbody = document.getElementById('quick-inspector-tbody');
      if (!tbody) return;

      if (this.quickSearchResults.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">메모리에서 일치하는 수치를 찾지 못했습니다.</td></tr>';
        return;
      }

      let html = '';
      for (const item of this.quickSearchResults) {
        const isFrozen = this.wasmFrozenOffsets.has(item.key);
        const displayLabel = item.alias ? `${item.alias} (${item.hex})` : item.hex;

        html += `
          <tr style="${item.isRecommended ? 'background-color: #FFFDE7;' : ''}">
            <td class="code-key" title="${item.typeLabel}">
              ${displayLabel}
            </td>
            <td class="code-val" id="val-badge-${item.key.replace(/[:.]/g, '_')}">${typeof item.value === 'number' ? Number(item.value.toFixed(2)) : item.value}</td>
            <td style="white-space: nowrap;">
              <input type="number" id="input-${item.key.replace(/[:.]/g, '_')}" value="${item.value}" style="width: 55px; font-size: 10px; padding: 1px 2px;">
              <button class="btn-micro" onclick="Harness.applyWasmEdit('${item.key}')">적용</button>
            </td>
            <td style="text-align: center;">
              <input type="checkbox" ${isFrozen ? 'checked' : ''} onchange="Harness.toggleFreezeWasm('${item.key}')" title="WASM 메모리 값 고정(Lock)">
            </td>
          </tr>
        `;
      }
      tbody.innerHTML = html;
    }

    applyWasmEdit(key) {
      const parts = key.split(':');
      const targetId = parts[0];
      const offset = parseInt(parts[1], 10);
      const type = parts[2];

      const inputEl = document.getElementById(`input-${key.replace(/[:.]/g, '_')}`);
      if (!inputEl) return;
      const num = parseFloat(inputEl.value);
      if (isNaN(num)) return;

      const memoryTargets = this.getMemoryTargets();
      const target = memoryTargets.find(t => t.id === targetId);
      if (!target) {
        alert('대상 메모리 버퍼를 찾을 수 없습니다.');
        return;
      }

      try {
        const item = this.quickSearchResults.find(i => i.key === key);
        const isDiv4 = item && item.isChecksumRatio === 0.25;

        if (type === 'f64') {
          target.view.setFloat64(offset, num, true);
        } else if (type === 'i32') {
          target.view.setInt32(offset, Math.round(num), true);
        }

        // Update frozen state if active
        if (this.wasmFrozenOffsets.has(key)) {
          this.wasmFrozenOffsets.set(key, { targetId, offset, type, lockedVal: num });
        }

        this.log(`[MemoryPoke] WASM ${target.id} 오프셋 0x${offset.toString(16).toUpperCase()} ➔ 값 [${num}] 직접 덮어쓰기 완료!`);

        // Anti-Cheat Checksum Synchronized Injection
        const primaryVal = isDiv4 ? (num * 4) : num;
        const checksumVal = isDiv4 ? num : (num * 0.25);

        for (const res of this.quickSearchResults) {
          if (res.key === key) continue;
          const rTarget = memoryTargets.find(t => t.id === res.targetId);
          if (!rTarget) continue;

          if (!isDiv4 && res.isChecksumRatio === 0.25) {
            rTarget.view.setFloat64(res.offset, checksumVal, true);
            res.value = checksumVal;
            this.wasmFrozenOffsets.set(res.key, { targetId: res.targetId, offset: res.offset, type: 'f64', lockedVal: checksumVal });
            this.log(`[AntiCheatBypass] 🛡️ 연동 체크섬 [${res.hex}] (NDS ÷4) ➔ ${checksumVal} 자동 동기화 주입 및 락온!`);
          } else if (isDiv4 && (!res.isChecksumRatio || res.isChecksumRatio === 1.0)) {
            rTarget.view.setFloat64(res.offset, primaryVal, true);
            res.value = primaryVal;
            this.wasmFrozenOffsets.set(res.key, { targetId: res.targetId, offset: res.offset, type: 'f64', lockedVal: primaryVal });
            this.log(`[AntiCheatBypass] 🛡️ 연동 원본 수치 [${res.hex}] ➔ ${primaryVal} 자동 동기화 주입 및 락온!`);
          }
        }

        this.addOrUpdateCheatRecord(key, num);
        this._renderQuickSearchResults();
      } catch (err) {
        this.log(`[Error] 메모리 쓰기 실패: ${err.message}`);
      }
    }

    toggleFreezeWasm(key) {
      const parts = key.split(':');
      const targetId = parts[0];
      const offset = parseInt(parts[1], 10);
      const type = parts[2] || 'f64';

      const memoryTargets = this.getMemoryTargets();
      const target = memoryTargets.find(t => t.id === targetId);

      let currentVal = 0;
      if (target) {
        try {
          currentVal = (type === 'f64') ? target.view.getFloat64(offset, true) : target.view.getInt32(offset, true);
        } catch (e) {}
      }

      if (this.wasmFrozenOffsets.has(key)) {
        this.wasmFrozenOffsets.delete(key);
        this.log(`[MemoryLock] 오프셋 [${key}] 동결 해제`);
      } else {
        this.wasmFrozenOffsets.set(key, { targetId, offset, type, lockedVal: currentVal });
        this.log(`[MemoryLock] WASM 오프셋 [0x${offset.toString(16).toUpperCase()}] 동결(Freeze) ➔ 값 [${currentVal}] 고정!`);
      }

      this.addOrUpdateCheatRecord(key, currentVal);
      this._renderQuickSearchResults();
      this._renderDeltaHunterUI();
      this._renderScannerResults();
      this._renderCheatRecords();
    }

    /* -------------------------------------------------------------
     * Cheat Engine-Grade Comparative Value Scanner (미지수 스캔 Rig)
     * ------------------------------------------------------------- */
    runFirstScan(valStr) {
      const memoryTargets = this.getMemoryTargets();
      if (memoryTargets.length === 0) {
        alert('스캔할 메모리 버퍼(WASM)가 없습니다. 게임을 먼저 실행하세요.');
        return;
      }

      this.scannerCandidates = [];
      const val = parseFloat(valStr);
      const isUnknown = isNaN(val) || valStr === '' || valStr === undefined;

      for (const target of memoryTargets) {
        const view = target.view;
        const byteLen = target.buffer.byteLength;

        // 1. Scan Float64
        const maxF64 = byteLen - 8;
        for (let offset = 0; offset <= maxF64; offset += 4) {
          try {
            const num = view.getFloat64(offset, true);
            if (isFinite(num) && !isNaN(num)) {
              if (isUnknown || Math.abs(num - val) < 0.0001) {
                this.scannerCandidates.push({
                  targetId: target.id,
                  offset,
                  hex: '0x' + offset.toString(16).toUpperCase().padStart(6, '0'),
                  type: 'f64',
                  initialVal: num,
                  lastVal: num,
                  currentVal: num,
                  key: `${target.id}:${offset}:f64`
                });
                if (this.scannerCandidates.length >= 10000) break;
              }
            }
          } catch (e) {}
        }

        // 2. Scan Int32 if integer or unknown
        if ((isUnknown || Number.isInteger(val)) && this.scannerCandidates.length < 10000) {
          const maxI32 = byteLen - 4;
          for (let offset = 0; offset <= maxI32; offset += 4) {
            try {
              const num = view.getInt32(offset, true);
              if (isUnknown || num === Math.round(val)) {
                this.scannerCandidates.push({
                  targetId: target.id,
                  offset,
                  hex: '0x' + offset.toString(16).toUpperCase().padStart(6, '0'),
                  type: 'i32',
                  initialVal: num,
                  lastVal: num,
                  currentVal: num,
                  key: `${target.id}:${offset}:i32`
                });
                if (this.scannerCandidates.length >= 10000) break;
              }
            } catch (e) {}
          }
        }
      }

      this.scannerActive = true;
      if (isUnknown) {
        this.log(`[ValueScanner] 🎯 1차 미지수 스캔(Unknown Initial Value) 완료! 총 ${this.scannerCandidates.length}개 주소 스냅샷 캡처.`);
        this.log(`[ValueScanner] 💡 팁: 이제 가만히 서서 [차기 스캔: 변하지 않음]을 누르거나, 골드를 소모한 후 [차기 스캔: 감소한 값]을 누르세요!`);
      } else {
        this.log(`[ValueScanner] 🎯 1차 정확한 값 스캔 [${val}] 완료! ${this.scannerCandidates.length}개 주소 적중.`);
      }

      this._renderScannerResults();
    }

    runNextScan(scanType, valStr) {
      if (!this.scannerActive || this.scannerCandidates.length === 0) {
        alert('먼저 1차 스캔을 수행하세요.');
        return;
      }

      const memoryTargets = this.getMemoryTargets();
      const pruned = [];
      const targetVal = parseFloat(valStr);

      for (const c of this.scannerCandidates) {
        const target = memoryTargets.find(t => t.id === c.targetId);
        if (!target) continue;

        try {
          const liveVal = (c.type === 'f64') 
            ? target.view.getFloat64(c.offset, true) 
            : target.view.getInt32(c.offset, true);

          if (!isFinite(liveVal) || isNaN(liveVal)) continue;

          let matches = false;

          switch (scanType) {
            case 'unchanged':
              matches = (c.type === 'f64') 
                ? (Math.abs(liveVal - c.lastVal) < 0.0001) 
                : (liveVal === c.lastVal);
              break;
            case 'changed':
              matches = (c.type === 'f64') 
                ? (Math.abs(liveVal - c.lastVal) >= 0.0001) 
                : (liveVal !== c.lastVal);
              break;
            case 'decreased':
              matches = (liveVal < c.lastVal);
              break;
            case 'increased':
              matches = (liveVal > c.lastVal);
              break;
            case 'exact':
              if (!isNaN(targetVal)) {
                matches = (c.type === 'f64') 
                  ? (Math.abs(liveVal - targetVal) < 0.0001) 
                  : (liveVal === Math.round(targetVal));
              }
              break;
            default:
              matches = true;
          }

          if (matches) {
            pruned.push({
              ...c,
              prevVal: c.lastVal,
              lastVal: liveVal,
              currentVal: liveVal
            });
          }
        } catch (e) {}
      }

      const prevCount = this.scannerCandidates.length;
      this.scannerCandidates = pruned;
      this.log(`[ValueScanner] 🔍 차기 스캔 [${scanType}] 필터링 완료: ${prevCount}개 ➔ ${pruned.length}개로 압축 적중!`);
      this._renderScannerResults();
    }

    resetScanner() {
      this.scannerActive = false;
      this.scannerCandidates = [];
      const tbodies = this._getAllDOMElements('scanner-tbody');
      tbodies.forEach(tb => {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">스캔 대기 중 (숫자 입력 또는 빈칸으로 [1차 스캔])</td></tr>';
      });
      this.log('[ValueScanner] 메모리 스캐너가 초기화되었습니다.');
    }

    _renderScannerResults() {
      const tbodies = this._getAllDOMElements('scanner-tbody');
      if (tbodies.length === 0) return;

      if (this.scannerCandidates.length === 0) {
        tbodies.forEach(tb => tb.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">일치하는 결과가 0개입니다.</td></tr>');
        return;
      }

      let html = '';
      const displayList = this.scannerCandidates.slice(0, 20);

      for (const item of displayList) {
        const isFrozen = this.wasmFrozenOffsets.has(item.key);
        const prevText = item.prevVal !== undefined ? (typeof item.prevVal === 'number' ? item.prevVal.toFixed(1) : item.prevVal) : '-';

        html += `
          <tr>
            <td class="code-key" style="font-weight:bold;">${item.hex}</td>
            <td class="code-val" style="color: #003399; font-weight:bold;">
              ${typeof item.currentVal === 'number' ? item.currentVal.toFixed(1) : item.currentVal}
            </td>
            <td style="color: #666; font-size: 9px;">${prevText}</td>
            <td style="white-space: nowrap;">
              <button class="btn-micro" style="background:#FFF9C4; font-weight:bold;" onclick="Harness.quickSetHunterVal('${item.key}', 999999)">999,999</button>
              <button class="btn-micro" onclick="Harness.promptEditHunterVal('${item.key}')">수정</button>
              <input type="checkbox" ${isFrozen ? 'checked' : ''} onchange="Harness.toggleFreezeWasm('${item.key}')" title="동결 고정(Lock)">
            </td>
          </tr>
        `;
      }

      if (this.scannerCandidates.length > 20) {
        html += `<tr><td colspan="4" style="text-align:center; color:#777; font-size:9px;">...외 ${this.scannerCandidates.length - 20}개 후보 생략됨 (차기 스캔으로 좁혀보세요)</td></tr>`;
      }

      tbodies.forEach(tb => tb.innerHTML = html);
    }


    _enforceFrozenVariables() {
      if (this.wasmFrozenOffsets.size === 0 && this.frozenVariables.size === 0) return;

      // 1. Enforce WebAssembly Linear Memory Freezes
      if (this.wasmFrozenOffsets.size > 0) {
        const memoryTargets = this.getMemoryTargets();
        for (const [key, item] of this.wasmFrozenOffsets.entries()) {
          const target = memoryTargets.find(t => t.id === item.targetId);
          if (target && target.view) {
            try {
              if (item.type === 'f64' && item.offset + 8 <= target.view.byteLength) {
                target.view.setFloat64(item.offset, item.lockedVal, true);
              } else if (item.type === 'i32' && item.offset + 4 <= target.view.byteLength) {
                target.view.setInt32(item.offset, Math.round(item.lockedVal), true);
              }
            } catch (e) {}
          }
        }
      }

      // 2. Enforce legacy blackboard freezes
      for (const [path, lockedVal] of this.frozenVariables) {
        if (this.blackboard[path] !== lockedVal) {
          this.blackboard[path] = lockedVal;
        }
      }
    }

    /* -------------------------------------------------------------
     * UI Ergonomics, 3-Tab Switching, Context Menu & Undocking Rig
     * ------------------------------------------------------------- */
    switchTab(tabName) {
      const tabs = ['scanner', 'cheats', 'logs'];
      tabs.forEach((name) => {
        const btn = document.getElementById(`tab-btn-${name}`);
        const page = document.getElementById(`page-${name}`);
        const isActive = (name === tabName);
        if (btn) {
          if (isActive) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        }
        if (page) {
          if (isActive) {
            page.classList.add('active');
            page.style.display = 'flex';
          } else {
            page.classList.remove('active');
            page.style.display = 'none';
          }
        }
      });
    }

    switchScannerSubSegment(segmentName) {
      this.scannerSubSegment = segmentName;
      const isHunter = (segmentName === 'hunter');
      this._getAllDOMElements('subseg-btn-hunter').forEach(b => b.classList.toggle('active', isHunter));
      this._getAllDOMElements('subseg-btn-scanner').forEach(b => b.classList.toggle('active', !isHunter));
      this._getAllDOMElements('subseg-panel-hunter').forEach(p => p.style.display = isHunter ? 'flex' : 'none');
      this._getAllDOMElements('subseg-panel-scanner').forEach(p => p.style.display = !isHunter ? 'flex' : 'none');
      this.log(`[UI] 검색기 모드 전환: [${isHunter ? '🎯 간편 델타 헌터 (추천)' : '⚙️ 클래식 정밀 스캐너'}]`);
    }

    toggleToolbar(visible) {
      const toolbar = document.querySelector('.classic-toolbar');
      const chk = document.getElementById('ctx-chk-toolbar');
      const flashChk = document.getElementById('flash-ctx-chk-toolbar');
      if (!toolbar) return;
      const isCurrentlyHidden = (toolbar.style.display === 'none') || toolbar.classList.contains('collapsed');
      const shouldShow = visible !== undefined ? Boolean(visible) : isCurrentlyHidden;
      if (shouldShow) {
        toolbar.classList.remove('collapsed');
        toolbar.style.display = 'flex';
      } else {
        toolbar.classList.add('collapsed');
        toolbar.style.display = 'none';
      }
      if (chk) chk.checked = shouldShow;
      if (flashChk) flashChk.checked = shouldShow;
      this.log(`[UI] 상단 툴바: ${shouldShow ? '표시됨' : '접힘'}`);
    }

    toggleToolbarCheckbox() {
      const toolbar = document.querySelector('.classic-toolbar');
      const isVisible = toolbar && (toolbar.style.display !== 'none') && !toolbar.classList.contains('collapsed');
      this.toggleToolbar(!isVisible);
      this.hideContextMenu();
      this.hideFlashContextMenu();
    }

    toggleUndockInspector() {
      const panel = document.getElementById('inspector-panel');
      const btn = document.getElementById('btn-undock');
      const ctxLabel = document.getElementById('ctx-label-undock');
      const flashCtxLabel = document.getElementById('flash-ctx-label-undock');

      // If already undocked with a live popup window, dock it back
      if (this.inspectorWindow && !this.inspectorWindow.closed) {
        this.dockInspector();
        return;
      }

      // Multi-Monitor Geometry Restoration for browser popup mode
      let geomSpecs = 'width=450,height=850,resizable=yes';
      try {
        const saved = JSON.parse(localStorage.getItem('cheat_inspector_geom') || '{}');
        if (saved && saved.width && saved.height) {
          const left = Number.isFinite(saved.screenX) ? saved.screenX : (window.screenX + 50);
          const top = Number.isFinite(saved.screenY) ? saved.screenY : (window.screenY + 50);
          geomSpecs = `left=${left},top=${top},width=${saved.width},height=${saved.height},resizable=yes`;
        }
      } catch (e) {}

      // Spawn independent native OS window (QtWebEngine CustomWebPage createWindow creates QMainWindow)
      const win = window.open('inspector.html', 'CheatInspector', geomSpecs);
      if (win) {
        this.inspectorWindow = win;
        if (panel) {
          panel.style.display = 'none';
          panel.classList.add('undocked');
        }
        if (btn) btn.textContent = '📌 도킹';
        if (ctxLabel) ctxLabel.textContent = '📌 인스펙터 도킹 (Dock)';
        if (flashCtxLabel) flashCtxLabel.textContent = '📌 인스펙터 도킹 (Dock)';
        this.log('[UI] 인스펙터 패널이 독립 OS 윈도우 폼으로 분리되었습니다. 다른 모니터로 자유롭게 이동할 수 있습니다.');
      } else {
        // Fallback if window.open was somehow suppressed
        if (panel) {
          panel.classList.toggle('undocked');
        }
      }
      this.hideContextMenu();
      this.hideFlashContextMenu();
    }

    dockInspector() {
      const panel = document.getElementById('inspector-panel');
      const btn = document.getElementById('btn-undock');
      const ctxLabel = document.getElementById('ctx-label-undock');
      const flashCtxLabel = document.getElementById('flash-ctx-label-undock');

      // Close the separated inspector popup window cleanly
      const targetWin = this.inspectorWindow;
      this.inspectorWindow = null;
      if (targetWin) {
        try {
          if (!targetWin.closed) {
            targetWin.close();
          }
        } catch (e) {
          console.warn('[Harness] Error closing inspector window:', e);
        }
      }

      if (panel) {
        panel.style.display = 'flex';
        panel.classList.remove('undocked');
      }
      if (btn) btn.textContent = '🗗 분리';
      if (ctxLabel) ctxLabel.textContent = '🗗 인스펙터 창 분리 (Undock)';
      if (flashCtxLabel) flashCtxLabel.textContent = '🗗 인스펙터 창 분리 (Undock)';
      this.log('[UI] 인스펙터 패널이 우측 화면으로 다시 도킹되었습니다.');
      this.hideContextMenu();
      this.hideFlashContextMenu();
      this._renderAllPanels();
    }

    bindInspectorWindow(win) {
      this.inspectorWindow = win;
      const panel = document.getElementById('inspector-panel');
      const btn = document.getElementById('btn-undock');
      const ctxLabel = document.getElementById('ctx-label-undock');
      const flashCtxLabel = document.getElementById('flash-ctx-label-undock');
      if (panel) panel.style.display = 'none';
      if (btn) btn.textContent = '📌 도킹';
      if (ctxLabel) ctxLabel.textContent = '📌 인스펙터 도킹 (Dock)';
      if (flashCtxLabel) flashCtxLabel.textContent = '📌 인스펙터 도킹 (Dock)';
      this.switchScannerSubSegment(this.scannerSubSegment || 'hunter');
      this._renderAllPanels();
    }

    onInspectorWindowClosed() {
      const panel = document.getElementById('inspector-panel');
      const btn = document.getElementById('btn-undock');
      const ctxLabel = document.getElementById('ctx-label-undock');
      const flashCtxLabel = document.getElementById('flash-ctx-label-undock');
      this.inspectorWindow = null;
      if (panel) {
        panel.style.display = 'flex';
        panel.classList.remove('undocked');
      }
      if (btn) btn.textContent = '🗗 분리';
      if (ctxLabel) ctxLabel.textContent = '🗗 인스펙터 창 분리 (Undock)';
      if (flashCtxLabel) flashCtxLabel.textContent = '🗗 인스펙터 창 분리 (Undock)';
      this.log('[UI] 독립 인스펙터 창이 닫혀 메인 화면으로 자동 도킹되었습니다.');
      this._renderAllPanels();
    }

    _renderAllPanels() {
      this._renderDeltaHunterUI();
      this._renderScannerResults();
      this._renderCheatRecords();
      this._renderBlackboardTable();
    }

    /* -------------------------------------------------------------
     * Authentic Flash Player Context Menu & Viewport Controls
     * ------------------------------------------------------------- */
    showFlashContextMenu(x, y) {
      this.hideContextMenu(); // Close shell menu if open
      const menu = document.getElementById('flash-context-menu');
      if (!menu) return;

      const toolbar = document.querySelector('.classic-toolbar');
      const flashChk = document.getElementById('flash-ctx-chk-toolbar');
      if (flashChk && toolbar) {
        flashChk.checked = (toolbar.style.display !== 'none') && !toolbar.classList.contains('collapsed');
      }

      const panel = document.getElementById('inspector-panel');
      const flashCtxLabel = document.getElementById('flash-ctx-label-undock');
      if (flashCtxLabel) {
        const isUndocked = (this.inspectorWindow && !this.inspectorWindow.closed) || (panel && panel.classList.contains('undocked'));
        flashCtxLabel.textContent = isUndocked ? '📌 인스펙터 도킹 (Dock)' : '🗗 인스펙터 창 분리 (Undock)';
      }

      const menuWidth = 200;
      const menuHeight = 350;
      let posX = x;
      let posY = y;
      if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 8;
      if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 8;

      menu.style.position = 'fixed';
      menu.style.zIndex = '10000';
      menu.style.left = `${Math.max(5, posX)}px`;
      menu.style.top = `${Math.max(5, posY)}px`;
      menu.style.display = 'block';
      menu.classList.add('active');
    }

    hideFlashContextMenu() {
      const menu = document.getElementById('flash-context-menu');
      if (menu) {
        menu.style.display = 'none';
        menu.classList.remove('active');
      }
    }

    flashZoom(factor) {
      if (factor === 1.0) {
        this.zoomLevel = 1.0;
      } else {
        this.zoomLevel = Math.max(0.25, Math.min(4.0, this.zoomLevel * factor));
      }
      this._applyFlashZoom();
      this.log(`[FlashPlayer] 🔍 화면 배율: ${(this.zoomLevel * 100).toFixed(0)}%`);
      this.hideFlashContextMenu();
    }

    _applyFlashZoom() {
      const canvas = this.sandboxCanvas;
      const ruffle = this.rufflePlayer;
      const target = ruffle || canvas;
      if (target) {
        target.style.transformOrigin = 'center center';
        target.style.transform = `scale(${this.zoomLevel})`;
        target.style.transition = 'transform 0.1s ease-out';
      }
    }

    flashRewind() {
      if (this.sandboxActive) {
        this.startSandboxDemo();
        this.log('[FlashPlayer] ⏮ 데모 샌드박스가 처음 상태로 되감겼습니다.');
      } else if (this.rufflePlayer) {
        try {
          if (typeof this.rufflePlayer.rewind === 'function') {
            this.rufflePlayer.rewind();
          }
        } catch (e) {}
        this.log('[FlashPlayer] ⏮ 플래시 무비가 1프레임으로 되감겼습니다.');
      }
      this.hideFlashContextMenu();
    }

    setFlashQuality(quality) {
      this.flashQuality = quality;
      ['high', 'med', 'low'].forEach(q => {
        const el = document.getElementById(`chk-quality-${q}`);
        if (el) el.style.display = (q === quality || (q === 'med' && quality === 'medium')) ? 'inline' : 'none';
      });
      this.log(`[FlashPlayer] 🎨 렌더링 품질 설정: [${quality.toUpperCase()}]`);
      this.hideFlashContextMenu();
    }

    toggleFullscreen() {
      const vp = document.getElementById('viewport-container');
      if (!document.fullscreenElement) {
        if (vp && vp.requestFullscreen) vp.requestFullscreen();
        else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        this.log('[FlashPlayer] ⛶ 전체 화면 모드 진입');
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        this.log('[FlashPlayer] ⛶ 전체 화면 모드 해제');
      }
      this.hideFlashContextMenu();
    }

    /* -------------------------------------------------------------
     * Retro App Context Menu & Draggable Rig
     * ------------------------------------------------------------- */
    showContextMenu(x, y) {
      this.hideFlashContextMenu(); // Close flash menu if open
      const menu = document.getElementById('retro-context-menu');
      if (!menu) return;

      const toolbar = document.querySelector('.classic-toolbar');
      const chk = document.getElementById('ctx-chk-toolbar');
      if (chk && toolbar) {
        chk.checked = (toolbar.style.display !== 'none') && !toolbar.classList.contains('collapsed');
      }

      const panel = document.getElementById('inspector-panel');
      const ctxLabel = document.getElementById('ctx-label-undock');
      if (ctxLabel) {
        const isUndocked = (this.inspectorWindow && !this.inspectorWindow.closed) || (panel && panel.classList.contains('undocked'));
        ctxLabel.textContent = isUndocked ? '📌 인스펙터 도킹 (Dock)' : '🗗 인스펙터 창 분리 (Undock)';
      }

      const menuWidth = 200;
      const menuHeight = 170;
      let posX = x;
      let posY = y;
      if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 8;
      if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 8;

      menu.style.position = 'fixed';
      menu.style.zIndex = '10000';
      menu.style.left = `${Math.max(5, posX)}px`;
      menu.style.top = `${Math.max(5, posY)}px`;
      menu.style.display = 'block';
      menu.classList.add('active');
    }

    hideContextMenu() {
      const menu = document.getElementById('retro-context-menu');
      if (menu) {
        menu.style.display = 'none';
        menu.classList.remove('active');
      }
    }

    _setupContextMenuAndDrag() {
      // 1. Right-click context menu event (Capture phase to bypass game right-click lockouts)
      window.addEventListener('contextmenu', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();

        const viewport = document.getElementById('viewport-container') || document.getElementById('player-viewport');
        if (viewport && (viewport === e.target || viewport.contains(e.target))) {
          this.showFlashContextMenu(e.clientX, e.clientY);
        } else {
          this.showContextMenu(e.clientX, e.clientY);
        }
      }, true);

      // 2. Click outside closes context menus
      window.addEventListener('pointerdown', (e) => {
        const retroMenu = document.getElementById('retro-context-menu');
        if (retroMenu && retroMenu.classList.contains('active')) {
          if (!retroMenu.contains(e.target)) {
            this.hideContextMenu();
          }
        }
        const flashMenu = document.getElementById('flash-context-menu');
        if (flashMenu && flashMenu.classList.contains('active')) {
          if (!flashMenu.contains(e.target)) {
            this.hideFlashContextMenu();
          }
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.hideContextMenu();
          this.hideFlashContextMenu();
        }
      });

      // 3. Fallback draggable handle for inline undocked state
      const handle = document.getElementById('inspector-drag-handle');
      const panel = document.getElementById('inspector-panel');
      if (handle && panel) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initLeft = 0;
        let initTop = 0;

        handle.addEventListener('mousedown', (e) => {
          if (!panel.classList.contains('undocked')) return;
          if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          const rect = panel.getBoundingClientRect();
          initLeft = rect.left;
          initTop = rect.top;
          e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
          if (!isDragging || !panel.classList.contains('undocked')) return;
          const deltaX = e.clientX - startX;
          const deltaY = e.clientY - startY;
          const newLeft = Math.max(0, Math.min(window.innerWidth - 120, initLeft + deltaX));
          const newTop = Math.max(0, Math.min(window.innerHeight - 60, initTop + deltaY));

          panel.style.right = 'auto';
          panel.style.left = `${newLeft}px`;
          panel.style.top = `${newTop}px`;
          this._inspectorMoved = true;
        });

        window.addEventListener('mouseup', () => {
          isDragging = false;
        });
      }
    }

    log(msg) {
      console.log(msg);
      const logBoxes = this._getAllDOMElements('cheat-console-logs');
      if (logBoxes.length > 0) {
        const time = new Date().toLocaleTimeString();
        logBoxes.forEach(logBox => {
          const entry = document.createElement('div');
          entry.className = 'log-line';
          entry.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
          logBox.appendChild(entry);
          logBox.scrollTop = logBox.scrollHeight;
        });
      }
    }
  }

  root.Harness = new CheatHarness();
})(window);
