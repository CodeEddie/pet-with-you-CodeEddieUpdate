(function(root){
  function snapPosition({x,y,width,height,canvasHeight,targets,attachment,threshold=36,gap=3}){
    const cx=x+width/2;
    // The taskbar meets the standing baseline. Other edges keep the animation clearance.
    const offset=t=>t.alignFeet?height:canvasHeight+gap;
    const valid=targets.filter(t=>Number.isFinite(t.y)&&cx>=t.x&&cx<=t.x+t.width&&t.y-offset(t)>=t.top);
    const kept=valid.find(t=>t.id===attachment);
    const feetDistance=t=>Math.abs(y+height-t.y);
    const taskbar=valid.filter(t=>t.alignFeet&&feetDistance(t)<=threshold)
      .sort((a,b)=>feetDistance(a)-feetDistance(b))[0];
    const near=valid.filter(t=>Math.min(feetDistance(t),Math.abs(y+canvasHeight+gap-t.y))<=threshold)
      .sort((a,b)=>a.y-b.y);
    const t=taskbar||kept||near[0];
    return t?{x,y:t.y-offset(t),attachment:t.id,...(t.alignFeet?{alignFeet:true}:{})}:{x,y,attachment:null};
  }
  if(typeof module==='object')module.exports={snapPosition};else root.PetSnap={snapPosition};
})(typeof window==='object'?window:globalThis);
