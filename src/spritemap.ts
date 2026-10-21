// Sprite map for Sprite_Sheet_Cat_-_Aichan_owo.png (one row per animation).
//
// drawX
//   The sheet's frame cells have varying widths, so each frame is shifted right by
//   `drawX` to keep the body planted. For the stand / sit / sleep / eat rows,
//   drawX = 23 - (front-paw x inside the cell): the paws land on canvas x=23
//   (= canvasAnchorX) in every frame of every one of these animations.
//
// canvasW
//   Rightmost visible pixel + 1 (whiskers included; alpha <= 10 is ignored).
//   It only prevents clipping and has no effect on alignment.
//
// Window positioning (recompute on every state change)
//   windowX = screenAnchorX - canvasAnchorX
//   windowY = screenGroundY - groundY
//
// Usage
//   const anim  = SPRITE_MAP[state]
//   const frame = anim.frames[frameIndex]
//   canvas.width = anim.canvasW;  canvas.height = anim.h
//   ctx.clearRect(0, 0, anim.canvasW, anim.h)
//   ctx.drawImage(sheet, frame.x, anim.y, frame.w, anim.h,
//                        frame.drawX, 0,  frame.w, anim.h)   // scale dest size for 2x/3x

export type AnimationState =
  | 'standToSit'
  | 'sitIdle'
  | 'sitToStand'
  | 'standToSleep'
  | 'sleepIdle'
  | 'sleepToStand'
  | 'standIdle'
  | 'eat'
  | 'walk'
  | 'run'
  | 'prepareStealth'
  | 'stealth'
  | 'cancelStealth'
  | 'jump'
  | 'attack'
  | 'loopAttack'
  | 'jumpIntoBox'
  | 'pushHandUp'
  | 'playBox'
  | 'pushHandDown'
  | 'earUp'
  | 'scan'
  | 'earDown'
  | 'jumpOutOfBox'

export interface EyePos {
  x: number  // canvas x, drawX already included
  y: number  // canvas y, from the top of the row
}

export interface SpriteFrame {
  x:         number   // source x of this frame's cell on the sheet
  w:         number   // source cell width
  drawX:     number   // canvas x shift, see header
  leftEye?:  EyePos   // per-frame eye; overrides the row-level one
  rightEye?: EyePos
}

export interface SpriteRow {
  y:       number     // source y of the row on the sheet
  h:       number     // row height (= canvas height)
  canvasW: number     // canvas width, see header
  groundY: number     // canvas row of the paws' bottom edge (tail excluded; it droops lower)
  canvasAnchorX: number
  // Canvas x that gets pinned to screenAnchorX.
  //   stand/sit/sleep/eat rows: 23, the front-paw x (shared, so nothing shifts on state change)
  //   box rows: the box's left edge (jumpIntoBox 3, the other box rows 0)
  //   walk, run, jump, stealth, attack...: still canvasW - 1 (not converted yet)
  frames:    SpriteFrame[]
  leftEye?:  EyePos   // row-level eye, used when every frame is the same
  rightEye?: EyePos
  // Eyes are the orange iris pixel. Renderer: const le = frame.leftEye ?? anim.leftEye
  // No eye defined for a frame = eyes closed or hidden, draw no pupils.
}

export const SPRITE_MAP: Record<AnimationState, SpriteRow> = {
  standToSit: {
    y: 9, h: 20, canvasW: 29, groundY: 17, canvasAnchorX: 23,
    frames: [
      { x: 5,   w: 30, drawX: 4, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 35,  w: 34, drawX: 1, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 69,  w: 34, drawX: 2, leftEye: { x: 21, y: 9 }, rightEye: { x: 24, y: 8 } },
      { x: 103, w: 26, drawX: 3, leftEye: { x: 21, y: 10 }, rightEye: { x: 24, y: 9 } },
    ],
  },

  sitIdle: {
    y: 45, h: 16, canvasW: 30, groundY: 13, canvasAnchorX: 23,
    leftEye:  { x: 22, y: 6 },
    rightEye: { x: 25, y: 5 },
    frames: [
      { x: 4,   w: 33, drawX: 4 },
      { x: 37,  w: 33, drawX: 4 },
      { x: 70,  w: 33, drawX: 4 },
      { x: 103, w: 26, drawX: 4 },
    ],
  },

  sitToStand: {
    y: 73, h: 20, canvasW: 29, groundY: 16, canvasAnchorX: 23,
    frames: [
      { x: 4,   w: 32, drawX: 2, leftEye: { x: 20, y: 10 }, rightEye: { x: 23, y: 9 } },
      { x: 36,  w: 31, drawX: 2, leftEye: { x: 21, y: 9 }, rightEye: { x: 24, y: 8 } },
      { x: 67,  w: 37, drawX: 0, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 104, w: 25, drawX: 4, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
    ],
  },

  standToSleep: {
    y: 105, h: 20, canvasW: 29, groundY: 16, canvasAnchorX: 23,
    frames: [
      { x: 5,   w: 29, drawX: 4, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 34,  w: 35, drawX: 0, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 69,  w: 34, drawX: 2, leftEye: { x: 21, y: 9 }, rightEye: { x: 24, y: 8 } },
      { x: 103, w: 33, drawX: 3, leftEye: { x: 21, y: 10 }, rightEye: { x: 24, y: 9 } },
      { x: 136, w: 24, drawX: 3, leftEye: { x: 20, y: 11 }, rightEye: { x: 23, y: 11 } },
    ],
  },

  sleepIdle: {
    y: 133, h: 23, canvasW: 28, groundY: 20, canvasAnchorX: 23,
    frames: [
      { x: 4,   w: 33, drawX: 3 },
      { x: 37,  w: 33, drawX: 3 },
      { x: 70,  w: 33, drawX: 3 },
      { x: 103, w: 33, drawX: 3 },
      { x: 136, w: 25, drawX: 3 },
    ],
  },

  sleepToStand: {
    y: 169, h: 19, canvasW: 29, groundY: 16, canvasAnchorX: 23,
    frames: [
      { x: 4,   w: 33, drawX: 3, leftEye: { x: 20, y: 10 }, rightEye: { x: 23, y: 10 } },
      { x: 37,  w: 32, drawX: 3, leftEye: { x: 21, y: 9 }, rightEye: { x: 24, y: 8 } },
      { x: 69,  w: 31, drawX: 2, leftEye: { x: 21, y: 8 }, rightEye: { x: 24, y: 7 } },
      { x: 100, w: 37, drawX: 0, leftEye: { x: 21, y: 7 }, rightEye: { x: 24, y: 6 } },
      { x: 137, w: 25, drawX: 4, leftEye: { x: 21, y: 7 }, rightEye: { x: 24, y: 6 } },
    ],
  },

  standIdle: {
    y: 200, h: 21, canvasW: 29, groundY: 17, canvasAnchorX: 23,
    leftEye:  { x: 21, y: 8 },
    rightEye: { x: 24, y: 7 },
    frames: [
      { x: 5,   w: 31, drawX: 4 },
      { x: 36,  w: 31, drawX: 2 },
      { x: 67,  w: 35, drawX: 0 },
      { x: 102, w: 35, drawX: 2 },
      { x: 137, w: 25, drawX: 4 },
    ],
  },

  eat: {
    y: 226, h: 24, canvasW: 29, groundY: 23, canvasAnchorX: 23,
    frames: [
      { x: 1,   w: 35, drawX: 0, leftEye: { x: 22, y: 16 }, rightEye: { x: 25, y: 17 } },
      { x: 36,  w: 31, drawX: 2, leftEye: { x: 22, y: 15 }, rightEye: { x: 25, y: 16 } },
      { x: 67,  w: 35, drawX: 0, leftEye: { x: 22, y: 16 }, rightEye: { x: 25, y: 17 } },
      { x: 102, w: 27, drawX: 2, leftEye: { x: 22, y: 15 }, rightEye: { x: 25, y: 16 } },
    ],
  },

  walk: {
    y: 264, h: 18, canvasW: 27, groundY: 17, canvasAnchorX: 26,
    frames: [
      { x: 3,   w: 32, drawX: 1 },
      { x: 35,  w: 34, drawX: 0 },
      { x: 69,  w: 35, drawX: 1 },
      { x: 104, w: 31, drawX: 3 },
      { x: 135, w: 32, drawX: 1 },
      { x: 167, w: 34, drawX: 0 },
      { x: 201, w: 35, drawX: 1 },
      { x: 236, w: 25, drawX: 3 },
    ],
  },

  run: {
    y: 292, h: 22, canvasW: 27, groundY: 21, canvasAnchorX: 26,
    frames: [
      { x: 0,   w: 36, drawX: 0 },
      { x: 36,  w: 35, drawX: 0 },
      { x: 71,  w: 33, drawX: 2 },
      { x: 104, w: 25, drawX: 2 },
    ],
  },

  prepareStealth: {
    y: 328, h: 18, canvasW: 28, groundY: 17, canvasAnchorX: 27,
    frames: [
      { x: 5,  w: 28, drawX: 5 },
      { x: 33, w: 36, drawX: 0 },
      { x: 69, w: 27, drawX: 2 },
    ],
  },

  stealth: {
    y: 364, h: 14, canvasW: 25, groundY: 13, canvasAnchorX: 24,
    frames: [
      { x: 3,   w: 33, drawX: 2 },
      { x: 36,  w: 34, drawX: 2 },
      { x: 70,  w: 32, drawX: 3 },
      { x: 102, w: 33, drawX: 2 },
      { x: 135, w: 33, drawX: 2 },
      { x: 168, w: 34, drawX: 0 },
      { x: 202, w: 26, drawX: 3 },
    ],
  },

  cancelStealth: {
    y: 392, h: 17, canvasW: 29, groundY: 16, canvasAnchorX: 28,
    frames: [
      { x: 3,  w: 30, drawX: 3 },
      { x: 33, w: 38, drawX: 0 },
      { x: 71, w: 25, drawX: 6 },
    ],
  },

  jump: {
    y: 420, h: 22, canvasW: 27, groundY: 21, canvasAnchorX: 26,
    frames: [
      { x: 5,   w: 31, drawX: 2 },
      { x: 36,  w: 35, drawX: 1 },
      { x: 71,  w: 31, drawX: 2 },
      { x: 102, w: 35, drawX: 0 },
      { x: 137, w: 31, drawX: 2 },
      { x: 168, w: 30, drawX: 1 },
      { x: 198, w: 30, drawX: 0 },
    ],
  },

  attack: {
    y: 451, h: 22, canvasW: 24, groundY: 21, canvasAnchorX: 23,
    frames: [
      { x: 5,   w: 34, drawX: 0 },
      { x: 39,  w: 34, drawX: 4 },
      { x: 73,  w: 34, drawX: 5 },
      { x: 107, w: 33, drawX: 7 },
      { x: 140, w: 33, drawX: 8 },
      { x: 173, w: 33, drawX: 6 },
      { x: 206, w: 33, drawX: 3 },
      { x: 239, w: 33, drawX: 3 },
      { x: 272, w: 33, drawX: 3 },
      { x: 305, w: 32, drawX: 4 },
      { x: 337, w: 32, drawX: 5 },
      { x: 369, w: 32, drawX: 4 },
      { x: 401, w: 25, drawX: 0 },
    ],
  },

  loopAttack: {
    y: 483, h: 22, canvasW: 21, groundY: 21, canvasAnchorX: 20,
    frames: [
      { x: 8,   w: 33, drawX: 4 },
      { x: 41,  w: 33, drawX: 5 },
      { x: 74,  w: 33, drawX: 3 },
      { x: 107, w: 33, drawX: 0 },
      { x: 140, w: 33, drawX: 0 },
      { x: 173, w: 24, drawX: 0 },
    ],
  },

  jumpIntoBox: {
    y: 514, h: 26, canvasW: 37, groundY: 25, canvasAnchorX: 3,
    // In-box frames 5-7 put the box's left edge at canvas x=3, hence canvasAnchorX 3.
    // The other box animations have it at x=0 (canvasAnchorX 0), so the box stays put on switching.
    frames: [
      { x: 4,   w: 31, drawX: 7 },
      { x: 35,  w: 35, drawX: 6 },
      { x: 70,  w: 31, drawX: 7 },
      { x: 101, w: 32, drawX: 7 },
      { x: 133, w: 32, drawX: 8 },
      { x: 165, w: 33, drawX: 0 },
      { x: 198, w: 36, drawX: 0 },
      { x: 234, w: 29, drawX: 3 },
    ],
  },

  pushHandUp: {
    y: 556, h: 15, canvasW: 29, groundY: 14, canvasAnchorX: 0,
    frames: [
      { x: 3,  w: 33, drawX: 0 },
      { x: 36, w: 33, drawX: 0 },
      { x: 69, w: 29, drawX: 0 },
    ],
  },

  playBox: {
    y: 590, h: 13, canvasW: 29, groundY: 12, canvasAnchorX: 0,
    frames: [
      { x: 3,   w: 33, drawX: 0 },
      { x: 36,  w: 33, drawX: 0 },
      { x: 69,  w: 33, drawX: 0 },
      { x: 102, w: 33, drawX: 0 },
      { x: 135, w: 29, drawX: 0 },
    ],
  },

  pushHandDown: {
    y: 620, h: 15, canvasW: 29, groundY: 14, canvasAnchorX: 0,
    frames: [
      { x: 3,  w: 33, drawX: 0 },
      { x: 36, w: 33, drawX: 0 },
      { x: 69, w: 29, drawX: 0 },
    ],
  },

  earUp: {
    y: 654, h: 13, canvasW: 29, groundY: 12, canvasAnchorX: 0,
    frames: [
      { x: 4,  w: 33, drawX: 0 },
      { x: 37, w: 29, drawX: 0 },
    ],
  },

  scan: {
    y: 683, h: 16, canvasW: 29, groundY: 15, canvasAnchorX: 0,
    // Self-directed gaze: pupils are final positions (renderer adds no offset).
    // Frames: right, centre (from right), left, centre (from left).
    frames: [
      { x: 4,   w: 33, drawX: 0, leftEye: { x: 19, y: 4 }, rightEye: { x: 22, y: 4 } }, // right  → BR
      { x: 37,  w: 33, drawX: 0, leftEye: { x: 18, y: 4 }, rightEye: { x: 21, y: 4 } }, // centre → BR
      { x: 70,  w: 33, drawX: 0, leftEye: { x: 16, y: 4 }, rightEye: { x: 19, y: 4 } }, // left   → BL
      { x: 103, w: 29, drawX: 0, leftEye: { x: 17, y: 4 }, rightEye: { x: 20, y: 4 } }, // centre → BL
    ],
  },

  earDown: {
    y: 718, h: 13, canvasW: 29, groundY: 12, canvasAnchorX: 0,
    frames: [
      { x: 4,  w: 33, drawX: 0 },
      { x: 37, w: 29, drawX: 0 },
    ],
  },

  jumpOutOfBox: {
    y: 737, h: 26, canvasW: 32, groundY: 25, canvasAnchorX: 0,
    frames: [
      { x: 4,   w: 33, drawX: 0 },
      { x: 37,  w: 32, drawX: 0, leftEye: { x: 19, y: 13 }, rightEye: { x: 22, y: 13 } },
      { x: 69,  w: 33, drawX: 4, leftEye: { x: 24, y: 7 }, rightEye: { x: 27, y: 5 } },
      { x: 102, w: 35, drawX: 2, leftEye: { x: 22, y: 13 }, rightEye: { x: 25, y: 13 } },
      { x: 137, w: 31, drawX: 4, leftEye: { x: 22, y: 13 }, rightEye: { x: 25, y: 14 } },
      { x: 168, w: 35, drawX: 3, leftEye: { x: 22, y: 13 }, rightEye: { x: 25, y: 12 } },
      { x: 203, w: 25, drawX: 5, leftEye: { x: 22, y: 13 }, rightEye: { x: 25, y: 12 } },
    ],
  },
}