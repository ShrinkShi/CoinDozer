/**
 * A compact 2.5D granular dynamics solver for the original advert's visible
 * bulldozed piles. Coordinates are in metres. Particle y is the *bottom*
 * height above the ground (not the mesh centre).
 *
 * Contact uses anisotropic ellipsoids: coins are short cylinders and blue
 * pellets are almost spherical. This intentionally does not claim full rigid
 * body dynamics (there is no angular collision or friction cone solver).
 * No dependencies, no allocations proportional to particle count squared.
 */
import {clamp} from './math.js';
import {headingBasis} from './heading.js';
import {nearestScoopContact,SCOOP_HALF_WIDTH,SCOOP_PROFILE} from './scoop.js';
import {StaticCollisionField} from './collisions.js';
export const PARTICLE_SHAPES = Object.freeze({
  blue: {radius: .285, halfHeight: .285, drag: 3.4, restitution: .23},
  gold: {radius: .350, halfHeight: .140, drag: 4.7, restitution: .10},
  pearl: {radius: .455, halfHeight: .445, drag: 3.0, restitution: .18},
  ingot: {radius: .32, halfHeight: .245, drag: 4.0, restitution: .13},
  green: {radius: .51, halfHeight: .50, drag: 3.2, restitution: .20},
});

const S = kind => PARTICLE_SHAPES[kind] || PARTICLE_SHAPES.blue;
const HORIZONTAL_BUCKET = 1.05;
const GRAVITY = 20.5;
const MAX_SPEED = 16;
const COIN_MAX_TILT = 1.43; // ~82°, allows edge-on relief without 180° flipped normals

/** A coin's vertical support extends as the cylinder tilts. This feeds the
 * contact solver AND rendering; the displayed coin never rests under the floor.
 * Not a full rigid-body inertia tensor; lightweight browser granular dynamics.
 */
export function particleHalfHeight(p){
  const s=S(p.kind);
  if(p.kind!=='gold')return s.halfHeight;
  const tilt=Math.min(COIN_MAX_TILT,Math.hypot(p.tiltX||0,p.tiltZ||0));
  return s.halfHeight*Math.cos(tilt)+s.radius*Math.sin(tilt);
}

export function updateCoinOrientation(p,dt,onGround){
  if(p.kind!=='gold')return;
  p.tiltX=Number.isFinite(p.tiltX)?p.tiltX:0;
  p.tiltZ=Number.isFinite(p.tiltZ)?p.tiltZ:0;
  p.omegaX=Number.isFinite(p.omegaX)?p.omegaX:0;
  p.omegaZ=Number.isFinite(p.omegaZ)?p.omegaZ:0;
  p.angle=Number.isFinite(p.angle)?p.angle:(p.spin||0);
  const rolling=onGround?4.8:.9;
  // A coin translates along +x while spinning around its local -z axis.
  p.omegaX+=(clamp(p.vz/Math.max(.21,S(p.kind).radius),-7,7)*.44-p.omegaX)*Math.min(1,dt*rolling);
  p.omegaZ+=(clamp(-p.vx/Math.max(.21,S(p.kind).radius),-7,7)*.44-p.omegaZ)*Math.min(1,dt*rolling);
  p.tiltX=clamp(p.tiltX+p.omegaX*dt,-COIN_MAX_TILT,COIN_MAX_TILT);
  p.tiltZ=clamp(p.tiltZ+p.omegaZ*dt,-COIN_MAX_TILT,COIN_MAX_TILT);
  const speed=Math.hypot(p.vx,p.vz);
  if(onGround&&speed<.5){
    const settle=Math.exp(-dt*(speed<.12?2.0:.6));
    p.tiltX*=settle;p.tiltZ*=settle;
  }
  p.angle+=clamp((p.vx-p.vz)*dt*.12,-.08,.08);
}

function scoopBoundary(height){
  if(height<=SCOOP_PROFILE[0][1])return SCOOP_PROFILE[0][0];
  for(let i=0;i<SCOOP_PROFILE.length-1;i++){
    const [a,h]=SCOOP_PROFILE[i], [b,k]=SCOOP_PROFILE[i+1];
    if(height<=k)return a+(b-a)*(height-h)/(k-h);
  }
  return SCOOP_PROFILE[SCOOP_PROFILE.length-1][0];
}

export class GranularSolver {
  constructor(){
    this.contacts = 0;
    this.height = 0;
    this.lastPairs = 0;
    this.lastActive=0;
    this.grid = new Map();
    this.moving = [];
    this.obstacleWorld=null;this.obstacleField=null;this.obstacleContacts=0;
  }

  step(resources, dt, player, previousPlayer = player, world=null){
    if(this.obstacleWorld!==world){
      this.obstacleWorld=world;
      this.obstacleField=world?new StaticCollisionField(world.obstacles||[]):null;
    }
    this.obstacleContacts=0;
    // Restrict numerical step length: a lost frame must not tunnel through piles.
    const passes = Math.max(1, Math.min(3, Math.ceil(dt / .019)));
    const h = dt / passes;
    for(let s=0;s<passes;s++)this.substep(resources,h,player,previousPlayer,passes);
  }

  substep(resources, dt, player, previousPlayer, substeps){
    this.contacts=0;
    this.height=0;
    const {fx:vx,fz:vz,rx,rz}=headingBasis(player.yaw);
    const playerDx=player.x-previousPlayer.x,playerDz=player.z-previousPlayer.z;
    // The lip follows the machine, not an invisible attraction toward the player.
    const travel=Math.max(0,(playerDx*vx+playerDz*vz)/substeps);
    const driving=player.speed>.18 && travel>0;
    const displacement=driving?Math.min(.38,travel*1.5):0;
    const nowMoving=[];
    let simulated=0;
    // The scene can contain 6,500 distinct coins. On low-end phones we
    // schedule granular contacts for the nearest 850 at a time; all other
    // coins remain individual and visible, and wake as the shovel approaches.
    // This is a contact-solver budget, NOT a visual or logical aggregation.
    let active=null;
    if(resources.length>1250){
      const nearby=[];
      for(let i=0;i<resources.length;i++){
        const r=resources[i];if(r.dead)continue;
        const d=(r.x-player.x)**2+(r.z-player.z)**2;
        const motion=Math.abs(r.vx||0)+Math.abs(r.vz||0)+Math.abs(r.vy||0);
        if(d<19*19||motion>.45)nearby.push({i,priority:d-motion*4});
      }
      nearby.sort((a,b)=>a.priority-b.priority);
      active=new Set(nearby.slice(0,850).map(r=>r.i));
    }
    for(let i=0;i<resources.length;i++){
      if(active&&!active.has(i))continue;
      const p=resources[i];if(p.dead)continue;
      // Far, settled resources remain individually rendered, but sleep until
      // the machine approaches. No particles are merged or omitted visually.
      const distant=(p.x-player.x)**2+(p.z-player.z)**2>12.7**2;
      if(distant && Math.abs(p.vx||0)+Math.abs(p.vy||0)+Math.abs(p.vz||0)<.28)continue;
      simulated++;
      const shape=S(p.kind),onGround=p.y<.012;
      p.vy=Number.isFinite(p.vy)?p.vy:0;
      p.vx=Number.isFinite(p.vx)?p.vx:0;
      p.vz=Number.isFinite(p.vz)?p.vz:0;
      updateCoinOrientation(p,dt,onGround);
      p._halfHeight=particleHalfHeight(p);
      const drag=Math.exp(-shape.drag*dt*(onGround?1:.17));
      p.vx*=drag;p.vz*=drag;
      p.vy-=GRAVITY*dt;
      p.prevX=p.x;p.prevZ=p.z;p.prevY=p.y;
      p.x+=p.vx*dt;p.z+=p.vz*dt;
      p.y+=p.vy*dt;
      if(p.y<0){p.y=0;if(p.vy<0)p.vy= -p.vy*shape.restitution;if(p.vy<.20)p.vy=0;}
      // Shared seven-segment scoop profile drives both mesh and collision.
      // Projection is applied only on forward driving/contact, never magnetic.
      if(driving){
        const dx=p.x-player.x,dz=p.z-player.z;
        const ahead=dx*vx+dz*vz,side=dx*rx+dz*rz;
        const bucketWidth=SCOOP_HALF_WIDTH*(1+Math.min(4,player.level)*.055)*(1+.17*Math.min(4,player.bladeLevel||0));
        const centre=p.y+p._halfHeight;
        if(ahead>1.42&&ahead<3.24&&centre<1.62&&Math.abs(side)<bucketWidth+shape.radius){
          const contact=nearestScoopContact(ahead,centre);
          const front=scoopBoundary(clamp(centre,.15,1.38));
          // The wall constraint catches high-speed particles that crossed the
          // front lip between ticks; the nearest segment supplies the slope.
          const overlap=front+shape.radius*.35-ahead;
          if(Math.abs(side)<bucketWidth-.09 && overlap>0){
            const correction=Math.min(.32,overlap*.85+displacement*.10);
            p.x+=vx*correction;p.z+=vz*correction;
            const rise=Math.min(.115,correction*contact.nUp*.36);
            p.y+=rise;
            const along=p.vx*vx+p.vz*vz;
            const transfer=clamp((player.speed*.90-along)*.58,0,3.25);
            p.vx+=vx*transfer;
            p.vz+=vz*transfer;
            p.vy+=rise*5.0;
            if(p.kind==='gold'){
              // The scoop induces visible turning, but only after contact.
              p.omegaX+=(side<0?-1:1)*contact.nUp*.26;
              p.omegaZ-=transfer*.27;
            }
          }
          // Scoop side plates occupy the lower metre. A particle too high
          // escapes over the plates; lower particles cannot pass straight
          // through a solid side wall.
          const sideDist=Math.abs(side),normal=side<0?-1:1;
          if(sideDist>bucketWidth-shape.radius*.85 && centre<1.22){
            const penetration=shape.radius*.85-Math.abs(sideDist-bucketWidth);
            if(penetration>0){
              const outside=sideDist>bucketWidth;
              const correction=Math.min(.12,penetration*.45)*(outside?1:-1)*normal;
              p.x+=rx*correction;p.z+=rz*correction;
              p.vx+=rx*correction/dt*.07;p.vz+=rz*correction/dt*.07;
            }
          }
        }
        // Block particles from tunnelling through the front of the chassis.
        if(ahead>-.72&&ahead<1.63&&Math.abs(side)<1.24){
          const back=1.63-ahead;
          p.x+=vx*back*.50;p.z+=vz*back*.50;
          p.vx+=vx*player.speed*.33;p.vz+=vz*player.speed*.33;
        }
      }
      p.vx=clamp(p.vx,-MAX_SPEED,MAX_SPEED);
      p.vz=clamp(p.vz,-MAX_SPEED,MAX_SPEED);
      p.x=clamp(p.x,-30.5,30.5);
      p.z=clamp(p.z,-26.2,29);
      if(this.obstacleField)this.obstacleContacts+=this.obstacleField.resolve(p,shape.radius);
      nowMoving.push(i);
    }

    // 2 relaxation passes. Rehash once per pass because successive contacts can
    // displace a particle across a bucket border. Each neighbour pair is unique.
    const iterations=nowMoving.length>730?1:nowMoving.length>350?2:3;
    this.lastActive=simulated;
    const contactCounts=new Uint8Array(resources.length);
    for(let iteration=0;iteration<iterations;iteration++){
      contactCounts.fill(0);
      const grid=this.grid;grid.clear();
      for(const i of nowMoving){
        const p=resources[i],key=(Math.floor(p.x/HORIZONTAL_BUCKET))+','+Math.floor(p.z/HORIZONTAL_BUCKET);
        let cells=grid.get(key);if(!cells){cells=[];grid.set(key,cells)}cells.push(i);
      }
      for(const i of nowMoving){
        const a=resources[i],cx=Math.floor(a.x/HORIZONTAL_BUCKET),cz=Math.floor(a.z/HORIZONTAL_BUCKET);
        search: for(let gx=-1;gx<=1;gx++)for(let gz=-1;gz<=1;gz++){
          const other=grid.get((cx+gx)+','+(cz+gz));if(!other)continue;
          for(let n=0;n<other.length;n++){
            if(contactCounts[i]>=7)break search;
            const j=other[n];if(j<=i||contactCounts[j]>=7)continue;
            const b=resources[j];if(b.dead)continue;
            let dx=a.x-b.x,dz=a.z-b.z;
            const sa=S(a.kind),sb=S(b.kind);
            const diameter=sa.radius+sb.radius;
            const vertical=(a._halfHeight||sa.halfHeight)+(b._halfHeight||sb.halfHeight);
            const yA=a.y+(a._halfHeight||sa.halfHeight),yB=b.y+(b._halfHeight||sb.halfHeight);
            let dy=yA-yB;
            // Coin stacks have a lower vertical collision distance than spheres.
            // 3D contact excludes particles at different heights on the same x/z.
            if(Math.abs(dy)>=vertical || Math.abs(dx)>=diameter || Math.abs(dz)>=diameter)continue;
            const sy=dy*diameter/vertical;
            let distance=Math.sqrt(dx*dx+dz*dz+sy*sy);
            if(distance>=diameter)continue;
            if(distance<.00001){
              // Stable deterministic tie-breaker avoids NaNs and jitter in piles.
              const a0=((i*1301+j*9277)%2048)/2048*Math.PI*2;
              dx=Math.cos(a0)*.001;dz=Math.sin(a0)*.001;
              dy=i%2?.001:-.001;
              distance=.0011;
            }
            const overlap=Math.min(.23,(diameter-distance)*.53);
            const nx=dx/distance,nz=dz/distance,ny=(dy*diameter/vertical)/distance;
            const cx0=overlap*nx,cz0=overlap*nz;
            const cy0=overlap*ny*vertical/diameter;
            a.x+=cx0;a.z+=cz0;b.x-=cx0;b.z-=cz0;
            a.y+=cy0;b.y-=cy0;
            if(a.y<0)a.y=0;
            if(b.y<0)b.y=0;
            // A little impulse transfer makes pushing a dense pile responsive.
            const transfer=.20;
            let rv=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
            if(rv<0){const impulse=-rv*transfer;
              a.vx+=nx*impulse;a.vz+=nz*impulse;
              b.vx-=nx*impulse;b.vz-=nz*impulse;
            }
            // Rotational impulse makes colliding coins topple and wobble.
            if(a.kind==='gold'&&rv<0){a.omegaX=(a.omegaX||0)+nz*.05;a.omegaZ=(a.omegaZ||0)-nx*.05;}
            if(b.kind==='gold'&&rv<0){b.omegaX=(b.omegaX||0)-nz*.05;b.omegaZ=(b.omegaZ||0)+nx*.05;}
            contactCounts[i]++;contactCounts[j]++;
            this.contacts++;
          }
        }
        a.x=clamp(a.x,-30.5,30.5);
        a.z=clamp(a.z,-26.2,29);
        a.y=clamp(a.y,0,5.2);
      }
    }
    for(const i of nowMoving){
      const a=resources[i];
      if(this.obstacleField)this.obstacleContacts+=this.obstacleField.resolve(a,S(a.kind).radius);
      // Position correction should create limited momentum, not an explosion.
      const dx=a.x-a.prevX,dz=a.z-a.prevZ;
      a.vx=clamp(a.vx+clamp(dx/dt-a.vx,-4,4)*.16,-MAX_SPEED,MAX_SPEED);
      a.vz=clamp(a.vz+clamp(dz/dt-a.vz,-4,4)*.16,-MAX_SPEED,MAX_SPEED);
      if(a.y===0&&a.vy<.1)a.vy=0;
      a.vy=clamp(a.vy,-8,8);
      const radius=S(a.kind).radius;
      a.spin=(a.spin||0)+Math.hypot(dx,dz)*(.3/radius);
      this.height=Math.max(this.height,a.y);
    }
    this.lastPairs=this.contacts;
  }
}
