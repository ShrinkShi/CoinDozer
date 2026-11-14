/**
 * Visual quality only: does not change the number, value, state or physics of
 * any resource. FPS is a noisy signal, so use dwell time and cooldown.
 */
export const QUALITY_LEVELS=Object.freeze({
 high:Object.freeze({dpr:1.75,detailDistance:22,shadowDistance:23,decorationStep:1,effectSparks:4}),
 balanced:Object.freeze({dpr:1.35,detailDistance:16,shadowDistance:15,decorationStep:2,effectSparks:2}),
 low:Object.freeze({dpr:1.0,detailDistance:11,shadowDistance:0,decorationStep:3,effectSparks:1})
});
export const QUALITY_NAMES=Object.freeze({high:'高',balanced:'均衡',low:'省电'});
const ORDER=['low','balanced','high'];
export class AdaptiveQuality{
 constructor(mobile=false){
  this.mobile=Boolean(mobile);
  this.mode=this.mobile?'balanced':'high';
  this.lowFor=0;this.highFor=0;this.cooldown=0;
 }
 sample(fps,seconds){
  if(!Number.isFinite(fps)||fps<=0||!Number.isFinite(seconds)||seconds<=0)return false;
  const dt=Math.min(seconds,2);
  if(this.cooldown>0){this.cooldown=Math.max(0,this.cooldown-dt);this.lowFor=0;this.highFor=0;return false;}
  this.lowFor=fps<28?this.lowFor+dt:0;
  this.highFor=fps>54?this.highFor+dt:0;
  let next=this.mode;
  if(this.lowFor>=3.3)next=ORDER[Math.max(0,ORDER.indexOf(this.mode)-1)];
  else if(this.highFor>=13)next=ORDER[Math.min(this.mobile?1:2,ORDER.indexOf(this.mode)+1)];
  if(next===this.mode)return false;
  this.mode=next;this.lowFor=0;this.highFor=0;this.cooldown=7;
  return true;
 }
}
