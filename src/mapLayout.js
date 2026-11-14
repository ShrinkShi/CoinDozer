/** Engineering layout for v0.7.0, derived from approved long-map V3 drawing.
 * World-space X is horizontal, Z grows toward the next stage (north).
 * Object names are stable so tests and future designers can reason in units.
 */
export const LONG_MAP=Object.freeze({
 bounds:Object.freeze({minX:-35,maxX:35,minZ:-55,maxZ:55}),
 spawn:Object.freeze({x:0,z:-47}),
 initialOre:Object.freeze({x:0,z:-39,radius:7}),
 digitGate:Object.freeze({x:0,z:-28,half:6,apertureHalf:5.65}),
 digitGatePad:Object.freeze({x:-17,z:-28,halfX:3.8,halfZ:1.65}),
 coinValuePad:Object.freeze({x:17,z:-28,halfX:3.8,halfZ:1.65}),
 river1:Object.freeze({z:-8,halfDepth:6,bridgeX:0}),
 bridgePad:Object.freeze({x:17,z:-18.0,halfX:3.8,halfZ:1.65}),
 crusher:Object.freeze({x:0,z:8,halfWidth:7,halfDepth:1.6}),
 crusherPad:Object.freeze({x:-17,z:8,halfX:3.8,halfZ:1.65}),
 vehiclePad:Object.freeze({x:18,z:11,halfX:5.6,halfZ:4.5,previewX:18,previewZ:20}),
 river2:Object.freeze({z:36,halfDepth:5,bridgeX:0}),
 exitPad:Object.freeze({x:17,z:27.2,halfX:4.8,halfZ:1.65}),
 nextBridge:Object.freeze({x:0,z:36,width:10,depth:10}),
 entry:Object.freeze({x:0,z:47,halfWidth:6}),
 northPath:Object.freeze({x:0,z:25,width:26,depth:10})
});
export const MAIN_BRIDGE_WIDTHS=Object.freeze([12,15,18,22,26]);
export function mainBridgeWidth(tracks){
 const tier=Number.isFinite(tracks?.bridge?.level)?Math.floor(tracks.bridge.level):0;
 return MAIN_BRIDGE_WIDTHS[Math.max(0,Math.min(MAIN_BRIDGE_WIDTHS.length-1,tier))];
}
export function nextBridgeUnlocked(tracks){return (tracks?.exit?.level||0)>=1;}
