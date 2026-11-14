import assert from 'node:assert/strict';
import {World} from '../src/world.js';
import {Simulation} from '../src/physics.js';

/** In-engine transport smoke, not mocked GranularSolver:
 * a single independently simulated ore and the real vehicle travel through
 * the actual multiplier, bridge and grinder under ordinary forward input.
 * This is intentionally distinct from direct payCoin / crush unit tests.
 */
const w=new World(0),s=new Simulation(0);
const ore={kind:'blue',x:0,z:-43.8,y:0,vx:0,vz:0,vy:0,
 cooldown:0,spin:0,angle:0,dead:false,passedGates:0};
s.resources=[ore];s.liveCount=s.activeCount=1;
let crossedGate=false,crossedBridge=false,crushed=false;
let maxOreZ=ore.z;
for(let tick=0;tick<500;tick++){
 s.update(.044,0,1,w);
 maxOreZ=Math.max(maxOreZ,ore.z);
 crossedGate ||= s.gateHits>0;
 crossedBridge ||= ore.z>-2;
 crushed ||= s.crushed>0;
 if(crushed)break;
}
assert.ok(s.player.z>0,'real truck can drive from start through the central bridge');
assert.ok(crossedGate,'ore must cross the real gate while being pushed by the truck');
assert.ok(crossedBridge,'same ore must reach the far shore via the open bridge');
assert.ok(crushed,'same ore must reach the north grinder without developer teleports');
assert.ok(ore.kind==='gold','the original ore body becomes an independent coin');
assert.ok(s.resources.filter(r=>!r.dead&&r.kind==='gold').length>=3,
 'physically delivered ore generates real output coins');
assert.equal(s.telemetry.totals.goldProduced,3);
assert.equal(s.telemetry.totals.recycled,0);
console.log('v0.7.1 natural vehicle-driven ore -> gate -> bridge -> grinder -> three coins PASS');
