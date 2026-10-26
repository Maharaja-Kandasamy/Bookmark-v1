(function(root){
  function describeProgress(state) {
    if(state.status === 'completed')return 'Finished';
    if(state.status === 'cancelled')return 'Stopped';
    if(state.status === 'incomplete')return 'Needs attention - open results';
    if(state.status === 'error')return state.source ? 'Needs attention' : 'Manual screen required';
    if(state.status === 'paused')return 'Paused';
    if(state.activeQuery?.type === 'links')return `Reviewing links for the top ${(state.tdIds || []).length} matches...`;
    const type=state.activeQuery?.type || '';
    const name=type.startsWith('address')?'address':type.startsWith('banner')?'business name':type==='phone'?'phone':type==='store-banner'?'store number':'records';
    if(['running','waiting'].includes(state.status))return state.activeQuery ? `Searching ${name} · ${state.progress || 0} of ${state.total || 0}` : 'Starting searches...';
    return 'Ready';
  }
  root.PickerBookmarkProgress={describeProgress};
})(typeof globalThis !== 'undefined' ? globalThis : this);
