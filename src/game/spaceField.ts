import * as THREE from 'three';
import { BOARD_SIZE } from './mechanics.ts';

/**
 * An original printed 1960s space-age playing-field illustration.
 * Pure procedural Canvas art: no CDN, no photographic background and no
 * dependency on the screenshot of the concept rendering.
 * The ExtrudeGeometry uses world XY as its top UV coordinates.
 */
export function createCosmicFieldTexture(size = 1536): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const S = size;
  const x = (v: number) => v * S;
  const y = (v: number) => v * S;
  const stroke = (color: string, width: number) => { c.strokeStyle = color; c.lineWidth = width * S; };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, angle: number) => {
    c.beginPath(); c.ellipse(x(cx), y(cy), x(rx), y(ry), angle, 0, Math.PI * 2);
  };
  let seed = 1960;
  const rnd = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

  // Inky midnight enamel, with restrained printed wear around the corners.
  const base = c.createRadialGradient(x(.44), y(.41), x(.08), x(.49), y(.49), x(.78));
  base.addColorStop(0, '#172d43');
  base.addColorStop(.58, '#0b1b30');
  base.addColorStop(1, '#050c1b');
  c.fillStyle = base; c.fillRect(0,0,S,S);

  // Subtle paper/fibre print noise. Fixed seed, never changes between frames.
  for (let i=0;i<13000;i++) {
    const opacity = 0.012 + rnd() * 0.035;
    c.fillStyle = rnd() > .5 ? 'rgba(247,214,154,'+opacity+')' : 'rgba(3,5,14,'+opacity+')';
    c.fillRect(x(rnd()),y(rnd()),Math.max(1,S*rnd()*.0015),Math.max(1,S*rnd()*.001));
  }

  // Retrofuturist orbits; their thin muted inks do not compete with gameplay.
  const orbit = (cx: number, cy: number, rx: number, ry: number, tilt: number, color: string, width: number) => {
    ellipse(cx, cy, rx, ry, tilt); stroke(color,width); c.stroke();
  };
  orbit(.52,.58,.46,.22,-.37,'rgba(216,111,78,.40)',.0024);
  orbit(.50,.57,.42,.34,.62,'rgba(90,160,190,.34)',.0015);
  orbit(.44,.50,.35,.47,-.7,'rgba(239,198,118,.24)',.001);
  orbit(.46,.46,.28,.13,.32,'rgba(111,161,197,.18)',.001);

  // Deterministic vintage printed stars.
  for (let i=0;i<205;i++) {
    const px=rnd(), py=rnd(), r=(rnd()>.90?.0025:.00085)+rnd()*.0007;
    c.beginPath(); c.arc(x(px),y(py),x(r),0,Math.PI*2);
    c.fillStyle = rnd() > .72 ? 'rgba(228,176,101,.58)' : 'rgba(193,221,227,.41)';
    c.fill();
  }
  const star = (cx: number,cy: number,r: number,color: string) => {
    c.save(); c.translate(x(cx),y(cy)); c.beginPath();
    c.moveTo(0,-x(r)); c.lineTo(x(r*.17),-x(r*.16));
    c.lineTo(x(r),0);c.lineTo(x(r*.17),x(r*.16));
    c.lineTo(0,x(r));c.lineTo(-x(r*.17),x(r*.16));
    c.lineTo(-x(r),0);c.lineTo(-x(r*.17),-x(r*.16));c.closePath();
    c.fillStyle=color;c.fill();c.restore();
  };
  [
    [.09,.19,.019], [.80,.14,.014], [.91,.48,.018],
    [.13,.74,.014], [.47,.82,.016], [.73,.62,.014],
    [.37,.38,.010], [.85,.83,.013], [.63,.20,.011],
  ].forEach(([sx,sy,sr],i)=>star(sx,sy,sr,i%3===0?'#eab677':'#9ab5c0'));

  // The cratered Moon is partially cropped into the lower-left corner.
  c.save();
  c.beginPath(); c.arc(x(.025),y(.95),x(.235),0,Math.PI*2);c.clip();
  const moon=c.createRadialGradient(x(-.04),y(.85),x(.015),x(.06),y(.95),x(.25));
  moon.addColorStop(0,'#f2e5c5');moon.addColorStop(.7,'#9dafa6');moon.addColorStop(1,'#526e81');
  c.fillStyle=moon;c.fillRect(0,y(.69),x(.28),y(.31));
  for(let i=0;i<26;i++){const cx=.0+rnd()*.25,cy=.76+rnd()*.25,rr=.004+rnd()*.027;
    ellipse(cx,cy,rr,rr*.8,rnd());stroke('rgba(60,79,89,.42)',.0018);c.stroke();
  }
  c.restore();

  // Miniature hand-printed spiral nebula.
  c.save();c.translate(x(.74),y(.19));c.rotate(.21);
  for(let j=0;j<4;j++){
    c.beginPath();
    for(let t=.1;t<Math.PI*3.2;t+=.045){
      const rad=.005 + t*.0069;
      const sx=Math.cos(t+j*.92)*x(rad),sy=Math.sin(t+j*.92)*y(rad*.57);
      if(t===.1)c.moveTo(sx,sy);else c.lineTo(sx,sy);
    }
    stroke(j%2===0?'rgba(241,189,126,.34)':'rgba(122,165,193,.31)',.002);c.stroke();
  }
  c.restore();

  // Illustrated rocket nose, capsule, porthole and three pale tail fins.
  c.save();c.translate(x(.245),y(.185));c.rotate(.62);
  c.shadowColor='transparent';
  c.beginPath();c.moveTo(0,-x(.104));
  c.bezierCurveTo(x(.049),-x(.062),x(.045),x(.046),0,x(.072));
  c.bezierCurveTo(-x(.045),x(.046),-x(.049),-x(.062),0,-x(.104));
  c.fillStyle='#f4e7cc';c.fill();stroke('#a34137',.003);c.stroke();
  c.fillStyle='#bb4b3b';
  c.beginPath();c.moveTo(-x(.04),x(.028));c.lineTo(-x(.074),x(.079));c.lineTo(-x(.025),x(.06));c.closePath();c.fill();
  c.beginPath();c.moveTo(x(.04),x(.028));c.lineTo(x(.074),x(.079));c.lineTo(x(.025),x(.06));c.closePath();c.fill();
  c.beginPath();c.arc(0,-x(.022),x(.018),0,Math.PI*2);c.fillStyle='#123c5f';c.fill();stroke('#d4a565',.003);c.stroke();
  for(let i=-1;i<=1;i++){
    c.beginPath();c.moveTo(x(i*.013),x(.073));c.lineTo(x(i*.022),x(.11+rnd()*.02));
    stroke(i===0?'#d96948':'#eb9d67',.005);c.stroke();
  }
  c.restore();

  // Saturn with fine illustrative rings at the upper-right.
  const ringedPlanet=(cx: number,cy: number,r: number,body: string,ring: string,rotation: number)=>{
    c.save();c.translate(x(cx),y(cy));c.rotate(rotation);
    c.beginPath();c.ellipse(0,0,x(r*1.75),x(r*.55),0,0,Math.PI*2);
    stroke(ring,.012);c.stroke();
    const gr=c.createRadialGradient(-x(r*.25),-x(r*.22),0,0,0,x(r));
    gr.addColorStop(0,'#ffdca7');gr.addColorStop(.42,body);gr.addColorStop(1,'#7b3637');
    c.fillStyle=gr;c.beginPath();c.arc(0,0,x(r),0,Math.PI*2);c.fill();
    c.beginPath();c.ellipse(0,0,x(r*1.75),x(r*.55),0,0,Math.PI);
    stroke('#f2d0a0',.008);c.stroke();
    c.restore();
  };
  ringedPlanet(.90,.31,.062,'#d3654e','#e5cc9f',-.32);
  ringedPlanet(.75,.79,.031,'#357d9b','#c4ab78',.16);
  // Mars.
  c.beginPath();c.arc(x(.89),y(.80),x(.052),0,Math.PI*2);
  const mars=c.createRadialGradient(x(.87),y(.775),0,x(.89),y(.80),x(.056));
  mars.addColorStop(0,'#e08a5d');mars.addColorStop(.66,'#b44d3e');mars.addColorStop(1,'#5f2531');
  c.fillStyle=mars;c.fill();

  // Mission heading resembles silkscreen ink and is part of the field, not HUD.
  c.save();c.translate(x(.405),y(.115));c.rotate(-.075);
  c.font='bold '+Math.round(S*.061)+'px Georgia, serif';
  c.fillStyle='#f0d9ad';c.shadowColor='rgba(0,0,0,.45)';c.shadowBlur=5;
  c.fillText('SPACE MAZE',0,0);
  c.restore();
  c.beginPath();c.moveTo(x(.40),y(.14));c.quadraticCurveTo(x(.58),y(.16),x(.66),y(.135));
  stroke('#b94f43',.004);c.stroke();

  const vignette=c.createRadialGradient(x(.5),y(.5),x(.26),x(.5),y(.5),x(.69));
  vignette.addColorStop(0,'rgba(4,8,18,0)');vignette.addColorStop(1,'rgba(2,4,13,.32)');
  c.fillStyle=vignette;c.fillRect(0,0,S,S);

  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  // ExtrudeGeometry's generated UVs are unnormalised, in board coordinates.
  // Normalize the shared [-BOARD_SIZE/2, BOARD_SIZE/2] physical playing field.
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(1/BOARD_SIZE,1/BOARD_SIZE);
  texture.offset.set(.5,.5);
  texture.anisotropy=8;
  return texture;
}
