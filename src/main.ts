import { CatAnimator } from "./animator"
import spriteUrl from "./assets/Sprite_sheet_black_cat.png"
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from '@tauri-apps/api/dpi' ;
import { listen } from '@tauri-apps/api/event'
import { AnimationState, SPRITE_MAP } from "./spritemap";
import { CatBehavior } from "./behavior";
import { Menu } from '@tauri-apps/api/menu'


const canvas = document.getElementById("cat") as HTMLCanvasElement
const ctx = canvas.getContext("2d", { willReadFrequently: true})!;

const spriteSheet = new Image()
spriteSheet.src = spriteUrl
spriteSheet.onload = async () => {
    const scale = 6
    const dpr = window.devicePixelRatio || 1;

    const animator = new CatAnimator(ctx, spriteSheet,scale)

    const BOX_ANIMS: AnimationState[] = ['jumpIntoBox', 'scan', 'pushHandUp', 'playBox', 'pushHandDown', 'earDown', 'jumpOutOfBox']
    const BODY_ANCHOR = 30 * scale
    const BOX_ANCHOR = 7 * scale
    const BODY_GROUND = 3 * scale
    const BOX_GROUND = 0

    const HIT_ALPHA = 20
    let overCat = true

    function isOverCat(x: number, y: number){
        const px = Math.floor(x)
        const py = Math.floor(y)
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false
        return ctx.getImageData(px, py, 1, 1).data[3] > HIT_ALPHA
    }


    animator.onPlay = (anim) => {
        const row = SPRITE_MAP[anim]
        const isBox = BOX_ANIMS.includes(anim)
        const ground = isBox ? BOX_GROUND : BODY_GROUND
        const windowAnchor = isBox ? BOX_ANCHOR : BODY_ANCHOR
        canvas.style.width = (canvas.width / dpr) + 'px'
        canvas.style.height = (canvas.height / dpr) + 'px'
        canvas.style.left = ((windowAnchor - row.canvasAnchorX * scale) / dpr) + 'px'
        canvas.style.bottom = ((ground - (row.h - 1 - row.groundY) * scale) / dpr) + 'px'

    }

    const behavior = new CatBehavior(animator)
    behavior.start()
    animator.start()

    const appWindow = getCurrentWindow()

    const catMenu = await Menu.new({
    items: [
        { id: 'quit', text: 'Quit', action: () => appWindow.close() },
    ],
})

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    catMenu.popup()
})


    const savedX = localStorage.getItem('cat-x')
    const savedY = localStorage.getItem('cat-y')
    if (savedX && savedY) {
        appWindow.setPosition( new PhysicalPosition(parseInt(savedX), parseInt(savedY)))
    }

    const initialPos = await appWindow.outerPosition()
    let windowX = initialPos.x
    let windowY = initialPos.y

    appWindow.onMoved((event) => {
        windowX = event.payload.x
        windowY = event.payload.y
    })

    await listen('mouse-released', () => {
        if(!behavior.isDragging) return;
        localStorage.setItem('cat-x', windowX.toString())
        localStorage.setItem('cat-y', windowY.toString())
        behavior.dragEnd()
    })

    let cursorX = 0;
    let cursorY = 0;

    await listen<{ x: number, y: number}>('cursor-moved', (event) => {
        if (event.payload.x !== cursorX || event.payload.y !== cursorY) behavior.activity();
        cursorX = event.payload.x;
        cursorY = event.payload.y;

        
        const rect = canvas.getBoundingClientRect();
        const canvasRelX = (cursorX - windowX) -  rect.left * dpr
        const canvasRelY = (cursorY - windowY) -  rect.top * dpr

        animator.updateCursor(canvasRelX, canvasRelY)

        if(!behavior.isDragging) {
            const over = isOverCat(canvasRelX, canvasRelY)
            if (over !== overCat) {
                overCat = over;
                appWindow.setIgnoreCursorEvents(!over)
                if (!over) behavior.petStop()
            }
        }
    });

    //drag
    canvas.addEventListener('mousemove', (e) => behavior.petMove(Math.hypot(e.movementX, e.movementY)));

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        behavior.dragStart();
        appWindow.startDragging();
    })
}

