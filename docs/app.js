const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const paths = {
  book:'<path d="M4 4h7a3 3 0 0 1 3 3v14a3 3 0 0 0-3-3H4z"/><path d="M14 7a3 3 0 0 1 3-3h4v14h-4a3 3 0 0 0-3 3"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  layers:'<rect x="7" y="3" width="13" height="16" rx="2"/><path d="M16 22H5a2 2 0 0 1-2-2V7M10 8h7m-7 4h7"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', x:'<path d="m6 6 12 12M18 6 6 18"/>',
  download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/>',
  right:'<path d="m9 5 7 7-7 7"/>', left:'<path d="m15 5-7 7 7 7"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  edit:'<path d="m4 16-1 5 5-1L20 8l-4-4zM14 6l4 4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.book}</svg>`;
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
hydrateIcons();
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const STORAGE_KEY = 'lemo-workshop-dictionary-v1';
const categories = ['Machine terminology', 'Assemblies', 'Products & film', 'Spare parts', 'Bearings', 'Technical data', 'My terms'];
const names = {de:'German', en:'English', fr:'French'};
let personal = {format:'lemo-workshop-dictionary',version:1,favourites:[],notes:{},overrides:{},custom:[],language:'de'};
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved?.format === personal.format && saved.version === 1) personal = {...personal,...saved};
} catch { storageAvailable = false; }
let entries = [], pages = [], view = 'dictionary', query = '', selectedCategory = '', primary = ['de','en','fr'].includes(personal.language) ? personal.language : 'de';
let reviewOnly = false, pageIndex = 0, currentResults = [], selectedId = null, editorId = null, sourcePage = 1, returnFocus = null, toastTimer, noteTimer;
const PAGE_SIZE = 30;
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(personal)); return true; }
  catch { storageAvailable = false; toast('Your browser could not save changes. Download a backup before closing.'); return false; }
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 4000); }
function normalise(value) { return String(value).toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').replace(/[^a-z0-9]+/g,' ').trim(); }
function searchable(entry) { return normalise([entry.de,entry.en,entry.fr,entry.context,entry.category,personal.notes[entry.id] || ''].join(' ')); }
function allEntries() { return [...entries,...personal.custom].map(entry => ({...entry,...(personal.overrides[entry.id] || {})})); }
function entryById(id) { const entry = entries.find(item => item.id === id) || personal.custom.find(item => item.id === id); return entry && {...entry,...(personal.overrides[id] || {})}; }
function languages() { return [primary,...['de','en','fr'].filter(lang => lang !== primary)]; }
function updateCounts() { $('#total-count').textContent = allEntries().length.toLocaleString(); $('#favourite-count').textContent = personal.favourites.filter(id => !!entryById(id)).length; }
function levenshtein(a,b) { const v=Array.from({length:b.length+1},(_,i)=>i); for(let i=1;i<=a.length;i++){let prev=v[0];v[0]=i;for(let j=1;j<=b.length;j++){const n=v[j];v[j]=Math.min(v[j]+1,v[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=n;}}return v[b.length]; }
function matchingEntries() {
  const tokens = normalise(query).split(' ').filter(Boolean);
  const base = allEntries().filter(entry => (!selectedCategory || entry.category === selectedCategory) && (!reviewOnly || entry.review) && (view !== 'favourites' || personal.favourites.includes(entry.id)));
  let result = base.filter(entry => tokens.every(token => searchable(entry).includes(token)));
  let approximate = false;
  if (!result.length && tokens.length === 1 && tokens[0].length >= 5) {
    const q = tokens[0], maxDistance = q.length > 9 ? 2 : 1;
    result = base.filter(entry => ['de','en','fr'].some(lang => normalise(entry[lang]).split(' ').some(word => Math.abs(word.length-q.length)<=maxDistance && levenshtein(word,q)<=maxDistance)));
    approximate = result.length > 0;
  }
  result.sort((a,b) => {
    if(tokens.length){const aq=normalise(a[primary]),bq=normalise(b[primary]),q=normalise(query);const as=aq===q?-2:aq.startsWith(q)?-1:0,bs=bq===q?-2:bq.startsWith(q)?-1:0;if(as!==bs)return as-bs;}
    const ak=normalise(a[primary]),bk=normalise(b[primary]);
    const ap=/^[a-z]/.test(ak)?0:1,bp=/^[a-z]/.test(bk)?0:1;
    return ap-bp || ak.localeCompare(bk,primary,{sensitivity:'base'}) || a.de.localeCompare(b.de,'de');
  });
  return {result,approximate};
}
function render() {
  updateCounts();
  $$('[data-view]').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active',active); button.setAttribute('aria-current',active?'page':'false'); });
  $$('[data-lang]').forEach(button => { const active = button.dataset.lang === primary; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); });
  const source = view === 'sources';
  $('#dictionary-controls').classList.toggle('hidden',source);
  $('#export-csv').classList.toggle('hidden',source);
  $('#suggestions').classList.toggle('hidden',source || !!query);
  $('#search').placeholder = source ? 'Search the text of all 165 source pages…' : 'Search German, English or French…';
  $('#search').setAttribute('aria-label',source ? 'Search source pages' : 'Search dictionary');
  $('#clear-search').classList.toggle('hidden',!query);
  $('#breadcrumb-view').textContent = source ? 'Source pages' : view === 'favourites' ? 'Favourites' : 'Dictionary';
  $('#view-title').innerHTML = source ? 'The original reference<span>.</span>' : view === 'favourites' ? 'Your go-to terms<span>.</span>' : 'Workshop dictionary<span>.</span>';
  $('#view-description').textContent = source ? 'Browse the scan, check a reading or explore the original explanations.' : view === 'favourites' ? 'The terms you reach for, all in one place.' : 'Find the right term. Keep the context. Get back to work.';
  $('#result-extra').textContent = '';
  if(source) return renderSources();
  const {result,approximate} = matchingEntries(); currentResults = result;
  const totalPages = Math.max(1,Math.ceil(result.length/PAGE_SIZE)); pageIndex=Math.min(pageIndex,totalPages-1);
  $('#result-count').textContent = `${result.length.toLocaleString()} ${result.length===1?'entry':'entries'}${approximate?' · similar spellings':''}`;
  $('#result-extra').textContent = query ? `for “${query}”` : 'across three languages';
  if(!result.length){
    const isFav=view==='favourites' && !personal.favourites.length;
    $('#results').innerHTML=`<div class="empty-state">${icon(isFav?'star':'search')}<h2>${isFav?'Keep the useful ones close.':'No matching terms yet.'}</h2><p>${isFav?'Tap the star beside any term to save it here.':'Try a shorter word or a different spelling, choose all categories, or search the source pages.'}</p><button class="button button-outline" id="empty-action">${isFav?'Browse dictionary':'Search source pages'}</button></div>`;
    $('#empty-action').onclick=()=>setView(isFav?'dictionary':'sources',!isFav); $('#pagination').innerHTML='';return;
  }
  const langs=languages();
  $('#results').innerHTML=`<table class="results-table"><thead><tr><th aria-label="Favourite"></th>${langs.map(lang=>`<th scope="col">${names[lang]} <span>· ${lang.toUpperCase()}</span></th>`).join('')}<th aria-label="Details"></th></tr></thead><tbody>${result.slice(pageIndex*PAGE_SIZE,(pageIndex+1)*PAGE_SIZE).map(entry=>`<tr data-id="${escapeHTML(entry.id)}"><td><button class="star-button ${personal.favourites.includes(entry.id)?'active':''}" data-favourite="${escapeHTML(entry.id)}" aria-pressed="${personal.favourites.includes(entry.id)}" aria-label="${personal.favourites.includes(entry.id)?'Remove':'Add'} ${escapeHTML(entry.de || entry.en || entry.fr)} ${personal.favourites.includes(entry.id)?'from':'to'} favourites">${icon('star')}</button></td>${langs.map((lang,index)=>`<td data-label="${names[lang]}">${index===0?`<button class="term-open" data-open="${escapeHTML(entry.id)}">${escapeHTML(entry[lang] || '—')}</button><div class="term-meta"><span class="category-tag">${escapeHTML(entry.category)}</span>${entry.review?`<span class="review-tag">${icon('info')} Check scan</span>`:''}${personal.overrides[entry.id]?'<span class="category-tag">Personal edit</span>':''}</div>`:entry[lang]?escapeHTML(entry[lang]):'<span class="translation-empty">Not listed</span>'}</td>`).join('')}<td class="arrow">${icon('right')}</td></tr>`).join('')}</tbody></table>`;
  $('#results').querySelectorAll('[data-favourite]').forEach(button=>button.onclick=event=>{event.stopPropagation();toggleFavourite(button.dataset.favourite);});
  $('#results').querySelectorAll('tr[data-id]').forEach(row=>row.onclick=event=>{if(!event.target.closest('[data-favourite]'))openDetail(row.dataset.id);});
  renderPagination(totalPages);
}
function renderPagination(totalPages){$('#pagination').innerHTML=totalPages>1?`<button id="page-previous" ${pageIndex===0?'disabled':''}>Previous</button><span>${pageIndex+1} / ${totalPages}</span><button id="page-next" ${pageIndex>=totalPages-1?'disabled':''}>Next</button>`:'';if(totalPages>1){$('#page-previous').onclick=()=>changePage(-1);$('#page-next').onclick=()=>changePage(1);}}
function changePage(delta){pageIndex+=delta;render();$('#results').scrollIntoView({block:'start',behavior:'instant'});}
function setView(next,keepQuery=false){view=next;pageIndex=0;if(!keepQuery){query='';$('#search').value='';}render();window.scrollTo({top:0,behavior:'instant'});}
function toggleFavourite(id){const index=personal.favourites.indexOf(id);if(index>=0)personal.favourites.splice(index,1);else personal.favourites.push(id);save();render();if(selectedId===id)renderDetail();}
function openDetail(id){const entry=entryById(id);if(!entry)return;returnFocus=document.activeElement;selectedId=id;$('#drawer-overlay').classList.remove('hidden');$('#detail-drawer').classList.remove('hidden');document.body.style.overflow='hidden';renderDetail();$('#detail-drawer').focus();}
function closeDetail(){clearTimeout(noteTimer);flushNote();$('#drawer-overlay').classList.add('hidden');$('#detail-drawer').classList.add('hidden');document.body.style.overflow='';selectedId=null;returnFocus?.focus?.();}
function flushNote(){const note=$('#term-note');if(note&&selectedId){personal.notes[selectedId]=note.value;save();}}
function renderDetail(){
  const entry=entryById(selectedId);if(!entry)return;
  const edited=!!personal.overrides[entry.id],custom=entry.id.startsWith('custom-');
  const fav=personal.favourites.includes(entry.id);
  $('#detail-drawer').innerHTML=`<div class="drawer-top"><span>TERM DETAILS</span><div><button class="star-button ${fav?'active':''}" id="detail-favourite" aria-pressed="${fav}" aria-label="${fav?'Remove from':'Add to'} favourites">${icon('star')}</button><button class="icon-button" id="close-detail" aria-label="Close term details">${icon('x')}</button></div></div><p class="eyebrow">${escapeHTML(entry.category)}</p><h2>${escapeHTML(entry[primary] || entry.de || entry.en || entry.fr)}</h2><div class="detail-tags"><span class="pill">${escapeHTML(entry.context || 'Technical reference')}</span>${custom?'<span class="pill">Added by you</span>':edited?'<span class="pill">Personal edit</span>':entry.verified?'<span class="pill pill-verified">Checked against scan</span>':entry.review?'<span class="pill pill-review">Check scan</span>':'<span class="pill">Scan import</span>'}</div>${languages().map(lang=>`<div class="translation-block"><div><label>${names[lang].toUpperCase()} · ${lang.toUpperCase()}</label><button class="icon-button" data-copy="${lang}" aria-label="Copy ${names[lang]} translation" ${entry[lang]?'':'disabled'}>${icon('copy')}</button></div><p>${entry[lang]?escapeHTML(entry[lang]):'<span class="translation-empty">Not listed</span>'}</p></div>`).join('')}${entry.sources?.length?`<div class="detail-section"><h3>Check the original</h3><div class="source-links">${entry.sources.map(source=>`<button data-source="${source.page}">Page ${source.printed ?? source.page}${source.context?` · ${escapeHTML(source.context)}`:''} ↗</button>`).join('')}</div><p>Labels use the printed page number. Different translations may apply to different machines or functions.</p>${/\*/.test(entry.de)?'<button class="definition-link" id="see-explanations">Open explanations · pages 42–46</button>':''}</div>`:''}${!custom&&!entry.verified&&!edited?'<p class="detail-status">This reading was imported from a scan and has not been manually checked. Compare the original before reusing an unfamiliar term.</p>':''}<div class="detail-section"><h3>Your note</h3><textarea id="term-note" rows="4" maxlength="4000" aria-label="Personal note" placeholder="Machine, customer, context or a reminder…">${escapeHTML(personal.notes[entry.id] || '')}</textarea><div class="note-meta"><span>Saved in this browser</span><span id="note-state">${storageAvailable?'Autosave on':'Storage unavailable · export a backup'}</span></div></div><div class="detail-actions"><button class="button button-outline" id="edit-term">${icon('edit')} Edit term</button><button class="button button-dark" id="copy-all">${icon('copy')} Copy all</button></div>${custom?'<button class="text-button delete-term" id="delete-term">Delete my term</button>':edited?'<button class="text-button" id="reset-term">Restore original reading</button>':''}<p class="drawer-info">Favourites, notes and edits stay in this browser. Use Backup & restore to move them to another device.</p>`;
  $('#close-detail').onclick=closeDetail;$('#detail-favourite').onclick=()=>{flushNote();toggleFavourite(entry.id);};
  $$('[data-copy]').forEach(button=>button.onclick=()=>copy(entry[button.dataset.copy]));
  $('#copy-all').onclick=()=>copy(['de','en','fr'].filter(lang=>entry[lang]).map(lang=>`${names[lang]}: ${entry[lang]}`).join('\n'));
  $$('#detail-drawer [data-source]').forEach(button=>button.onclick=()=>openSource(Number(button.dataset.source)));
  $('#see-explanations')?.addEventListener('click',()=>openSource(44));
  $('#term-note').oninput=()=>{const id=entry.id;personal.notes[id]=$('#term-note').value;$('#note-state').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>{const saved=save();const status=$('#note-state');if(status&&selectedId===id)status.textContent=saved?'Saved':'Export a backup';},500);};
  $('#edit-term').onclick=()=>{flushNote();openEditor(entry.id);};
  $('#delete-term')?.addEventListener('click',()=>{if(!confirm('Delete this term that you added?'))return;personal.custom=personal.custom.filter(item=>item.id!==entry.id);personal.favourites=personal.favourites.filter(id=>id!==entry.id);delete personal.notes[entry.id];delete personal.overrides[entry.id];closeDetail();save();render();toast('Your term was deleted.');});
  $('#reset-term')?.addEventListener('click',()=>{delete personal.overrides[entry.id];save();render();renderDetail();toast('Original scan reading restored.');});
}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('Copied to clipboard.');}catch{const temporary=document.createElement('textarea');temporary.value=text;temporary.style.cssText='position:fixed;opacity:0';const container=$('dialog[open]')||document.body;container.append(temporary);temporary.select();const copied=document.execCommand('copy');temporary.remove();toast(copied?'Copied to clipboard.':'Copy unavailable in this browser. Select the text to copy it.');}}
function openEditor(id=null){editorId=id;const entry=id?entryById(id):null;const form=$('#editor-form');form.reset();$('#editor-error').textContent='';$('#editor-title').textContent=id?'Edit this term':'Add a term';$('#editor-description').textContent=id?'Save your own wording. The original source remains available.':'Add a term you use at work. It stays in this browser.';['de','en','fr'].forEach(lang=>form.elements[lang].value=entry?.[lang]||'');form.elements.category.value=entry?.category||'My terms';form.elements.note.value=id?(personal.notes[id]||''):'';$('#editor-dialog').showModal();form.elements.de.focus();}
$('#editor-form').onsubmit=event=>{
  event.preventDefault();const form=event.currentTarget;const values=Object.fromEntries(['de','en','fr','category'].map(key=>[key,form.elements[key].value.trim()]));
  if(!['de','en','fr'].some(lang=>values[lang])){$('#editor-error').textContent='Enter at least one term.';return;}
  let id=editorId;if(id){if(id.startsWith('custom-')){const index=personal.custom.findIndex(entry=>entry.id===id);personal.custom[index]={...personal.custom[index],...values};}else{personal.overrides[id]={...values,review:false,verified:false};}}else{id='custom-'+(crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);personal.custom.push({...values,id,context:'',sources:[],review:false,verified:false});}
  personal.notes[id]=form.elements.note.value;save();$('#editor-dialog').close();pageIndex=0;render();if(selectedId===id)renderDetail();toast(editorId?'Your wording was saved.':'Your term was added.');
};
function pageTitle(page){const printed=page.printed;if(!printed)return page.page===1?'Cover':'Contents';if(printed===1)return'How to use the reference';if(printed<=9)return'Machine configuration';if(printed<=15)return'Assembly terminology';if(printed<=41)return'Machine terminology';if(printed<=46)return'Term explanations';if(printed<=50)return'Products & film';if(printed<=79)return'Spare parts';if(printed<=83)return'Bearings';if(printed<=86)return'Technical data';if(printed<=125)return'English index';return'French index';}
function renderSources(){const tokens=normalise(query).split(' ').filter(Boolean);const found=pages.filter(page=>tokens.every(token=>normalise(page.text+' '+pageTitle(page)+' '+(page.printed??'')).includes(token)));const totalPages=Math.max(1,Math.ceil(found.length/12));pageIndex=Math.min(pageIndex,totalPages-1);$('#result-count').textContent=`${found.length} source ${found.length===1?'page':'pages'}`;$('#result-extra').textContent=query?`for “${query}”`:'including explanations and reverse indexes';if(!found.length){$('#results').innerHTML='<div class="empty-state"><h2>No matching pages.</h2><p>Try a shorter word. Searchable scan text can contain reading errors.</p></div>';$('#pagination').innerHTML='';return;}$('#results').innerHTML=`<div class="source-grid">${found.slice(pageIndex*12,(pageIndex+1)*12).map(page=>`<button class="source-card" data-source="${page.page}"><div class="source-thumbnail"><img loading="lazy" src="source/${String(page.page).padStart(3,'0')}.jpg" alt="" width="1488" height="2105" style="height:auto"></div><div class="source-card-content"><strong>${escapeHTML(pageTitle(page))}</strong><small>${page.printed?`Printed page ${page.printed}`:'Front matter'} · PDF page ${page.page}</small>${query?`<div class="page-excerpt">${escapeHTML(excerpt(page.text,query))}</div>`:''}</div></button>`).join('')}</div>`;$$('#results [data-source]').forEach(button=>button.onclick=()=>openSource(Number(button.dataset.source)));renderPagination(totalPages);}
function excerpt(text,q){const search=normalise(q).split(' ')[0];let index=normalise(text).indexOf(search);if(index<0)index=0;return text.slice(Math.max(0,index-45),Math.max(0,index-45)+180).replace(/\n/g,' ');}
function openSource(number){sourcePage=Math.max(1,Math.min(165,number));const page=pages.find(item=>item.page===sourcePage);$('#source-title').textContent=`${pageTitle(page)} · ${page.printed?`page ${page.printed}`:`PDF page ${sourcePage}`}`;$('#source-image').src=`source/${String(sourcePage).padStart(3,'0')}.jpg`;$('#source-image').alt=`Original scanned reference, ${page.printed?`printed page ${page.printed}, `:''}PDF page ${sourcePage}`;$('#source-image').classList.remove('zoomed');$('#source-caption').textContent=`PDF page ${sourcePage} of 165${page.printed?` · Printed page ${page.printed}`:''} · Tap the scan to enlarge it.`;$('#previous-source').disabled=sourcePage===1;$('#next-source').disabled=sourcePage===165;if(!$('#source-dialog').open)$('#source-dialog').showModal();$('#source-dialog').scrollTop=0;}
$('#previous-source').onclick=()=>openSource(sourcePage-1);$('#next-source').onclick=()=>openSource(sourcePage+1);$('#source-image').onclick=()=>$('#source-image').classList.toggle('zoomed');
function download(contents,name,mime){const url=URL.createObjectURL(new Blob([contents],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){const text=String(value??'');return '"'+(/^[=+\-@\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')+'"';}
$('#export-csv').onclick=()=>{const rows=[['German','English','French','Category','Context','Source printed pages','Personal note','Favourite','Review scan'],...currentResults.map(entry=>[entry.de,entry.en,entry.fr,entry.category,entry.context,entry.sources?.map(source=>source.printed??`PDF ${source.page}`).join(', '),personal.notes[entry.id]||'',personal.favourites.includes(entry.id)?'Yes':'No',entry.review?'Yes':'No'])];download('\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'LEMO_dictionary.csv','text/csv;charset=utf-8');toast(`Exported ${currentResults.length} entries.`);};
function openBackup(){flushNote();$('#backup-dialog').showModal();}
$('#open-backup').onclick=openBackup;$('#mobile-backup').onclick=openBackup;
$('#download-backup').onclick=()=>{flushNote();download(JSON.stringify({...personal,exportedAt:new Date().toISOString()},null,2),'LEMO_dictionary_backup.json','application/json');toast('Backup downloaded.');};
function validStringMap(value){return value && !Array.isArray(value) && typeof value==='object' && Object.keys(value).every(key=>!['__proto__','constructor','prototype'].includes(key)&&typeof value[key]==='string'&&value[key].length<=4000);}
function safeTerm(term,custom=false){if(!term||typeof term!=='object'||!['de','en','fr'].every(lang=>typeof term[lang]==='string'&&term[lang].length<=600)||!categories.includes(term.category))throw Error('Invalid term');if(custom&&!(typeof term.id==='string'&&term.id.startsWith('custom-')&&term.id.length<100))throw Error('Invalid term ID');return Object.fromEntries(['de','en','fr','category'].map(key=>[key,term[key]]));}
$('#import-backup').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>5_000_000)throw Error('Large file');const data=JSON.parse(await file.text());if(data.format!==personal.format||data.version!==1||!Array.isArray(data.favourites)||!data.favourites.every(id=>typeof id==='string'&&id.length<100)||!validStringMap(data.notes)||!Array.isArray(data.custom)||data.custom.length>10000||!data.overrides||typeof data.overrides!=='object'||Array.isArray(data.overrides))throw Error('Invalid backup');const custom=data.custom.map(term=>({...safeTerm(term,true),id:term.id,context:'',sources:[],review:false,verified:false}));const overrides={};for(const [id,term] of Object.entries(data.overrides)){if(!id.startsWith('scan-'))throw Error('Invalid ID');overrides[id]={...safeTerm(term),review:false,verified:false};}const byId=new Map(personal.custom.map(term=>[term.id,term]));custom.forEach(term=>byId.set(term.id,term));personal.custom=[...byId.values()];personal.notes={...personal.notes,...data.notes};personal.overrides={...personal.overrides,...overrides};personal.favourites=[...new Set([...personal.favourites,...data.favourites])];save();render();if(selectedId)renderDetail();$('#backup-dialog').close();toast('Backup restored. Your existing additions were kept.');}catch{toast('This file is not a valid LEMO dictionary backup.');}finally{event.target.value='';}};
$$('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
$$('[data-lang]').forEach(button=>button.onclick=()=>{primary=button.dataset.lang;personal.language=primary;save();pageIndex=0;render();});
$$('[data-query]').forEach(button=>button.onclick=()=>{query=button.dataset.query;$('#search').value=query;pageIndex=0;render();$('#search').focus();});
$('#search').oninput=event=>{query=event.target.value;pageIndex=0;render();};
$('#clear-search').onclick=()=>{query='';$('#search').value='';pageIndex=0;render();$('#search').focus();};
$('#category').onchange=event=>{selectedCategory=event.target.value;pageIndex=0;render();};
$('#review-only').onchange=event=>{reviewOnly=event.target.checked;pageIndex=0;render();};
$('#add-term').onclick=()=>openEditor();$('#drawer-overlay').onclick=closeDetail;
$$('[data-close-dialog]').forEach(button=>button.onclick=()=>document.getElementById(button.dataset.closeDialog).close());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('dialog[open]')&&selectedId){event.preventDefault();closeDetail();}if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')&&!selectedId){event.preventDefault();$('#search').focus();}if(event.key==='Tab'&&selectedId&&!$('dialog[open]')){const focusable=$$('#detail-drawer button:not([disabled]),#detail-drawer textarea');const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===$('#detail-drawer'))){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
window.addEventListener('beforeunload',()=>{if(selectedId)flushNote();});
categories.forEach(category=>{$('#category').add(new Option(category,category));$('#editor-form').elements.category.add(new Option(category,category));});
async function start(){try{const responses=await Promise.all([fetch('dictionary.json'),fetch('pages.json')]);if(responses.some(response=>!response.ok))throw Error('Reference unavailable');[entries,pages]=await Promise.all(responses.map(response=>response.json()));$('#footer-count').textContent=`${entries.length.toLocaleString()} entries · 165 source pages · DE / EN / FR`;render();if(!storageAvailable)toast('Browser storage is unavailable. Download a backup to keep your additions.');}catch{ $('#result-count').textContent='The reference could not be loaded.';$('#results').innerHTML='<div class="empty-state"><h2>Let’s try that again.</h2><p>Reload this page to load your dictionary.</p><button class="button button-dark" id="retry-load">Try again</button></div>';$('#retry-load').onclick=start;}}
start();
