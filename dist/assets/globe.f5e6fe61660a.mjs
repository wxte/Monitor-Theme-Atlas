import createGlobe from './vendor/cobe.533371dbdeae.mjs';

const COUNTRY={
US:[38,-97],CA:[56,-106],MX:[23,-102],BR:[-10,-52],AR:[-34,-64],CL:[-30,-71],CO:[4,-72],PE:[-10,-76],
GB:[54,-2],IE:[53,-8],FR:[46,2],DE:[51,10],NL:[52,5],BE:[51,4],ES:[40,-4],PT:[39,-8],IT:[42,12],CH:[47,8],AT:[47,14],
SE:[62,15],NO:[62,10],FI:[64,26],DK:[56,10],PL:[52,20],CZ:[50,15],SK:[48.7,19.7],HU:[47,19],RO:[46,25],BG:[43,25],RS:[44,21],HR:[45,16],SI:[46,15],LT:[55,24],LV:[57,25],EE:[59,26],IS:[65,-19],LU:[49.8,6.1],GR:[39,22],CY:[35,33],UA:[49,32],RU:[61,90],
TR:[39,35],IL:[31,35],AE:[24,54],SA:[24,45],QA:[25.3,51.2],KW:[29.3,47.5],OM:[20.5,57],BH:[26,50.5],KZ:[48,67],UZ:[41,64],IN:[22,79],PK:[30,69],BD:[24,90],NP:[28,84],LK:[7,81],
CN:[35,104],HK:[22.3,114.2],MO:[22.2,113.5],TW:[23.7,121],JP:[36,138],KR:[36,128],MN:[46,104],SG:[1.35,103.8],MY:[4,102],TH:[15,101],VN:[16,108],MM:[21,96],KH:[12.5,105],LA:[18,103],BN:[4.5,114.7],ID:[-3,118],PH:[13,122],
AU:[-25,134],NZ:[-42,174],ZA:[-30,25],EG:[27,30],NG:[9,8],KE:[1,38]
};

const DPR=Math.min(2,Math.max(1,Number(globalThis.devicePixelRatio)||1));
const MAP_SAMPLES=16000;
const ROTATION_PER_FRAME=.0018;

function palette(){
  const dark=document.documentElement.classList.contains('dark');
  return dark?{
    dark:1,diffuse:1.2,mapBrightness:4,mapBaseBrightness:0,
    baseColor:[.78,.86,.90],markerColor:[.15,.72,.46],glowColor:[.102,.125,.145],opacity:1
  }:{
    dark:0,diffuse:1.2,mapBrightness:6,mapBaseBrightness:0,
    baseColor:[1,1,1],markerColor:[.10,.65,.40],glowColor:[1,1,1],opacity:1
  };
}

function grouped(nodes){
  const out=new Map();
  for(const node of nodes||[]){
    const code=String(node?.country||'').trim().toUpperCase();
    const location=COUNTRY[code];
    if(!location)continue;
    const g=out.get(code)||{key:code,code,count:0,online:0,location,members:[]};
    g.count++;if(node?.online)g.online++;g.members.push(node);out.set(code,g);
  }
  return [...out.values()];
}

function markerId(code){
  return `region-${String(code||'').toLowerCase().replace(/[^a-z0-9_-]/g,'-')}`;
}


export class AtlasGlobe{
  constructor(canvas){
    this.canvas=canvas;
    this.stage=canvas?.closest('.globe-stage')||canvas?.parentElement;
    this.holder=document.getElementById('atlas-globe-holder')||canvas?.parentElement;
    this.labelsRoot=document.getElementById('atlas-globe-labels');
    this.groups=[];this.labels=new Map();this.phi=-2.35;this.theta=.2;
    this.drag=null;this.failed=false;this.destroyed=false;this.frame=0;
    this.renderSize=0;this.dark=null;this.dirty=true;
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.bind();this.measure();this.create();
    this.resizeObserver=new ResizeObserver(()=>{this.measure();this.dirty=true;});
    if(this.stage)this.resizeObserver.observe(this.stage);
    if(this.holder&&this.holder!==this.stage)this.resizeObserver.observe(this.holder);
    this.themeObserver=new MutationObserver(()=>{this.dark=null;this.dirty=true;});
    this.themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  }

  bind(){
    const c=this.canvas;if(!c)return;
    c.addEventListener('pointerdown',e=>{
      this.drag={x:e.clientX,y:e.clientY};
      try{c.setPointerCapture?.(e.pointerId)}catch{}
    });
    c.addEventListener('pointermove',e=>{
      if(!this.drag)return;
      this.phi+=(e.clientX-this.drag.x)*.008;
      this.theta=Math.max(-1.2,Math.min(1.2,this.theta+(e.clientY-this.drag.y)*.005));
      this.drag={x:e.clientX,y:e.clientY};
    },{passive:true});
    const end=()=>{this.drag=null;};
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(ev,end);
    c.addEventListener('webglcontextlost',e=>{e.preventDefault();this.unavailable();});
  }

  measure(){
    this.stageWidth=this.stage?.clientWidth||0;
    this.stageHeight=this.stage?.clientHeight||0;
    this.globeSize=this.holder?.clientWidth||310;
  }

  create(){
    if(!this.canvas)return;
    const p=palette(),size=this.globeSize||310;
    try{
      this.instance=createGlobe(this.canvas,{
        devicePixelRatio:DPR,width:size,height:size,
        phi:this.phi,theta:this.theta,dark:p.dark,diffuse:p.diffuse,
        mapSamples:MAP_SAMPLES,mapBrightness:p.mapBrightness,mapBaseBrightness:p.mapBaseBrightness,
        baseColor:p.baseColor,markerColor:p.markerColor,glowColor:p.glowColor,
        markerElevation:.05,scale:1,offset:[0,0],opacity:p.opacity,
        markers:[],arcs:[],onTextureError:()=>this.unavailable()
      });
      // COBE v2 wraps the canvas and owns the hidden marker anchor elements.
      this.cobeWrapper=this.canvas.parentElement;
      // Keep labels inside COBE's own wrapper so they share the exact marker-anchor coordinate space.
      // Position/visibility below are read from COBE-generated anchors; no sphere projection is duplicated here.
      if(this.labelsRoot&&this.cobeWrapper&&this.labelsRoot.parentElement!==this.cobeWrapper)this.cobeWrapper.append(this.labelsRoot);
      this.syncLabels();
      this.loop();
    }catch{this.unavailable();}
  }

  unavailable(){
    this.failed=true;
    if(this.frame)cancelAnimationFrame(this.frame);
    this.frame=0;
    if(this.canvas)this.canvas.style.display='none';
    if(this.labelsRoot)this.labelsRoot.style.display='none';
  }

  setNodes(nodes){
    this.groups=grouped(nodes);
    this.syncLabels();
    this.dirty=true;
  }

  labelHtml(g){
    const icons=globalThis.AtlasThemeIcons;
    const flag=icons?.flag?icons.flag(g.code,'globe-flag'):'';
    const name=icons?.countryName?icons.countryName(g.code):g.code;
    return {html:`${flag}<b>${g.code}</b>${g.count>1?`<span class="globe-label-count">${g.count}</span>`:''}`,name};
  }

  syncLabels(){
    if(!this.labelsRoot)return;
    const keep=new Set();
    for(const g of this.groups){
      const id=markerId(g.code);keep.add(g.key);
      let el=this.labels.get(g.key);
      if(!el){
        el=document.createElement('span');
        el.className='globe-label';
        this.labelsRoot.append(el);this.labels.set(g.key,el);
      }
      const meta=this.labelHtml(g),sig=`${g.code}:${g.count}`;
      if(el.dataset.signature!==sig){
        el.innerHTML=meta.html;el.dataset.signature=sig;
        el.title=`${meta.name} · ${g.count} 个节点`;
      }
      el.dataset.cobeId=id;
      el.classList.add('cobe-bound');
      el.style.positionAnchor='auto';
      el.style.opacity='0';
      el.style.filter='none';
      el.style.left='0';el.style.top='0';el.style.bottom='auto';
    }
    for(const [key,el] of this.labels){if(!keep.has(key)){el.remove();this.labels.delete(key);}}
  }

  markers(){
    return this.groups.map(g=>({
      id:markerId(g.code),location:g.location,size:.025,
      color:g.online?[.15,.72,.46]:[.65,.4,.4]
    }));
  }

  positionLabels(){
    if(!this.cobeWrapper||!this.labelsRoot)return;
    const rootStyle=getComputedStyle(document.documentElement),anchors=new Map();
    for(const node of this.cobeWrapper.children){
      if(node===this.canvas||node===this.labelsRoot)continue;
      const name=node.style?.getPropertyValue?.('anchor-name')||'';
      if(name)anchors.set(name.trim(),node);
    }
    const width=this.labelsRoot.clientWidth||this.cobeWrapper.clientWidth||this.globeSize||310;
    const height=this.labelsRoot.clientHeight||this.cobeWrapper.clientHeight||this.globeSize||310;
    const mobile=(this.stageWidth||innerWidth)<=760,inset=mobile?14:12,margin=mobile?7:6,candidates=[];
    const limit=(v,min,max)=>Math.max(min,Math.min(max,v));
    for(const el of this.labels.values()){
      const id=el.dataset.cobeId,visible=rootStyle.getPropertyValue(`--cobe-visible-${id}`).trim(),anchor=anchors.get(`--cobe-${id}`);
      if(!visible||!anchor){el.style.opacity='0';continue;}
      const px=Number.parseFloat(anchor.style.left),py=Number.parseFloat(anchor.style.top);
      if(!Number.isFinite(px)||!Number.isFinite(py)){el.style.opacity='0';continue;}
      const w=Math.max(34,el.offsetWidth||0),h=Math.max(18,el.offsetHeight||0);
      const rawX=px/100*width,rawY=py/100*height;
      const x=limit(rawX,inset+w/2,Math.max(inset+w/2,width-inset-w/2));
      const y=limit(rawY,inset+h/2,Math.max(inset+h/2,height-inset-h/2));
      candidates.push({el,x,y,w,h,rawY});
    }
    candidates.sort((a,b)=>a.rawY-b.rawY||a.x-b.x);
    const placed=[],offsets=mobile?[[0,0],[0,-16],[0,16],[-18,0],[18,0],[-16,-16],[16,16],[-16,16],[16,-16],[0,-32],[0,32]]:[[0,0],[0,-14],[0,14],[-16,0],[16,0],[-14,-14],[14,14],[-14,14],[14,-14],[0,-28],[0,28]];
    for(const c of candidates){
      let chosenX=c.x,chosenY=c.y,chosenRect=null;
      for(const [dx,dy] of offsets){
        const x=limit(c.x+dx,inset+c.w/2,Math.max(inset+c.w/2,width-inset-c.w/2));
        const y=limit(c.y+dy,inset+c.h/2,Math.max(inset+c.h/2,height-inset-c.h/2));
        const rect={left:x-c.w/2-margin,right:x+c.w/2+margin,top:y-c.h/2-margin,bottom:y+c.h/2+margin};
        const hit=placed.some(p=>!(rect.right<=p.left||rect.left>=p.right||rect.bottom<=p.top||rect.top>=p.bottom));
        if(!hit){chosenX=x;chosenY=y;chosenRect=rect;break;}
      }
      if(!chosenRect)chosenRect={left:chosenX-c.w/2-margin,right:chosenX+c.w/2+margin,top:chosenY-c.h/2-margin,bottom:chosenY+c.h/2+margin};
      placed.push(chosenRect);
      c.el.style.left=`${chosenX.toFixed(1)}px`;
      c.el.style.top=`${chosenY.toFixed(1)}px`;
      c.el.style.opacity='1';
    }
  }

  loop(){
    if(this.destroyed||this.failed)return;
    if(!document.hidden){
      this.measure();
      if(!this.drag&&!this.reduced.matches)this.phi=(this.phi+ROTATION_PER_FRAME)%(Math.PI*2);
      const dark=document.documentElement.classList.contains('dark');
      const appearance=(this.dirty||dark!==this.dark)?{...palette(),markers:this.markers(),arcs:[]}:{};
      const size=this.globeSize||310;
      const dimensions=size!==this.renderSize?{width:size,height:size}:{};
      this.instance?.update({phi:this.phi,theta:this.theta,...dimensions,...appearance});
      this.renderSize=size;this.dark=dark;this.dirty=false;
      this.positionLabels();
    }
    this.frame=requestAnimationFrame(()=>this.loop());
  }

  destroy(){
    this.destroyed=true;
    if(this.frame)cancelAnimationFrame(this.frame);
    this.frame=0;
    try{this.resizeObserver?.disconnect()}catch{}
    try{this.themeObserver?.disconnect()}catch{}
    try{this.instance?.destroy?.()}catch{}
    for(const el of this.labels.values())el.remove();this.labels.clear();this.instance=null;
  }
}
