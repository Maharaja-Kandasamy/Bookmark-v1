const copy=document.querySelector('[data-copy-bookmark]');
copy?.addEventListener('click',async()=>{
 const status=document.querySelector('[data-copy-status]');
 try{
  await navigator.clipboard.writeText(document.querySelector('[data-bookmark]').getAttribute('href'));
  copy.textContent='Copied';status.textContent='Bookmark link copied. Paste it into a new bookmark’s URL.';
  setTimeout(()=>{copy.textContent='Copy bookmark link';},1500);
 }catch{
  status.textContent='Right-click the bookmark button and choose Copy link address.';
 }
});
