(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PickerBotLayout=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function buildFullAddress(source={}) { return [source.address,source.city,source.state,source.zip].map(v=>String(v||'').trim()).filter(Boolean).join(', '); }
  function computePanelPlacement(anchor,panel,viewport,margin=12){
    const width=Math.min(panel.width,Math.max(0,viewport.width-margin*2));
    const height=Math.min(panel.height,Math.max(0,viewport.height-margin*2));
    const leftRoom=anchor.left-margin, rightRoom=viewport.width-anchor.right-margin;
    const above=anchor.top-margin, below=viewport.height-anchor.bottom-margin;
    let left,top;
    if (above >= height+10 || below >= height+10) {
      const anchorWidth=anchor.width ?? (anchor.right-anchor.left);
      left=clamp(anchor.left+anchorWidth/2-width/2,margin,viewport.width-width-margin);
      top=above>=height+10?anchor.top-height-10:anchor.bottom+10;
    } else {
      left=rightRoom>=leftRoom?anchor.right+10:anchor.left-width-10;
      left=clamp(left,margin,viewport.width-width-margin);
      const anchorHeight=anchor.height ?? (anchor.bottom-anchor.top);
      top=clamp(anchor.top+anchorHeight/2-height/2,margin,viewport.height-height-margin);
    }
    return {left,top,width,maxHeight:height};
  }
  return {buildFullAddress,computePanelPlacement};
});
