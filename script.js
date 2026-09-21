(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const hitBtn = document.getElementById("hitBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const restartBtn = document.getElementById("restartBtn");
  const statusEl = document.getElementById("status");

  const W = canvas.width;
  const H = canvas.height;

  let paused = false;
  let gameOver = false;
  let playerScore = 0;
  let cpuScore = 0;
  let serveTimer = 0;
  let pointPause = 0;
  let flashTimer = 0;
  let flashColor = "rgba(255,255,255,0)";
  let lastTime = performance.now();

  // この1フラグが難易度修正の核心です。
  // CPU側に飛んだ「1球につき1回だけ」返球判定します。
  let cpuAttemptedThisVisit = false;
  let lastShotQuality = 0;

  const ball = {
    x: W * 0.5,
    y: H * 0.4,
    vx: 0,
    vy: 0,
    r: 14
  };

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function serve(toPlayer = true) {
    ball.x = W * 0.50;
    ball.y = H * 0.38;
    ball.vx = (toPlayer ? -1 : 1) * W * 0.16;
    ball.vy = -H * 0.11;

    serveTimer = 0.55;
    pointPause = 0;
    lastShotQuality = 0;

    // 新しいラリーなのでCPU判定をリセット
    cpuAttemptedThisVisit = false;
  }

  function resetGame() {
    paused = false;
    gameOver = false;
    playerScore = 0;
    cpuScore = 0;
    pauseBtn.textContent = "一時停止";
    setStatus("ボールが自分の近くに来たらタップ。7点先取です。");
    serve(true);
  }

  function scorePoint(who) {
    if (gameOver || pointPause > 0) return;

    if (who === "player") {
      playerScore += 1;
      flashColor = "rgba(34,197,94,.16)";
      setStatus("👏 あなたのポイント！");
    } else {
      cpuScore += 1;
      flashColor = "rgba(245,158,11,.16)";
      setStatus("CPUのポイント");
    }

    flashTimer = 0.25;
    pointPause = 0.8;

    if (playerScore >= 7 || cpuScore >= 7) {
      gameOver = true;
      setStatus(
        playerScore > cpuScore
          ? "🎉 優勝！ ナオコバースデー杯制覇！"
          : "惜しい！ CPUの勝利。もう一戦！"
      );
      return;
    }

    window.setTimeout(() => {
      if (!gameOver) serve(who !== "player");
    }, 650);
  }

  function tryHit() {
    if (paused || gameOver || serveTimer > 0 || pointPause > 0) return;

    const playerX = W * 0.27;
    const playerY = H * 0.79;
    const reach = W * 0.15;
    const distance = Math.hypot(ball.x - playerX, ball.y - playerY);

    if (ball.x < W * 0.48 && distance < reach) {
      const quality = clamp(1 - distance / reach, 0, 1);
      lastShotQuality = quality;

      ball.vx = W * (0.36 + quality * 0.17);
      ball.vy = -H * (0.60 + quality * 0.17);

      // プレイヤーが返した瞬間に、次のCPU側訪問で1回だけ抽選可能にする
      cpuAttemptedThisVisit = false;

      if (quality >= 0.72) {
        setStatus("🔥 PERFECT！ CPUがかなり取りにくい！");
      } else if (quality >= 0.38) {
        setStatus("✨ ナイス返球！");
      } else {
        setStatus("返した！");
      }
    } else {
      setStatus("まだ届かない！");
    }
  }

  function cpuReturnChance(quality) {
    // quality 0.00 → 約70%
    // quality 0.40 → 約50%
    // quality 0.75 → 約31%
    // quality 1.00 → 約28%（下限）
    return clamp(0.70 - 0.50 * quality, 0.28, 0.70);
  }

  function update(dt) {
    if (paused || gameOver) return;

    if (pointPause > 0) {
      pointPause = Math.max(0, pointPause - dt);
      return;
    }

    if (serveTimer > 0) {
      serveTimer = Math.max(0, serveTimer - dt);
      return;
    }

    ball.vy += H * 1.02 * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    const floorY = H * 0.85;
    const netX = W * 0.50;
    const netTop = H * 0.49;

    // 着地
    if (ball.y + ball.r >= floorY) {
      scorePoint(ball.x < netX ? "cpu" : "player");
      return;
    }

    // 画面左右の安全処理
    if (ball.x - ball.r <= 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
    }

    if (ball.x + ball.r >= W) {
      ball.x = W - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }

    // ネット衝突
    if (
      Math.abs(ball.x - netX) < ball.r + 8 &&
      ball.y + ball.r > netTop
    ) {
      ball.vx *= -0.72;
      ball.x += ball.vx > 0 ? ball.r + 4 : -(ball.r + 4);
    }

    // CPUの返球判定
    const cpuX = W * 0.73;
    const cpuY = H * 0.79;
    const cpuReach = W * 0.14;
    const cpuDistance = Math.hypot(ball.x - cpuX, ball.y - cpuY);

    const ballIsEnteringCpuZone =
      ball.x > W * 0.54 &&
      ball.vx > 0 &&
      ball.vy > 0 &&
      cpuDistance < cpuReach;

    // 重要：
    // 範囲内にいる毎フレームではなく、1球につき一度だけ判定する。
    if (ballIsEnteringCpuZone && !cpuAttemptedThisVisit) {
      cpuAttemptedThisVisit = true;

      const chance = cpuReturnChance(lastShotQuality);
      const cpuSucceeded = Math.random() < chance;

      if (cpuSucceeded) {
        ball.vx = -W * (0.32 + Math.random() * 0.09);
        ball.vy = -H * (0.54 + Math.random() * 0.09);
        lastShotQuality = 0;
        setStatus("CPUが返した！");
      } else {
        // 失敗時は何もしない。
        // そのまま落ちればプレイヤーの得点になる。
        setStatus("CPUが取り損ねた！");
      }
    }

    flashTimer = Math.max(0, flashTimer - dt);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGym() {
    ctx.save();

    roundedRect(10, 10, W - 20, H - 20, 32);
    ctx.clip();

    // 上壁
    ctx.fillStyle = "#e8ddd1";
    ctx.fillRect(0, 0, W, 300);

    // 窓
    drawWindow(70, 40, 150, 120);
    drawWindow(W - 220, 40, 150, 120);

    // 手すり
    ctx.fillStyle = "#666e76";
    ctx.fillRect(35, 168, W - 70, 6);
    for (let x = 55; x < W - 40; x += 55) {
      ctx.fillRect(x, 174, 4, 34);
    }

    // 木壁
    ctx.fillStyle = "#c99656";
    ctx.fillRect(0, 285, W, 170);
    ctx.fillStyle = "rgba(117,78,38,.16)";
    for (let x = 0; x < W; x += 22) {
      ctx.fillRect(x, 285, 2, 170);
    }

    drawDoor(85, 350, 145, 126);
    drawDoor(W - 230, 350, 145, 126);

    // 採光
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#fff7d6";
    for (let i = 0; i < 5; i++) {
      const x = 520 + i * 110;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x + 85, 10);
      ctx.lineTo(x - 75, 340);
      ctx.lineTo(x - 155, 340);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 床
    const floorTop = 455;
    const floorGradient = ctx.createLinearGradient(0, floorTop, 0, H);
    floorGradient.addColorStop(0, "#d8a86c");
    floorGradient.addColorStop(1, "#efcb91");
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, floorTop, W, H - floorTop);

    ctx.strokeStyle = "rgba(130,83,35,.15)";
    ctx.lineWidth = 2;

    for (let y = floorTop; y < H; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    for (let x = 30; x < W; x += 58) {
      ctx.beginPath();
      ctx.moveTo(x, floorTop);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // コート線
    ctx.strokeStyle = "rgba(255,255,255,.87)";
    ctx.lineWidth = 5;
    ctx.strokeRect(85, 520, W - 170, 155);

    ctx.beginPath();
    ctx.moveTo(W / 2, 520);
    ctx.lineTo(W / 2, 675);
    ctx.stroke();

    ctx.restore();

    ctx.strokeStyle = "#d3d3d3";
    ctx.lineWidth = 3;
    roundedRect(10, 10, W - 20, H - 20, 32);
    ctx.stroke();
  }

  function drawWindow(x, y, w, h) {
    ctx.fillStyle = "#c9d8e8";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "#727b83";
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + (w / 4) * i, y);
      ctx.lineTo(x + (w / 4) * i, y + h);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(173,210,157,.55)";
    ctx.fillRect(x + 4, y + h * 0.65, w - 8, h * 0.31);
  }

  function drawDoor(x, y, w, h) {
    ctx.fillStyle = "#cbc9cd";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "#918e93";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.stroke();
  }

  function drawBanner() {
    const x = 300;
    const y = 75;
    const w = 680;
    const h = 145;

    // ロープ
    ctx.strokeStyle = "#735f47";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 10);
    ctx.lineTo(x - 35, y - 32);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w - 15, y + 10);
    ctx.lineTo(x + w + 35, y - 32);
    ctx.stroke();

    // 布
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#9e1727");
    g.addColorStop(0.5, "#c62032");
    g.addColorStop(1, "#8d1421");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y + 14);
    ctx.quadraticCurveTo(x + w * 0.25, y - 5, x + w * 0.5, y + 4);
    ctx.quadraticCurveTo(x + w * 0.75, y + 13, x + w, y + 5);
    ctx.lineTo(x + w - 10, y + h - 6);
    ctx.quadraticCurveTo(x + w * 0.5, y + h + 12, x + 12, y + h - 3);
    ctx.closePath();
    ctx.fill();

    // 金のかすれ
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.strokeStyle = "#e4b447";
    ctx.lineWidth = 7;

    [
      [335, 118, 435, 88],
      [515, 110, 645, 80],
      [720, 120, 835, 90],
      [835, 175, 940, 145],
      [385, 195, 485, 164],
      [675, 192, 770, 159]
    ].forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    ctx.restore();

    // 文字
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 58px "Yu Mincho", "Hiragino Mincho ProN", serif';

    ctx.fillStyle = "#211820";
    ctx.fillText("ナオコバースデー杯", x + w / 2 + 5, y + 76);

    ctx.fillStyle = "#f8f5ef";
    ctx.fillText("ナオコバースデー杯", x + w / 2, y + 71);
  }

  function drawScoreboard() {
    const x = 365;
    const y = 286;
    const w = 170;
    const h = 92;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.22)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = "#30453d";
    roundedRect(x, y, w, h, 6);
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = "#203129";
    ctx.lineWidth = 4;
    roundedRect(x, y, w, h, 6);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,.26)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 8);
    ctx.lineTo(x + w / 2, y + h - 8);
    ctx.stroke();

    drawFlipCard(x + 14, y + 13, 57, 64, playerScore);
    drawFlipCard(x + 99, y + 13, 57, 64, cpuScore);
  }

  function drawFlipCard(x, y, w, h, number) {
    ctx.fillStyle = "#f1ece4";
    roundedRect(x, y, w, h, 4);
    ctx.fill();

    ctx.strokeStyle = "#7c756d";
    ctx.lineWidth = 2;
    roundedRect(x, y, w, h, 4);
    ctx.stroke();

    // めくりカードの中央の境目
    ctx.strokeStyle = "rgba(0,0,0,.14)";
    ctx.beginPath();
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();

    // リング
    ctx.strokeStyle = "#bebbb6";
    ctx.lineWidth = 3;
    [x + 13, x + w - 13].forEach((hx) => {
      ctx.beginPath();
      ctx.moveTo(hx, y);
      ctx.lineTo(hx, y - 12);
      ctx.stroke();

      ctx.fillStyle = "#777";
      ctx.beginPath();
      ctx.arc(hx, y - 12, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.fillStyle = "#1f2937";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 47px system-ui, sans-serif";
    ctx.fillText(String(number), x + w / 2, y + h / 2 + 2);
  }

  function drawNet() {
    const x = W * 0.5;
    const floorY = H * 0.85;
    const topY = H * 0.49;

    ctx.fillStyle = "#777b80";
    ctx.fillRect(x - 6, topY, 12, floorY - topY);

    ctx.fillStyle = "#a7a9ad";
    for (let i = 0; i < 7; i++) {
      const y = topY + 24 + i * 40;
      ctx.fillRect(x - 48, y, 96, 4);
    }
  }

  function drawStickFigure(x, y, color, label, mirror = false) {
    ctx.save();

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.arc(x, y - 72, 24, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y - 46);
    ctx.lineTo(x, y + 20);

    ctx.moveTo(x, y - 22);
    ctx.lineTo(x + (mirror ? -58 : 58), y - 40);

    ctx.moveTo(x, y + 20);
    ctx.lineTo(x - 28, y + 56);

    ctx.moveTo(x, y + 20);
    ctx.lineTo(x + 28, y + 56);

    ctx.stroke();

    ctx.fillStyle = "#57575d";
    ctx.font = "700 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 122);

    ctx.restore();
  }

  function drawBall() {
    if (serveTimer > 0 || pointPause > 0 || gameOver) return;

    ctx.fillStyle = "#f3f0e9";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.68, -0.25, 1.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r * 0.68, 2.35, 4.55);
    ctx.stroke();
  }

  function drawOverlay() {
    if (flashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, flashTimer * 2.5);
      ctx.fillStyle = flashColor;
      roundedRect(10, 10, W - 20, H - 20, 32);
      ctx.fill();
      ctx.restore();
    }

    if (paused || gameOver) {
      ctx.save();

      ctx.fillStyle = "rgba(0,0,0,.24)";
      roundedRect(10, 10, W - 20, H - 20, 32);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "700 58px system-ui, sans-serif";
      ctx.fillText(
        gameOver
          ? (playerScore > cpuScore ? "YOU WIN!" : "GAME OVER")
          : "PAUSE",
        W / 2,
        H * 0.43
      );

      if (gameOver) {
        ctx.font = "600 23px system-ui, sans-serif";
        ctx.fillText("「最初から」で再戦できます", W / 2, H * 0.50);
      }

      ctx.restore();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    drawGym();
    drawBanner();
    drawScoreboard();
    drawNet();
    drawStickFigure(W * 0.27, H * 0.78, "#2eb24e", "YOU", false);
    drawStickFigure(W * 0.73, H * 0.78, "#e1b22d", "CPU", true);
    drawBall();
    drawOverlay();
  }

  function frame(now) {
    const dt = Math.min(0.032, (now - lastTime) / 1000 || 0);
    lastTime = now;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  hitBtn.addEventListener("click", tryHit);
  canvas.addEventListener("pointerdown", tryHit);

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "再開" : "一時停止";
    setStatus(paused ? "一時停止中" : "試合再開！");
    lastTime = performance.now();
  });

  restartBtn.addEventListener("click", resetGame);

  // PCでもスペースキーで返球できます
  window.addEventListener("keydown", (event) => {
    if (
      event.code === "Space" &&
      event.target.tagName !== "BUTTON" &&
      event.target.tagName !== "INPUT" &&
      event.target.tagName !== "TEXTAREA"
    ) {
      event.preventDefault();
      tryHit();
    }
  });

  resetGame();
  requestAnimationFrame(frame);
})();
