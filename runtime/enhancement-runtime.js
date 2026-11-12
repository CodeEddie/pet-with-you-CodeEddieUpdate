// Optional extension, loaded after events.js and before renderer.js.
(function(){
  'use strict';
  const E=globalThis.PetEnhancementConfig,C=globalThis.PetEnhancementCore;
  if(!E?.enabled||!C)return;
  const original={};
  for(const key of ['playIdle','onWorkTick','onClick','onPointerDown'])original[key]=PetSprite.prototype[key];
  function ensure(s){
    if(s._enhancement)return true;
    if((s.pet.assetRoot||s.pet.id)!=='main')return false;
    s._enhancementBaseWork=JSON.parse(JSON.stringify(s.animations.events?.workStatus||[]));
    s.animations=C.expandAnimations(s.animations,E);
    s.pet={...s.pet,workStatusTexts:E.workTexts};
    const available=new Set([...s.animations.idle,...s.animations.categories.flatMap(c=>c.actions)]);
    s._enhancementAvailable=available;
    s._enhancement=C.createDirector(E,available);
    window.__dshPetDebug.enhancement={enabled:true,version:1,newPoses:E.newPoses.length,workVariants:E.workSlots.map(s=>s.length),scene:null};
    return true;
  }
  function busy(s){
    const state=s.workState||s.latestWorkSnapshot?.state;
    return !!(state&&!['success','error'].includes(state)||s.latestWorkSnapshot?.activeCount>0||
      s.manualPlaying||s.dragState?.active||s.dragState?.dragging||s.chatOpen||s.menuOpen||s.whisperRequest||
      s.whisperOn||s.explicitQuota||s.errorNotice||s.bubbleHover||s.bubbleSelecting||
      s.moveRef!=null||s.throwRef!=null||document.hidden);
  }
  PetSprite.prototype.playIdle=function(){
    if(ensure(this)){
      const date=new Date(),name=this._enhancement.next(date.getTime(),date.getHours(),busy(this));
      if(name){
        this.stopMove();window.__dshPetDebug.enhancement.scene=C.sceneAt(E.scenes,date.getHours())?.id;
        this.playOnce(name);return;
      }
    }
    return original.playIdle.apply(this,arguments);
  };
  PetSprite.prototype.onWorkTick=function(snapshot){
    if(ensure(this)&&snapshot?.state)this._enhancement.cancel();
    return original.onWorkTick.apply(this,arguments);
  };
  PetSprite.prototype.onAnimationLoadFailed=function(name){
    if(!this._enhancement)return;
    this._enhancement.cancel();this._enhancementAvailable.delete(name);
    for(const c of this.animations.categories)c.actions=c.actions.filter(n=>n!==name);
    this.animations.events.workStatus=this.animations.events.workStatus.map((slot,i)=>{
      if(!Array.isArray(slot))return slot;
      const remaining=slot.filter(n=>n!==name);
      return remaining.length?remaining:this._enhancementBaseWork[i];
    });
    const debug=window.__dshPetDebug.enhancement;
    if(debug)debug.failedAssets=[...new Set([...(debug.failedAssets||[]),name])];
  };
  for(const key of ['onClick','onPointerDown']){
    if(typeof original[key]!=='function')continue;
    PetSprite.prototype[key]=function(){this._enhancement?.cancel();return original[key].apply(this,arguments);};
  }
})();
