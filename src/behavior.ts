import { CatAnimator } from './animator';
import { AnimationState } from './spritemap';

type Mood = 'standing' | 'sitting' | 'sleeping' | 'petting' | 'dragging' | 'landing';

const SIT_AFTER_MS = 15_000
const SLEEP_AFTER_MS = 15_000
const PET_START_DISTANCE = 150
const PET_MIN_MS = 400
const PET_STOP_MS = 600

export class CatBehavior {
    private mood: Mood = 'standing';
    private idleTimer?: number;
    private petTimer?: number;
    private petDistance = 0;
    private petStartTime = 0;

    constructor(private animator: CatAnimator){
        animator.onComplete = this.onAnimationComplete;
    }

    start(){
        this.enterStanding();
    }

    get isDragging(){
        return this.mood === 'dragging';
    }

    activity(){
        if (this.mood === 'sitting' || this.mood === 'sleeping') this.wake();
        else if (this.mood === 'standing') this.resetIdleTimer();
    }

    petMove(distance: number){
        this.activity();
        if (this.mood === 'petting'){
            this.resetPetTimer();
            return;
        }
        if (this.mood !== 'standing' || this.animator.currentAnimation !== 'standIdle') return;
        if (this.petDistance === 0) this.petStartTime = performance.now();
        this.petDistance += distance;
        this.resetPetTimer();
        const rubbedFor = performance.now() - this.petStartTime;
        if(this.petDistance >= PET_START_DISTANCE && rubbedFor >= PET_MIN_MS){
            this.mood = 'petting';
            clearTimeout(this.idleTimer);
            this.animator.play('eat');
        }
    }

    petStop(){
        clearTimeout(this.petTimer);
        this.petDistance = 0;
        if (this.mood === 'petting') this.enterStanding();
    }

    dragStart(){
        clearTimeout(this.idleTimer);
        clearTimeout(this.petTimer);
        this.petDistance = 0;
        this.mood = 'dragging';
        this.animator.play('jumpIntoBox');
    }

    dragEnd(){
        if (this.mood !== 'dragging') return;
        this.mood = 'landing';
        if (this.animator.currentAnimation === 'scan') this.animator.play('jumpOutOfBox');
    }

    private enterStanding(){
        this.mood = 'standing';
        this.animator.play('standIdle');
        this.resetIdleTimer();
    }

    private resetIdleTimer(){
        clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(this.sit, SIT_AFTER_MS);
    }

    private resetPetTimer(){
        clearTimeout(this.petTimer);
        this.petTimer = window.setTimeout(() => this.petStop(), PET_STOP_MS);
    }

    private sit = () => {
        this.mood = 'sitting';
        this.animator.play('standToSit');
    }

    private sleep = () => {
        this.mood = 'sleeping';
        this.animator.play('sitToStand');
    }

    private wake(){
        clearTimeout(this.idleTimer);
        const current = this.animator.currentAnimation;
        this.mood = 'standing';
        if (current === 'sitIdle') this.animator.play('sitToStand');
        else if (current === 'sleepIdle') this.animator.play('sleepToStand');
    }

    private onAnimationComplete = (anim: AnimationState) => {
        switch(anim){
            case 'standToSit':
                if(this.mood === 'sitting'){
                    this.animator.play('sitIdle');
                    this.idleTimer = window.setTimeout(this.sleep, SLEEP_AFTER_MS);
                } else {
                    this.animator.play('sitToStand');
                }
                break;
            case 'sitToStand':
                if(this.mood === 'sleeping') this.animator.play('standToSleep');
                else this.enterStanding();
                break;
            case 'standToSleep':
                if(this.mood === 'sleeping') this.animator.play('sleepIdle');
                else this.animator.play('sleepToStand');
                break;
            case 'sleepToStand':
                this.enterStanding();
                break;
            case 'jumpIntoBox':
                this.animator.play(this.mood === 'dragging' ? 'scan' : 'jumpOutOfBox');
                break;
            case 'jumpOutOfBox':
                this.enterStanding();
                break;
        }    
    }

}