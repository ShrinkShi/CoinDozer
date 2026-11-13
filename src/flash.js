/** White flash on actual newly-spawned portal resources.
 * Rise in 0.07s, fade out in 1.25s (pause safe: game simulation time).
 */
export const FLASH_RISE=0.07;
export const FLASH_FADE=1.25;
export function flashIntensity(age){
 if(!Number.isFinite(age)||age<0||age>=FLASH_RISE+FLASH_FADE)return 0;
 if(age<FLASH_RISE){const t=age/FLASH_RISE;return t*t*(3-2*t);}
 const t=(age-FLASH_RISE)/FLASH_FADE;
 return (1-t)*(1-t)*(1+2*t);
}
