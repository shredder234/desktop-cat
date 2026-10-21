# Desktop Cat

A small pixel-art black cat that lives on your desktop. It sits on top of your other windows, watches your cursor, gets sleepy when you leave it alone, and hops into a box when you pick it up.

Built with [Tauri v2](https://tauri.app/), TypeScript and Rust. Windows only for now.

## What it does

| You... | The cat... |
|---|---|
| Move the mouse | Follows the cursor with its eyes |
| Leave it alone for 15 seconds | Sits down |
| Leave it alone for 30 seconds | Lies down and goes to sleep |
| Move the mouse while it rests | Wakes up and stands |
| Rub the cursor back and forth over it | Gets petted (and enjoys it) |
| Drag it with the left mouse button | Jumps into a box and peeks out while you carry it |
| Right-click it | Opens a menu with **Quit** |

Clicks on the empty space around the cat go straight through to whatever is underneath. Only the cat itself can be clicked.

You can also quit from the tray icon (the paw) in the taskbar's notification area.

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://www.rust-lang.org/tools/install)
- The [Tauri prerequisites for Windows](https://tauri.app/start/prerequisites/): Microsoft C++ Build Tools and WebView2 (WebView2 is already included in Windows 10 and 11)

### Getting the sprite sheet

The cat sprite sheet is **not included in this repository**. Its licence allows it to be used in projects but not redistributed, so you need to get your own copy:

1. Download the [Little Black Cat Pixel Art Asset Pack](https://aichan-owo.itch.io/little-black-cat-pixel-art-asset-pack) by Aichan from itch.io.
2. Copy the cat sprite sheet PNG from the pack to:

   ```
   src/assets/Sprite_sheet_black_cat.png
   ```

   Use the original, unmodified file. All animation coordinates in `src/spritemap.ts` are measured against it.

### Run and build

```bash
npm install
npm run tauri dev      # run in development mode
npm run tauri build    # build a release installer
```

The installer is written to `src-tauri/target/release/bundle/nsis/`.

The installer isn't code-signed, so Windows SmartScreen may show "Windows protected your PC" when someone runs a downloaded copy. Choose **More info → Run anyway**.

## Project structure

```
src/
  main.ts        wiring: Tauri events, window positioning, hit testing, drag, menu
  behavior.ts    decides what the cat does next (idle, sit, sleep, pet, drag)
  animator.ts    draws frames on the canvas and renders the eyes
  spritemap.ts   frame coordinates and alignment data for every animation
src-tauri/
  src/lib.rs     Rust side: tray icon, global cursor and mouse-button polling
  tauri.conf.json, capabilities/
```

## Credits

- **Cat sprites:** [Little Black Cat Pixel Art Asset Pack](https://aichan-owo.itch.io/little-black-cat-pixel-art-asset-pack) by **Aichan**, used under the creator's asset licence. The sprite sheet is not redistributed in this repository.
- **App icon:** "Cats pixel art" by **peony** ([OpenGameArt](https://opengameart.org/content/cats-pixel-art)), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Resized and converted to icon formats.
