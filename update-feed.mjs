// هر ۳۰ دقیقه توسط GitHub Actions اجرا می‌شود: داده + پوسترها را کنار سایت ذخیره می‌کند (feed.json و پوشه‌ی img)
import fs from 'node:fs';
const API='https://graphql.anilist.co',M='id idMal title{romaji} coverImage{extraLarge} averageScore popularity status format seasonYear isAdult';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ani(q,v){for(let i=0;i<3;i++){try{
  const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({query:q,variables:v})});
  if(r.status===429){await sleep(15000);continue}
  const j=await r.json();if(j.errors)throw new Error(JSON.stringify(j.errors));return j.data}catch(e){if(i===2)throw e;await sleep(3000)}}}
const ST={RELEASING:'Currently Airing',FINISHED:'Finished Airing',NOT_YET_RELEASED:'Not yet aired'};
const item=(m,x)=>({id:'a'+m.id,mal:m.idMal||0,title:m.title.romaji,cover:m.coverImage.extraLarge,score:m.averageScore?(m.averageScore/10).toFixed(1):0,year:m.seasonYear||'',status:ST[m.status]||'Currently Airing',type:m.format==='MOVIE'?'Movie':'TV',...x});
const now=Math.floor(Date.now()/1000);
const sj=await ani(`query($s:MediaSeason,$y:Int){Page(perPage:30){media(season:$s,seasonYear:$y,type:ANIME,sort:POPULARITY_DESC,isAdult:false,status:RELEASING){${M} nextAiringEpisode{airingAt}}}}`,{s:['WINTER','SPRING','SUMMER','FALL'][Math.floor(new Date().getMonth()/3)],y:new Date().getFullYear()});
const season=sj.Page.media.map(m=>item(m,{target:m.nextAiringEpisode?m.nextAiringEpisode.airingAt*1000:0}));
let sched=[];
for(let p=1;p<=10;p++){
  const j=await ani(`query($a:Int,$b:Int,$p:Int){Page(page:$p,perPage:50){pageInfo{hasNextPage}airingSchedules(airingAt_greater:$a,airingAt_lesser:$b,sort:TIME){airingAt episode media{${M}}}}}`,{a:now-50*3600,b:now+36*3600,p});
  sched.push(...j.Page.airingSchedules.filter(x=>!x.media.isAdult&&(x.media.popularity||0)>=3000));
  if(!j.Page.pageInfo.hasNextPage)break;await sleep(1500);
}
const si=x=>item(x.media,{at:x.airingAt*1000,target:x.airingAt*1000,epn:x.episode});
const today=sched.filter(x=>x.airingAt>now-24*3600).map(si);
const seen=new Set();
const recent=sched.filter(x=>x.airingAt<=now).reverse().filter(x=>!seen.has(x.media.id)&&seen.add(x.media.id)).slice(0,24).map(si);
fs.mkdirSync('img',{recursive:true});
const all=new Map();[...season,...today,...recent].forEach(x=>all.set(x.id,x.cover));
for(const [id,url] of all){const f=`img/${id}.jpg`;if(fs.existsSync(f))continue;
  try{const r=await fetch(url);if(r.ok)fs.writeFileSync(f,Buffer.from(await r.arrayBuffer()))}catch(e){}}
for(const f of fs.readdirSync('img'))if(!all.has(f.replace('.jpg','')))fs.unlinkSync('img/'+f);
const fix=({cover,...r})=>({...r,image:fs.existsSync(`img/${r.id}.jpg`)?`img/${r.id}.jpg`:cover});
fs.writeFileSync('feed.json',JSON.stringify({updated:Date.now(),season:season.map(fix),today:today.map(fix),recent:recent.map(fix)}));
console.log('ok',season.length,today.length,recent.length,'images',all.size);
