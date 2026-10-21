import { SPRITE_MAP, AnimationState, EyePos } from './spritemap';

const ANIMATIONS: Record<AnimationState, { fps: number; loop: boolean; eyeMode?: EyeMode }> = {
  standToSit:      { fps: 6,  loop: false, eyeMode: 'rest' },
  sitIdle:         { fps: 4.5,  loop: true, eyeMode: 'rest' },
  sitToStand:      { fps: 6,  loop: false, eyeMode: 'rest' },
  standToSleep:    { fps: 6,  loop: false, eyeMode: 'rest' },
  sleepIdle:       { fps: 4.5,  loop: true, eyeMode: 'rest' },
  sleepToStand:    { fps: 6,  loop: false, eyeMode: 'rest' },
  standIdle:       { fps: 4.5,  loop: true },
  eat:             { fps: 6,  loop: true, eyeMode: 'content' },
  walk:            { fps: 10, loop: true  },
  run:             { fps: 14, loop: true  },
  prepareStealth:  { fps: 8,  loop: false },
  stealth:         { fps: 8,  loop: true  },
  cancelStealth:   { fps: 8,  loop: false },
  jump:            { fps: 10, loop: false },
  attack:          { fps: 12, loop: false },
  loopAttack:      { fps: 12, loop: true  },
  jumpIntoBox:     { fps: 8, loop: false },
  pushHandUp:      { fps: 8,  loop: false },
  playBox:         { fps: 8,  loop: true  },
  pushHandDown:    { fps: 8,  loop: false },
  earUp:           { fps: 6,  loop: false },
  scan:            { fps: 4.5,  loop: true, eyeMode : 'fixed' },
  earDown:         { fps: 6,  loop: false },
  jumpOutOfBox:    { fps: 8, loop: false },
} as const;

const SHEET_SCALE = 1;
const SMOOTHING = false;

// Offsets from the eye coordinate (top-right pixel of the 2x2 eye).
// Inside the eye: (0,0) top-right, (-1,0) top-left, (0,1) bottom-right, (-1,1) bottom-left
const PUPIL_OFFSETS: { x: number, y: number }[] = [
    { x:  0, y:  0 },  // 0 right
    { x:  0, y:  1 },  // 1 down-right  
    { x:  -1, y:  1 },  // 2 down
    { x: -1, y:  1 },  // 3 down-left
    { x: -1, y:  0 },  // 4 left
    { x: -1, y:  0 },  // 5 up-left
    { x: -1, y: 0 },  // 6 up          
    { x:  0, y:  0 },  // 7 up-right
]
const PUPIL_REST = { x: 0, y: 0 }  // used before any direction is known

const EYE_PATTERNS ={
    content: [{ x: -1, y: 1 }, { x: 0, y: 1 }],
    fixed: [{x: 0, y: 0}],
    rest: [PUPIL_REST]
}

type EyeMode = 'track' | keyof typeof EYE_PATTERNS

export class CatAnimator {
    private ctx: CanvasRenderingContext2D;
    private spriteSheet: HTMLImageElement;
    private currentAnim: AnimationState = 'standIdle';
    private currentFrame: number = 0;
    private lastFrameTime: number = 0;
    private rafId: number = 0;
    private scale: number;
    private pupilX: number = 0;
    private pupilY: number = 0;
    private targetPupilX: number = 0;
    private targetPupilY: number = 0;
    onComplete?: (anim: AnimationState) => void;
    onPlay?: (anim: AnimationState) => void;

    constructor(ctx: CanvasRenderingContext2D, spriteSheet: HTMLImageElement, scale: number = 3) {
        this.ctx = ctx;
        this.spriteSheet = spriteSheet;
        this.scale = scale;
        this.ctx.imageSmoothingEnabled = SMOOTHING;
    }

    get currentAnimation(): AnimationState {
        return this.currentAnim;
    }

    play(name: AnimationState) {
        this.currentAnim = name;
        this.currentFrame = 0;
        this.lastFrameTime = 0;
        const row = SPRITE_MAP[name];
        this.ctx.canvas.width = row.canvasW * this.scale;
        this.ctx.canvas.height = row.h * this.scale;
        this.ctx.imageSmoothingEnabled = SMOOTHING;
        this.onPlay?.(name);
    }

    start(){
        this.rafId = requestAnimationFrame(this.tick)
    }

    stop(){
        cancelAnimationFrame(this.rafId)
    }

    private getEyes(): {left: EyePos, right: EyePos} | null {
        const row = SPRITE_MAP[this.currentAnim];
        const frame = row.frames[this.currentFrame];
        const left = frame.leftEye ?? row.leftEye;
        const right = frame.rightEye ?? row.rightEye;
        if(!left || !right) return null;
        return { left, right };
    }

    updateCursor(canvasRelX: number, canvasRelY: number) {
        const eyes = this.getEyes();
        if(!eyes) {
            this.targetPupilX = 0;
            this.targetPupilY = 0;
            return;
        }
        const cx = (eyes.left.x + eyes.right.x) / 2;
        const cy = (eyes.left.y + eyes.right.y) / 2;
        const dx = canvasRelX / this.scale - cx;
        const dy = canvasRelY / this.scale - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.5) return
        const maxOffset = 1
        this.targetPupilX = (dx / dist) * maxOffset;
        this.targetPupilY = (dy / dist) * maxOffset;
    }

    private tick = (timestamp: number) => {
        this.pupilX += (this.targetPupilX - this.pupilX) * 0.15;
        this.pupilY += (this.targetPupilY - this.pupilY) * 0.15;

        const anim = ANIMATIONS[this.currentAnim];
        const frameDuration = 1000 / anim.fps;


        if(timestamp - this.lastFrameTime >= frameDuration) {
            this.currentFrame++;

        
            if(this.currentFrame >= SPRITE_MAP[this.currentAnim].frames.length) {
                if(anim.loop) {
                    this.currentFrame = 0;
                } else {
                    this.currentFrame = SPRITE_MAP[this.currentAnim].frames.length - 1;
                    this.onComplete?.(this.currentAnim);
                }
            }
            this.lastFrameTime = timestamp;
        }
        this.draw();
        this.rafId = requestAnimationFrame(this.tick);
    }

    private draw() {
        const row = SPRITE_MAP[this.currentAnim];
        const frame = row.frames[this.currentFrame];

        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
        this.ctx.drawImage(
            this.spriteSheet,
            frame.x * SHEET_SCALE, row.y * SHEET_SCALE, frame.w * SHEET_SCALE, row.h * SHEET_SCALE,
            frame.drawX * this.scale, 0, frame.w * this.scale, row.h * this.scale
        );

        const eyes = this.getEyes();
        if (eyes) {
            const mode = ANIMATIONS[this.currentAnim].eyeMode ?? 'track';
            const offsets = mode === 'track' ? [this.pupilOffset()] : EYE_PATTERNS[mode];
            for (const eye of [eyes.left, eyes.right]) {
                this.drawPixels(eye, offsets);
            }
        }
    }

    private pupilOffset() : { x: number, y: number } {
        if (Math.hypot(this.pupilX, this.pupilY) <= 0.5) return PUPIL_REST;
        const octant = (Math.round(Math.atan2(this.pupilY, this.pupilX) / (Math.PI / 4)) + 8) % 8;
        return PUPIL_OFFSETS[octant];
    }

    private drawPixels(eye: EyePos, offsets: { x: number, y: number }[]) {
        const s = this.scale;
        this.ctx.fillStyle = '#000000';
        for (const o of offsets) {
            this.ctx.fillRect((eye.x + o.x) * s, (eye.y + o.y) * s, s, s);
        }
    }
}