# How Desktop Cat works

A reference for the concepts and code behind the app: what each part does, why it's built that way, and the gotchas found along the way.

**Contents**

1. [The two-minute explanation](#1-the-two-minute-explanation)
2. [Tauri basics](#2-tauri-basics)
3. [Who owns what: the files](#3-who-owns-what-the-files)
4. [The Rust side (lib.rs)](#4-the-rust-side-librs)
5. [Rust concepts cheat sheet](#5-rust-concepts-cheat-sheet)
6. [The sprite sheet and spritemap.ts](#6-the-sprite-sheet-and-spritemapts)
7. [The animator (animator.ts)](#7-the-animator-animatorts)
8. [The eyes](#8-the-eyes)
9. [Behaviour (behavior.ts)](#9-behaviour-behaviorts)
10. [Wiring (main.ts)](#10-wiring-maints)
11. [Pixels, DPI and why it looks crisp](#11-pixels-dpi-and-why-it-looks-crisp)
12. [Packaging](#12-packaging)
13. [Gotchas](#13-gotchas)
14. [Known limitations and next steps](#14-known-limitations-and-next-steps)

---

## 1. The two-minute explanation

The cat is a **transparent, borderless, always-on-top window** with a single `<canvas>` in it. A TypeScript animation loop draws frames from a sprite sheet onto that canvas.

Two background jobs bring it to life:

- A **Rust thread** asks Windows for the cursor position and left-button state every 16 ms and sends them to the web page as events. The page can't see the mouse when it's outside the window, so Rust does it.
- A **behaviour controller** in TypeScript keeps timers and a "mood", and decides which animation plays: sit after 15 s idle, sleep after 30 s, wake on movement, purr when petted, hop into a box when dragged.

Everything outside the cat's pixels lets clicks through: on every cursor update the app checks whether the pixel under the cursor is see-through and switches the window's click-through on or off to match.

```
 ┌──────────────── Rust (lib.rs) ─────────────────┐
 │  tray icon + Quit                               │
 │  thread: every 16 ms                            │
 │    cursor position  ──► emit "cursor-moved"     │
 │    left button up   ──► emit "mouse-released"   │
 └──────────────────────┬─────────────────────────┘
                        │ events (IPC)
 ┌──────────────────────▼──── WebView (TypeScript) ┐
 │  main.ts      events in → calls out             │
 │     │                                           │
 │     ├──► behavior.ts   "what should it do?"     │
 │     │        │ play(anim)                       │
 │     └──► animator.ts   "what does it look like?"│
 │              │ reads                            │
 │          spritemap.ts  frame + alignment data   │
 └─────────────────────────────────────────────────┘
```

---

## 2. Tauri basics

**Two halves.** A Tauri app is a Rust program that opens a native window containing a **WebView**: on Windows that's WebView2, the Edge/Chromium engine. Your HTML, CSS and TypeScript run in the WebView like a web page. Rust has full access to the operating system; the page doesn't.

**How the halves talk (IPC):**

| Direction | Mechanism | Used for |
|---|---|---|
| Rust → JS | `handle.emit("name", payload)` → `listen("name", cb)` | cursor position, mouse release |
| JS → Rust | Tauri JS API calls (`appWindow.startDragging()`, `setIgnoreCursorEvents`, `Menu.new`, …) | window control, menus |

Payloads cross as JSON, which is why `CursorPos` derives `serde::Serialize`.

**Capabilities (permissions).** Every JS → Rust call must be allowed in `src-tauri/capabilities/default.json`. `core:default` covers much less than the name suggests. Anything else **fails silently**: the promise rejects, nothing catches it, and you only see an error in the devtools console. This app needs:

```json
"core:default",
"opener:default",
"core:window:allow-start-dragging",
"core:window:allow-set-ignore-cursor-events",
"core:window:allow-close"
```

Code that runs entirely in Rust (the tray menu) needs no capability. Capabilities only limit what the *page* may ask Rust to do.

**The window** (`tauri.conf.json`):

| Option | Effect |
|---|---|
| `transparent: true` | window background is see-through; only drawn pixels show |
| `decorations: false` | no title bar or border |
| `alwaysOnTop: true` | stays above other windows |
| `skipTaskbar: true` | no taskbar button |
| `shadow: false` | no drop shadow around the invisible window |
| `resizable: false` | fixed size (260 × 200 CSS px) |
| `macOSPrivateApi: true` | needed for transparency on macOS (rules out the Mac App Store) |

`src-tauri/src/main.rs` contains `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`, which stops a black console window opening alongside the app in release builds.

---

## 3. Who owns what: the files

The rule for where code goes:

| Question the code answers | File |
|---|---|
| "What just happened?" (events in, OS calls out) | `main.ts` |
| "What should the cat do next?" | `behavior.ts` |
| "What does that look like on screen?" | `animator.ts` |
| "Where is each frame on the sheet, and how do frames line up?" | `spritemap.ts` (pure data) |
| "What can only the OS tell us?" | `src-tauri/src/lib.rs` |

In NestJS terms: `main.ts` is the controller, `behavior.ts` the service holding the business rules, `animator.ts` the view, and `spritemap.ts` config.

---

## 4. The Rust side (lib.rs)

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .setup(|app| { /* tray + thread */ Ok(()) })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

**Builder pattern.** `Builder::default()` creates an empty configuration; each chained call adds one thing; `.run()` starts the app. `.setup()` takes a **closure** that runs once, after the app exists but before the event loop starts. It returns a `Result`, which is why it ends in `Ok(())`.

### Tray icon

```rust
let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
let menu = Menu::with_items(app, &[&quit])?;

TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .tooltip("Desktop Cat")
    .menu(&menu)
    .on_menu_event(|app, event| match event.id.as_ref() {
        "quit" => app.exit(0),
        _ => {}
    })
    .build(app)?;
```

- Requires the `tray-icon` Cargo feature on the `tauri` dependency.
- `with_id(app, id, label, enabled, shortcut)`: the id is what the code matches on; the label is what the user sees.
- `on_menu_event` is a closure called for any menu click. `match` must cover every case, so `_ => {}` handles everything else.
- `app.exit(0)` shuts the whole app down, including the polling thread.

### The polling thread

```rust
let handle = app.handle().clone();
thread::spawn(move || {
    let mut was_pressed = false;
    loop {
        let is_pressed = unsafe {
            (winapi::um::winuser::GetAsyncKeyState(0x01) as u16) & 0x8000 != 0
        };
        if was_pressed && !is_pressed {
            let _ = handle.emit("mouse-released", ());
        }
        was_pressed = is_pressed;

        match Mouse::get_mouse_position() {
            Mouse::Position { x, y } => { let _ = handle.emit("cursor-moved", CursorPos { x, y }); }
            Mouse::Error => {}
        }
        thread::sleep(Duration::from_millis(16));
    }
});
```

**Why it exists:**
- A web page only gets mouse events while the cursor is over it, and click-through stops even those. The eyes and the hit test need the cursor position *everywhere*, all the time.
- `startDragging()` hands the drag to Windows, which captures the mouse. The WebView never receives `mouseup`, so the end of a drag can't be detected from the DOM. Polling the physical button state from Rust gives a reliable "released" signal.

**Line by line:**
- `app.handle().clone()`: the thread needs its own handle to the app, because it outlives `setup`.
- `move ||`: the closure takes **ownership** of every outer variable it uses (here, `handle`). Required for threads: Rust won't let a thread borrow something that might be dropped while the thread still runs.
- `GetAsyncKeyState(0x01)`: Windows API; `0x01` is the left mouse button. The high bit (`0x8000`) means "currently held". `as u16` makes the bit test unsigned.
- `unsafe { … }`: calling C code Rust can't verify. You take responsibility for it being correct.
- `was_pressed && !is_pressed`: edge detection. Fires once, on the transition from held to released.
- `let _ = handle.emit(...)`: `emit` returns a `Result`; `let _` deliberately ignores it.
- `match … { Mouse::Position { x, y } => … }`: matches an enum variant and pulls its fields out by name (destructuring).
- 16 ms ≈ 60 updates a second.

`cursor-moved` is sent every tick **even if the cursor hasn't moved**. The TS side compares against the last position before treating it as user activity.

---

## 5. Rust concepts cheat sheet

| Concept | Meaning | TS/Python analogy |
|---|---|---|
| **Ownership** | Every value has one owner; when the owner goes away, the value is freed | No GC; the compiler tracks it |
| **Move** | Passing a value (not a reference) transfers ownership; the old variable can't be used | — |
| **Borrow `&T`** | Lend a value without giving it away; you keep it | Passing a reference you still own |
| **`clone()`** | Make an owned copy, when a function wants ownership but you only have a borrow | `structuredClone` |
| **`Option<T>`** | `Some(value)` or `None` | `T \| undefined` / `Optional[T]` |
| **`Result<T, E>`** | `Ok(value)` or `Err(error)`; no exceptions | a return type that forces you to handle errors |
| **`?`** | On `Err`, return it from the current function; on `Ok`, unwrap the value | `await` that rethrows. Only valid in functions returning `Result` |
| **`unwrap()`** | Take the value out of an `Option`/`Result`; crash if absent | `value!` that actually checks |
| **`match`** | Exhaustive pattern matching; also an expression | `switch` that must cover every case |
| **Associated function** | `Type::func()`, no `self` | static method |
| **Method** | `value.func()`, takes `self` | instance method |
| **No `new` keyword** | Struct literal `Point { x, y }` is the only constructor; libraries provide `new`, `with_id`, `default`… | named static factories (no overloading in Rust) |
| **Trait** | A set of methods a type promises to implement (`Default`, `Serialize`) | interface |
| **`#[derive(...)]`** | Generate trait implementations automatically | decorators that generate code |
| **Turbofish `::<T>`** | Name a generic type explicitly when it can't be inferred (`None::<&str>`) | `fn<string>(null)` |
| **Closure `\|a, b\| …`** | Anonymous function that can capture outer variables (a plain `fn` can't) | arrow function |
| **Cargo feature** | Optional part of a crate, compiled only when enabled | optional extras |
| **`#[cfg(...)]`** | Compile code only on certain targets (e.g. `target_os = "windows"`) | build-time `if` |

---

## 6. The sprite sheet and spritemap.ts

The sheet is one PNG. Each **row** is an animation, and each **frame** is a cell in that row. Cells are cropped to their content, so they have **different widths**. That creates most of the alignment work.

```ts
interface SpriteFrame { x, w, drawX, leftEye?, rightEye? }
interface SpriteRow   { y, h, canvasW, groundY, canvasAnchorX, frames, leftEye?, rightEye? }
```

All values are in **sprite pixels**, the art's own pixels. They're multiplied by `scale` only when drawing.

| Field | What it's for |
|---|---|
| `x`, `w` (frame) / `y`, `h` (row) | where to cut the frame from the sheet |
| `drawX` | how far right to shift this frame on the canvas so the body doesn't drift between frames. As the tail swings, the cell's left edge moves; `drawX` cancels it. For stand/sit/sleep/eat: `drawX = 23 − (front-paw x in the cell)`, so the front paws land on canvas column 23 in every frame |
| `canvasW` | canvas width: rightmost visible pixel + 1. Only stops clipping; doesn't affect alignment |
| `canvasAnchorX` | the canvas column pinned to a fixed screen point. Lines animations up **with each other** (`drawX` lines up frames within one animation). Body rows: 23 (front paw). Box rows: the box's left edge (0, or 3 for `jumpIntoBox`) |
| `groundY` | the canvas row the paws rest on. Used to put every animation's feet on the same line. The tail tip is ignored because it droops lower |
| `leftEye` / `rightEye` | eye position, on the row (same for every frame) or per frame (overrides the row). No eye for a frame = eyes closed or hidden, so no pupils are drawn |

**The key distinction:** `drawX` aligns frames *within* one animation; `canvasAnchorX` and `groundY` align *different* animations with each other. When a transition "jumps" sideways, adjust `canvasAnchorX`, not `drawX`. Raising `canvasAnchorX` moves that animation **left** on screen.

**Why lower anchor = further right:** `left = anchor_point − canvasAnchorX × scale`. Think of a ruler hung on a fixed nail: hang it by a lower mark and the whole ruler moves right.

**The landmark matters, not the number.** Every body animation pins the *same body part* (the front paws) to the anchor. An earlier attempt pinned "the rightmost pixel", which is the nose when standing but the chest when sitting, so the cat jumped when it changed pose.

**Ghost pixels.** The sheet contains near-invisible pixels (alpha 1–10). They inflated early measurements, and they'd be "grabbable" if the hit test used `alpha > 0`.

**Eye coordinate conventions** (they depend on the animation's eye mode, §8):
- `track`, `rest`, `content`: the **top-right pixel** of the 2×2 eye
- `fixed` (scan): the **exact pupil pixel**

---

## 7. The animator (animator.ts)

### The loop

```ts
start() { this.rafId = requestAnimationFrame(this.tick) }

private tick = (timestamp: number) => {
    // ease the pupil toward its target (every frame)
    const frameDuration = 1000 / anim.fps;
    if (timestamp - this.lastFrameTime >= frameDuration) {
        this.currentFrame++;
        // past the last frame → loop, or hold the last frame and fire onComplete
        this.lastFrameTime = timestamp;
    }
    this.draw();                                   // every frame
    this.rafId = requestAnimationFrame(this.tick); // schedule the next one
}
```

- `requestAnimationFrame` calls you before each screen refresh (~60 Hz) with a timestamp. It's the standard browser game loop.
- **Two speeds.** The *sprite* advances at the animation's `fps` (4.5–14). *Drawing* happens every refresh, so the pupil can ease smoothly between sprite frames. Before `draw()` moved out of the timing block, the pupil only updated when the sprite frame changed.
- `fps` sets one speed for the whole animation. Lower = slower, and fractions are fine.

### Callbacks

```ts
onComplete?: (anim: AnimationState) => void;  // a non-looping animation finished
onPlay?:     (anim: AnimationState) => void;   // a new animation started
```

Optional function-valued properties, called with `this.onComplete?.(anim)` (the optional call `?.` does nothing if unset). `behavior.ts` sets `onComplete`; `main.ts` sets `onPlay` to reposition the canvas.

Every non-looping animation **must** have a case in `onComplete` that plays something. Otherwise `onComplete` fires again on every frame, because the animation stays "finished".

### `play(name)`

Resets frame and timing, resizes the canvas to `canvasW × scale` by `h × scale`, then calls `onPlay`.

**Resizing a canvas resets every context setting** (`imageSmoothingEnabled` included), so settings are applied again after each resize.

### `draw()`

```ts
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.drawImage(sheet,
    frame.x, row.y, frame.w, row.h,                              // source rectangle on the sheet
    frame.drawX * scale, 0, frame.w * scale, row.h * scale);     // destination on the canvas
// then the eye pixels on top
```

The 9-argument `drawImage` cuts a rectangle from the sheet and draws it scaled at a position. `SHEET_SCALE` (currently 1) would multiply the source rectangle if a pre-upscaled sheet were used.

### `this` and arrow functions

`tick` (and `sit`, `sleep`, `onAnimationComplete` in behaviour) are **arrow-function properties**, not methods. They're passed around as bare functions (`requestAnimationFrame(this.tick)`, `setTimeout(this.sit)`). A normal method passed that way loses its `this`. An arrow function captures `this` from where it was defined.

### Getters

`get currentAnimation()` is read like a field (`animator.currentAnimation`) but runs a function. It exposes the private `currentAnim` as read-only.

---

## 8. The eyes

The sprite has empty 2×2 orange eyes. The app draws the pupils itself, as black `scale × scale` squares.

### Where to look (`updateCursor`)

```ts
const cx = (left.x + right.x) / 2, cy = (left.y + right.y) / 2; // point between the eyes
const dx = cursorX / scale - cx, dy = cursorY / scale - cy;     // vector to the cursor
const dist = Math.sqrt(dx*dx + dy*dy);
target = { x: dx / dist, y: dy / dist };                        // normalised: length 1
```

- **One shared direction for both eyes**, from the midpoint. Aiming each eye separately makes the cat go cross-eyed when the cursor is close.
- **Normalising** (dividing by the length) keeps only the direction, so the pupil moves the same amount whether the cursor is near or far. `maxOffset` would scale it, and it's 1.
- `dist < 0.5`: the cursor is on the eyes and the direction is meaningless, so keep the old target.

### Smoothing (lerp)

```ts
pupilX += (targetX - pupilX) * 0.15;   // every frame
```

Each frame closes 15% of the remaining gap: fast at first, slowing as it arrives (exponential easing).

### Snapping to 8 directions (`pupilOffset`)

A 2×2 eye has no room for smooth movement. The pupil can only sit on whole pixels, so the smoothed direction is snapped to one of 8 directions and looked up in a hand-tuned table:

```ts
const octant = (Math.round(Math.atan2(pupilY, pupilX) / (Math.PI / 4)) + 8) % 8;
return PUPIL_OFFSETS[octant];   // 0 right, 1 down-right, 2 down … 7 up-right
```

- **`atan2(y, x)`** gives the angle of the vector, −π…π. Unlike `atan(y/x)` it keeps the signs, so it can tell up-left from down-right, and it doesn't divide by zero. Canvas y points **down**, so angles go clockwise.
- **`/ (π/4)`** converts the angle to 45° steps; `Math.round` picks the nearest.
- **`+ 8) % 8`**: JS `%` keeps the sign of the left side (`-2 % 8 === -2`, unlike Python), so add 8 first to get 0–7.
- **`PUPIL_OFFSETS`** gives, for each direction, where the pupil goes relative to the eye's top-right pixel: x −1 = left; y +1 = **down**. Hand-tuned so every position stays inside the eye.
- **`PUPIL_REST`** is used until there's a clear direction (length ≤ 0.5).

### Eye modes

Each animation in `ANIMATIONS` can set an `eyeMode`:

| Mode | Used by | Draws |
|---|---|---|
| `track` (default) | `standIdle` | pupil follows the cursor |
| `rest` | sit, sleep, transitions, box jumps | pupil fixed at `PUPIL_REST` |
| `content` | `eat` (petting) | bottom row of both eyes: a happy squint |
| `fixed` | `scan` | exactly at the coordinate. The animation sets the gaze, since the cat is looking around by itself |

```ts
const EYE_PATTERNS = { content: [...], fixed: [{x:0,y:0}], rest: [PUPIL_REST] };
type EyeMode = 'track' | keyof typeof EYE_PATTERNS;   // 'track' | 'content' | 'fixed' | 'rest'
```

`keyof typeof EYE_PATTERNS` builds the union from the object's keys, so adding a pattern adds a mode. In `draw()`, after `mode === 'track' ? … :`, TypeScript **narrows** `mode` to the pattern keys, which is why `EYE_PATTERNS[mode]` type-checks.

Every mode ends in `drawPixels(eye, offsets)`: one method, a list of offsets per eye.

---

## 9. Behaviour (behavior.ts)

### Mood vs animation

The core idea. The **animation** is what's on screen; the **mood** is where the cat is *heading*.

| Mood | Meaning |
|---|---|
| `standing` | idle on its feet, 15 s idle timer running |
| `sitting` | sitting, or on the way to sitting |
| `sleeping` | asleep, or on the way (including standing up first) |
| `petting` | `eat` playing because it's being rubbed |
| `dragging` | button held, in or jumping into the box |
| `landing` | button released, jumping out; nothing may interrupt |

The same animation can mean different things: `sitToStand` with mood `sleeping` means "standing up in order to lie down"; with mood `standing` it means "woken up". When an animation finishes, `onAnimationComplete` checks the mood to decide what's next. Interruptions work without special cases: wake the cat halfway through `standToSit` and only the mood changes; when `standToSit` finishes, it sees `standing` and plays `sitToStand`.

### The routing table (`onAnimationComplete`)

| Finished | Mood | Next |
|---|---|---|
| `standToSit` | `sitting` | `sitIdle` + start sleep timer |
| `standToSit` | other | `sitToStand` |
| `sitToStand` | `sleeping` | `standToSleep` (no `sitToSleep` on the sheet, so it stands first) |
| `sitToStand` | other | standing |
| `standToSleep` | `sleeping` | `sleepIdle` |
| `standToSleep` | other | `sleepToStand` |
| `sleepToStand` | — | standing |
| `jumpIntoBox` | `dragging` | `scan` |
| `jumpIntoBox` | `landing` | `jumpOutOfBox` |
| `jumpOutOfBox` | — | standing |

Looping animations never finish; they end only when something calls `play()`.

### Timers

- **Idle:** 15 s standing → sit. The sleep timer starts when `standToSit` *finishes*, 15 s → sleep. One `idleTimer` slot holds whichever is pending.
- **Debounce:** `resetIdleTimer` / `resetPetTimer` cancel and restart. While events keep coming, the deadline keeps moving; it fires only after things go quiet.
- `window.setTimeout` returns a number ID, used by `clearTimeout`. `clearTimeout(undefined)` is harmless.

### Petting

Triggered from canvas `mousemove` (which only fires on the cat's real pixels, thanks to the hit test):

- add up the distance moved (`Math.hypot(e.movementX, e.movementY)` per event)
- start `eat` only when **≥ 150 px** *and* **≥ 400 ms** since this rubbing began. A quick swipe covers the distance but not the time
- **600 ms** without movement, or leaving the cat → `petStop()` → back to standing
- only from a fully standing cat (`standIdle`), so a just-woken cat isn't cut off mid-transition

### Dragging

- `dragStart()`: cancel timers, mood `dragging`, play `jumpIntoBox`.
- `dragEnd()`: mood `landing`. If already in `scan`, jump out now; if still in `jumpIntoBox`, `onComplete` sees `landing` and jumps out when it finishes. A quick click therefore still plays the full in-and-out.

### TypeScript notes

- `constructor(private animator: CatAnimator)`: a *parameter property*. It declares and assigns the field in one go, as in NestJS dependency injection.
- `15_000`: numeric separator, readability only.
- `performance.now()`: millisecond clock from page load, unaffected by system clock changes.

---

## 10. Wiring (main.ts)

### Startup order

1. Wait for the sprite sheet to load (`spriteSheet.onload`).
2. Create the animator and set `onPlay` **before** the first `play()`, so the first animation is positioned.
3. Create the behaviour, `start()` it, start the animation loop.
4. Window setup, menu, event listeners.

### Positioning the canvas (`onPlay`)

The canvas is `position: absolute` in a fixed-size transparent window, and placed per animation:

```ts
canvas.style.left   = ((windowAnchor - row.canvasAnchorX * scale) / dpr) + 'px';
canvas.style.bottom = ((ground - (row.h - 1 - row.groundY) * scale) / dpr) + 'px';
```

- **Two groups**, because the box and the body are different landmarks: body animations use `BODY_ANCHOR` / `BODY_GROUND`; box animations use `BOX_ANCHOR` / `BOX_GROUND`. The anchors are written as *N sprite pixels × scale*, so changing `scale` keeps proportions.
- `row.h - 1 - row.groundY` = empty rows under the feet; shifting down by that puts the feet on the ground line.
- The window must be wide enough for every canvas. Here 260 CSS px wide.

### Coordinate conversion

Everything ends up in **canvas drawing pixels** (physical pixels, see §11):

```ts
const rect = canvas.getBoundingClientRect();           // canvas position in CSS px
const canvasRelX = (cursorX - windowX) - rect.left * dpr;
```

- `cursorX` (from Rust) and `windowX` (from `outerPosition()` / `onMoved`) are both **physical** screen pixels, so their difference is the cursor relative to the window.
- `rect.left` is in CSS pixels; `× dpr` makes it physical.
- `getBoundingClientRect()` already includes `style.left`/`bottom`, so nothing needs recalculating when the canvas moves.

### Hit testing and click-through

```ts
const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

function isOverCat(x, y) {
    // outside the canvas → false
    return ctx.getImageData(px, py, 1, 1).data[3] > HIT_ALPHA;   // alpha of that pixel
}
```

On every `cursor-moved` (not while dragging): if the answer changed, call `setIgnoreCursorEvents(!over)`, and `petStop()` when leaving.

- **Why not DOM `mousemove`?** With click-through on, the window gets *no* mouse events, so it would never learn the cursor came back. The Rust stream arrives regardless.
- `getImageData(x, y, 1, 1).data` = `[r, g, b, a]`; `[3]` is alpha. `HIT_ALPHA = 20` skips ghost pixels.
- `willReadFrequently` keeps the canvas in CPU memory, so reading pixels 60×/s is cheap.
- Only call Tauri when the state *changes* (`overCat` remembers it). Each call is IPC.
- Skipped while dragging: the box shape may leave the cursor over a transparent pixel, and turning click-through on mid-drag could break the drag.
- `overCat` starts `true` because windows start with click-through off.

### Drag, menu, position

- `mousedown` → only `e.button === 0` (left). Other buttons have no "released" signal from Rust, so they'd leave the cat stuck in the box.
- `appWindow.startDragging()` → Windows moves the window; `onMoved` keeps `windowX/Y` current.
- `mouse-released` (from Rust) → if dragging: save position to `localStorage`, `behavior.dragEnd()`.
- `contextmenu` → `preventDefault()` (blocks the WebView's own Reload/Inspect menu) → `Menu.new(...).popup()`, a native menu with Quit → `appWindow.close()`. Closing the only window exits the app.
- `cursor-moved` with a *changed* position → `behavior.activity()` (wakes or resets idle).

---

## 11. Pixels, DPI and why it looks crisp

**CSS pixels vs physical pixels.** Windows display scaling (here 125%) means 1 CSS pixel = `devicePixelRatio` (1.25) physical pixels.

**The original problem.** Drawing each sprite pixel as 5 *CSS* pixels made it 6.25 *physical* pixels. That can't be split evenly, so nearest-neighbour scaling made some pixels 6 wide and some 7. The grid was uneven and the outlines jagged.

**The fix: draw in physical pixels at 1:1.**
- `scale = 6` means 6 **physical** pixels per sprite pixel (a whole number).
- `canvas.width/height` (the drawing buffer) are in physical pixels.
- `canvas.style.width/height/left/bottom` = physical values **÷ dpr**, so the browser shows the canvas exactly 1:1 with no stretch.
- Positions are whole physical pixels before dividing, so the canvas sits on the physical pixel grid. A fractional offset would resample and blur the whole image.

**Settings involved:**

| Setting | Where | Effect |
|---|---|---|
| `imageSmoothingEnabled = false` | animator (`SMOOTHING`) | `drawImage` scales with hard nearest-neighbour blocks |
| `image-rendering` | styles.css | how the browser scales the finished canvas; irrelevant at 1:1 |
| `scale` | main.ts | physical pixels per sprite pixel |
| `SHEET_SCALE` | animator | must match a pre-upscaled sheet (1 = original) |

**Upscalers (xBRZ, hqx)** reinterpret pixel art as curves and blur hard edges. They were tried and rejected: this sheet suits hard pixels.

`dpr` is read once at startup. Moving to a monitor with different scaling needs a restart (`onScaleChanged` would handle it).

---

## 12. Packaging

```
npm run tauri build
```

1. `npm run build` = `tsc && vite build`. **`tsc` type-checks the whole project**, unlike dev mode, so unused variables or imports (`noUnusedLocals`) fail the build here first.
2. `cargo build --release`: optimised Rust; the first build is slow.
3. NSIS bundles `src-tauri/target/release/bundle/nsis/Desktop Cat_1.0.0_x64-setup.exe` (`bundle.targets: "nsis"`). The first run downloads NSIS from GitHub; a timeout there is a network problem, not a code one.

**Metadata** (`tauri.conf.json`): `productName` (Start menu name), `version` (installer), `identifier` (`com.paresh.desktop-cat`). The identifier determines where Windows keeps the app's data; don't change it after release.

**Icons:** `npm run tauri icon <1024×1024.png>` generates every size into `src-tauri/icons/`. For pixel art: shrink to the native size, then scale up by a whole number with nearest-neighbour (16 × 64 = 1024).

**SmartScreen** warns only about *downloaded* files. Browsers tag them with a "Mark of the Web"; a locally built installer has none, so you won't see the warning yourself. Removing it for others needs a paid code-signing certificate.

**Dev vs installed storage:** `localStorage` is per origin. Dev runs on `http://localhost:1420`, the installed app on Tauri's own origin, so they don't share saved data.

---

## 13. Gotchas

| Symptom | Cause | Fix |
|---|---|---|
| A window API call does nothing | missing capability; the promise rejects silently | add the permission to `capabilities/default.json`, restart dev |
| Smoothing comes back after switching animation | resizing the canvas resets context state | set context options again after each resize |
| `mouseup` never fires after dragging | the OS captures the mouse during `startDragging()` | poll the button in Rust, emit `mouse-released` |
| Listeners pile up | `addEventListener` inside another event handler | register once, or use `{ once: true }` |
| Method loses `this` as a callback | passing `this.method` detaches it | arrow-function property |
| Negative array index from `%` | JS `%` keeps the dividend's sign | `(n + 8) % 8` |
| Right-click leaves the cat stuck in the box | `mousedown` fires for all buttons | `if (e.button !== 0) return` |
| "Activity" fires constantly | Rust emits every 16 ms, moved or not | compare with the last position |
| `sitToSleep` missing | not on the sheet | route through standing using mood |
| Sprite edge clipped | canvas narrower than the frame content | widen `canvasW` (alignment unaffected) |
| Animations jump sideways on transitions | anchors pinned to different body parts | same landmark (front paws) in every animation |
| Jagged, uneven pixels | non-integer DPI scaling | physical-pixel canvas at 1:1 (§11) |
| Rust: `emit` not found | trait not in scope | `use tauri::Emitter;` |
| Rust: crate name | crates.io names may use `_` vs `-` | `mouse_position`, not `mouse-position` |

---

## 14. Known limitations and next steps

- **Position isn't restored on relaunch.** `setPosition` needs `core:window:allow-set-position`, which isn't granted. One line in capabilities.
- **macOS:** `winapi` doesn't compile there. It needs `#[cfg(target_os = "windows")]` around the polling, a Core Graphics equivalent (`CGEventSourceButtonState`), a points-vs-pixels fix for the cursor (Retina dpr 2), hiding the Dock icon (`ActivationPolicy::Accessory`), and building on a Mac.
- **Multi-monitor DPI:** `dpr` is read once; handle `onScaleChanged`.
- **Unused animations:** walk, run, jump, stealth, attack, playBox, ear animations. Walking needs the window to move across the screen over time. Their `canvasAnchorX` isn't converted to the paw landmark yet.
- **Ideas:** start with Windows (`tauri-plugin-autostart`), a Credits item in the right-click menu, typing detection (Rust `rdev`), sounds.
