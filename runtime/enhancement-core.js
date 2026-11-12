(function(root){
  'use strict';
  function sceneAt(scenes,hour){
    return scenes.find(s=>s.hours[0]<s.hours[1]
      ?hour>=s.hours[0]&&hour<s.hours[1]
      :hour>=s.hours[0]||hour<s.hours[1])||null;
  }
  function createDirector(cfg,available,started=Date.now()){
    let queue=[],due=started+Math.max(0,cfg.initialDelaySec??45)*1000;
    return {
      cancel(){queue=[];},
      next(now,hour,busy){
        if(!cfg.enabled||busy){queue=[];return null;}
        if(queue.length)return queue.shift();
        if(now<due)return null;
        due=now+Math.max(60,cfg.sceneIntervalSec??300)*1000;
        const scene=sceneAt(cfg.scenes||[],hour);
        queue=(scene?.actions||[]).filter(name=>available.has(name));
        return queue.shift()||null;
      }
    };
  }
  function expandAnimations(original,cfg){
    const a=JSON.parse(JSON.stringify(original));
    if(Array.isArray(cfg.workSlots)&&cfg.workSlots.length===6){
      a.events={...a.events,workStatus:cfg.workSlots.map(slot=>[...slot])};
    }
    if(cfg.newPoses?.length){
      a.categories.push({id:'新增轻动效',weight:0,actions:[...cfg.newPoses]});
    }
    return a;
  }
  const api={sceneAt,createDirector,expandAnimations};
  if(typeof module!=='undefined')module.exports=api;else root.PetEnhancementCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
