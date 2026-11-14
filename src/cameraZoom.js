import {clamp} from './math.js';
export const ZOOM_MIN=.52;
export const ZOOM_MAX=1.9;
/** zoom is ortho field-of-view: smaller = closer. */
export function wheelZoom(zoom,deltaY){
 return clamp(zoom*Math.exp(deltaY*.0010),ZOOM_MIN,ZOOM_MAX);
}
export function pinchZoom(startZoom,startDistance,currentDistance){
 if(startDistance<5||currentDistance<5)return startZoom;
 return clamp(startZoom*startDistance/currentDistance,ZOOM_MIN,ZOOM_MAX);
}
export function pointerDistance(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}

/** Camera stays on the same azimuth so touch/WASD direction is unchanged.
 * Only framing and zoom differ; temporary upgrade emphasis is visual-only.
 */
export function cameraFraming(aspect,zoom=1,mode='follow',upgradePulse=0){
 const a=Number.isFinite(aspect)&&aspect>0?aspect:1;
 const userZoom=clamp(Number.isFinite(zoom)?zoom:1,ZOOM_MIN,ZOOM_MAX);
 const close=mode==='close',pulse=clamp(upgradePulse,0,1);
 const base=a<.7?40.5:a<1.1?35:32;
 return {
  vertical:base*userZoom*(close?.76:1)*(1-.085*pulse),
  forwardOffset:close?1.85:1.25,
  mode:close?'close':'follow'
 };
}
