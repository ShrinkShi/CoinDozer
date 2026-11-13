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
