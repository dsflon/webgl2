// Shared fake-camera test scenes for verify_runtime / selftest.
// Injected via Playwright addInitScript — each export must be self-contained.
//
// The scene follows the order-document convention (§9.2 of
// prompts/fable5_papercraft-cam_order.md): strong monocular depth cues
// (occlusion, relative size, linear perspective, horizon), a face-like
// structure, dark/bright extremes, and one vivid accent object.
// Everything is STATIC and redrawn identically each frame so that the
// flicker check measures the artwork, not the input.

export function fakeCameraInit() {
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement("canvas");
    c.width = 1280;
    c.height = 720;
    const x = c.getContext("2d");
    function tree(px, py, s, col) {
      x.fillStyle = "#4a3524";
      x.fillRect(px - 6 * s, py - 90 * s, 12 * s, 90 * s);
      x.fillStyle = col;
      x.beginPath();
      x.arc(px, py - 110 * s, 45 * s, 0, Math.PI * 2);
      x.arc(px - 30 * s, py - 85 * s, 32 * s, 0, Math.PI * 2);
      x.arc(px + 30 * s, py - 85 * s, 32 * s, 0, Math.PI * 2);
      x.fill();
    }
    function draw() {
      // 1. far: gradient sky + bright sun (static)
      const sky = x.createLinearGradient(0, 0, 0, 400);
      sky.addColorStop(0, "#aee3f5");
      sky.addColorStop(1, "#e8f4d9");
      x.fillStyle = sky;
      x.fillRect(0, 0, 1280, 400);
      x.fillStyle = "#fff3c4";
      x.beginPath();
      x.arc(980, 120, 55, 0, Math.PI * 2);
      x.fill();
      // 2. mid: ground + road to a vanishing point + trees at two depths
      x.fillStyle = "#8fae6b";
      x.fillRect(0, 400, 1280, 320);
      x.fillStyle = "#c8b98d";
      x.beginPath();
      x.moveTo(560, 400);
      x.lineTo(720, 400);
      x.lineTo(980, 720);
      x.lineTo(220, 720);
      x.closePath();
      x.fill();
      tree(180, 430, 0.55, "#5d8a4a");
      tree(1130, 520, 1.1, "#4a7a3c");
      // 3. near: face-like structure (skin ellipse, eyes, nose, mouth,
      //    hair, shoulders) + a vivid accent scarf
      x.fillStyle = "#3a3330";
      x.beginPath();
      x.ellipse(500, 660, 260, 130, 0, Math.PI, 0);
      x.fill();
      x.fillStyle = "#2e2622";
      x.beginPath();
      x.ellipse(500, 385, 150, 165, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#e8b98f";
      x.beginPath();
      x.ellipse(500, 430, 120, 150, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#2a2118";
      x.beginPath();
      x.ellipse(455, 405, 16, 10, 0, 0, Math.PI * 2);
      x.ellipse(545, 405, 16, 10, 0, 0, Math.PI * 2);
      x.fill();
      x.strokeStyle = "#b57c54";
      x.lineWidth = 6;
      x.beginPath();
      x.moveTo(500, 430);
      x.lineTo(492, 470);
      x.stroke();
      x.strokeStyle = "#8e4a3a";
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(462, 510);
      x.quadraticCurveTo(500, 530, 538, 510);
      x.stroke();
      x.fillStyle = "#e2622b";
      x.fillRect(430, 560, 140, 36);
      // 4. nearest: grass silhouette fringe across the bottom edge
      x.fillStyle = "#1d3a20";
      x.beginPath();
      x.moveTo(0, 720);
      for (let gx = 0; gx <= 1280; gx += 32) {
        x.lineTo(gx + 16, 640 + 24 * Math.sin(gx * 0.11));
        x.lineTo(gx + 32, 700);
      }
      x.lineTo(1280, 720);
      x.closePath();
      x.fill();
      // Redraw identical content each frame: captureStream needs a dirty
      // canvas to deliver frames, and identical content keeps it static.
      requestAnimationFrame(draw);
    }
    draw();
    return c.captureStream(30);
  };
}

export function deniedCameraInit() {
  navigator.mediaDevices.getUserMedia = async () => {
    const e = new Error("denied by verifier");
    e.name = "NotAllowedError";
    throw e;
  };
}
