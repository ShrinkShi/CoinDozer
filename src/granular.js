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
export const PARTICLE_SHAPES = Object.freeze({
  blue: {radius: .285, halfHeight: .285, drag: 3.4, restitution: .23},
  gold: {radius: .285, halfHeight: .140, drag: 4.7, restitution: .10},
  pearl: {radius: .455, halfHeight: .445, drag: 3.0, restitution: .18},
  ingot: {radius: .32, halfHeight: .245, drag: 4.0, restitution: .13},
  green: {radius: .51, halfHeight: .50, drag: 3.2, restitution: .20},
});

const S = kind => PARTICLE_SHAPES[kind] || PARTICLE_SHAPES.blue;
const HORIZONTAL_BUCKET = 1.05;
const GRAVITY = 20.5;
const MAX_SPEED = 16;

export class GranularSolver {
  constructor(){
    this.contacts = 0;
    this.height = 0;
    this.lastPairs = 0;
    this.grid = new Map();
    this.moving = [];
  }

  step(resources, dt, player, previousPlayer = player){
    // Restrict numerical step length: a lost frame must not tunnel through piles.
    const passes = Math.max(1, Math.min(3, Math.ceil(dt / .019)));
    const h = dt / passes;
    for(let s=0;s<passes;s++)this.substep(resources,h,player,previousPlayer,passes);
  }

  substep(resources, dt, player, previousPlayer, substeps){
    this.contacts=0;
    this.height=0;
    const vx=Math.sin(player.yaw), vz=-Math.cos(player.yaw);
    const rx=Math.cos(player.yaw), rz=Math.sin(player.yaw);
    const playerDx=player.x-previousPlayer.x,playerDz=player.z-previousPlayer.z;
    // The lip follows the machine, not an invisible attraction toward the player.
    const travel=Math.max(0,(playerDx*vx+playerDz*vz)/substeps);
    const driving=player.speed>.18 && travel>0;
    const displacement=driving?Math.min(.38,travel*1.5):0;
    const nowMoving=[];
    for(let i=0;i<resources.length;i++){
      const p=resources[i];if(p.dead)continue;
      const shape=S(p.kind),onGround=p.y<.012;
      p.vy=Number.isFinite(p.vy)?p.vy:0;
      p.vx=Number.isFinite(p.vx)?p.vx:0;
      p.vz=Number.isFinite(p.vz)?p.vz:0;
      const drag=Math.exp(-shape.drag*dt*(onGround?1:.17));
      p.vx*=drag;p.vz*=drag;
      p.vy-=GRAVITY*dt;
      p.prevX=p.x;p.prevZ=p.z;p.prevY=p.y;
      p.x+=p.vx*dt;p.z+=p.vz*dt;
      p.y+=p.vy*dt;
      if(p.y<0){p.y=0;if(p.vy<0)p.vy= -p.vy*shape.restitution;if(p.vy<.20)p.vy=0;}
      // A standing vehicle must NOT pull resources into its scoop.
      if(driving){
        let dx=p.x-player.x,dz=p.z-player.z;
        let ahead=dx*vx+dz*vz,side=dx*rx+dz*rz;
        const halfWidth=(player.level>=2?2.16:1.94);
        const lip=2.78-.18*Math.min(2.2,p.y);
        const inFront=ahead>1.50 && ahead<lip+shape.radius+.25;
        const inside=Math.abs(side)<halfWidth+shape.radius;
        if(inFront&&inside){
          const depth=lip+shape.radius*.62-ahead;
          if(depth>0){
            const push=Math.min(.36,depth*.90 + displacement*.28);
            p.x+=vx*push;p.z+=vz*push;
            // Kinetic energy propagates through neighbours via the PBD solver.
            const along=p.vx*vx+p.vz*vz;
            const transfer=clamp((player.speed*.94-along)*.56,0,3.0);
            p.vx+=vx*transfer;
            p.vz+=vz*transfer;
            // Curved scoop wall feeds coins upward only after a real collision.
            const rise=clamp((depth+.09)*.47,0,.34);
            p.vy+=rise*player.speed*.58;
            // Past the side plates, pushed material spills outward naturally.
            const edge=clamp((Math.abs(side)-halfWidth*.68)/(halfWidth*.35),0,1);
            if(edge>0){const out=(side<0?-1:1)*edge*player.speed*.19;
              p.vx+=rx*out;p.vz+=rz*out;
            }
          }
        }
        // Protect wheels/chassis from a resource tunnelling through the bucket.
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
      nowMoving.push(i);
    }

    // 2 relaxation passes. Rehash once per pass because successive contacts can
    // displace a particle across a bucket border. Each neighbour pair is unique.
    const iterations=resources.length>1850?2:3;
    for(let iteration=0;iteration<iterations;iteration++){
      const grid=this.grid;grid.clear();
      for(const i of nowMoving){
        const p=resources[i],key=(Math.floor(p.x/HORIZONTAL_BUCKET))+','+Math.floor(p.z/HORIZONTAL_BUCKET);
        let cells=grid.get(key);if(!cells){cells=[];grid.set(key,cells)}cells.push(i);
      }
      for(const i of nowMoving){
        const a=resources[i],cx=Math.floor(a.x/HORIZONTAL_BUCKET),cz=Math.floor(a.z/HORIZONTAL_BUCKET);
        for(let gx=-1;gx<=1;gx++)for(let gz=-1;gz<=1;gz++){
          const other=grid.get((cx+gx)+','+(cz+gz));if(!other)continue;
          for(let n=0;n<other.length;n++){
            const j=other[n];if(j<=i)continue;
            const b=resources[j];if(b.dead)continue;
            let dx=a.x-b.x,dz=a.z-b.z;
            const sa=S(a.kind),sb=S(b.kind);
            const diameter=sa.radius+sb.radius;
            const vertical=sa.halfHeight+sb.halfHeight;
            const yA=a.y+sa.halfHeight,yB=b.y+sb.halfHeight;
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
