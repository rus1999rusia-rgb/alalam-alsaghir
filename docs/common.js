"use strict";

const ALALAM_API="https://nojacqpkcqdnxurqoqbk.supabase.co/functions/v1/alalam-api";
const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

const SECTION_CONFIG={
  math_lab:{name:"معمل الرياضيات",icon:"＋",path:"/alalam-alsaghir/math-lab/",page:"math",item:"نشاط",items:"الأنشطة",heading:"الأنشطة المطلوبة",submitTitle:"إرسال تجربة رياضية",description:"اختاري الفصل لمشاهدة أنشطة الرياضيات وتجارب الطالبات.",emptyTitle:"لا توجد أنشطة مطلوبة حاليًا"},
  research:{name:"البحث العلمي",icon:"🔎",path:"/alalam-alsaghir/research/",page:"research",item:"طلب بحث",items:"طلبات البحث",heading:"طلبات البحث الحالية",submitTitle:"إرسال بحث علمي",description:"اختاري الفصل لمشاهدة طلبات البحث وتسليم البحث كتابة أو بصورة.",emptyTitle:"لا توجد طلبات بحث حاليًا"},
  school_trip:{name:"رحلة مدرسية",icon:"🚌",path:"/alalam-alsaghir/school-trip/",page:"trip",item:"فعالية",items:"فعاليات الرحلة",heading:"تفاصيل الرحلة والمهام",submitTitle:"إرسال مشاركة الرحلة",description:"اختاري الفصل لمشاهدة تفاصيل الرحلة والمهام والصور المعتمدة.",emptyTitle:"لا توجد رحلة أو مهام مضافة حاليًا"},
  reading_comprehension:{name:"الفهم القرائي",icon:"📚",path:"/alalam-alsaghir/reading/",page:"reading",item:"نشاط قرائي",items:"الأنشطة القرائية",heading:"أنشطة الفهم القرائي",submitTitle:"إرسال مشاركة قرائية",description:"اختاري الفصل لمشاهدة النصوص والأسئلة والأنشطة القرائية.",emptyTitle:"لا توجد أنشطة قرائية حاليًا"}
};
const SECTION_KEYS=Object.keys(SECTION_CONFIG);

function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char])}
function normalizeSection(section){return SECTION_CONFIG[section]?section:"math_lab"}
function sectionMeta(section){return SECTION_CONFIG[normalizeSection(section)]}
function sectionName(section){return sectionMeta(section).name}
function sectionIcon(section){return sectionMeta(section).icon}
function sectionPath(section){return sectionMeta(section).path}
function formatDate(value){if(!value)return"";try{return new Intl.DateTimeFormat("ar-SA",{year:"numeric",month:"short",day:"numeric"}).format(new Date(value))}catch{return value}}
function starText(value){const count=Math.max(0,Math.min(5,Number(value)||0));return count?"★".repeat(count):"☆"}
function getClassName(data,id){return data?.classes?.find(item=>Number(item.id)===Number(id))?.name||"كل الفصول"}
function emptyState(title,text,icon="✨"){return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`}

function showToast(message,type="ok"){
  let element=$("#toast");
  if(!element){element=document.createElement("div");element.id="toast";element.className="toast";element.setAttribute("role","status");element.setAttribute("aria-live","polite");document.body.append(element)}
  element.textContent=message;element.className=`toast show ${type==="error"?"error":""}`;
  clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>element.className="toast",3500);
}

async function apiRequest(action,payload={},adminToken=""){
  const response=await fetch(ALALAM_API,{method:"POST",headers:{"Content-Type":"application/json",...(adminToken?{"x-admin-token":adminToken}:{})},body:JSON.stringify({action,...payload})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error(result.error||"تعذّر الاتصال، حاولي مرة أخرى"),{status:response.status});
  return result;
}

async function loadPublicData(force=false){
  const cached=sessionStorage.getItem("alalam_public_cache");
  if(!force&&cached){try{const parsed=JSON.parse(cached);if(Date.now()-parsed.savedAt<60000)return parsed.data}catch{}}
  const data=await apiRequest("public_feed");
  sessionStorage.setItem("alalam_public_cache",JSON.stringify({savedAt:Date.now(),data}));
  return data;
}

function clearPublicCache(){sessionStorage.removeItem("alalam_public_cache")}

function canvasToImageBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("تعذّر تجهيز الصورة")),"image/jpeg",quality))}

async function decodeImageFile(file){
  if("createImageBitmap" in window){
    try{const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});return{source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()}}catch{}
  }
  return await new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),image=new Image();image.onload=()=>resolve({source:image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)});image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("تعذّر قراءة الصورة، اختاري صورة أخرى"))};image.src=url})
}

async function prepareImageFile(file){
  if(!(file instanceof File)||!file.size)return null;
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("اختاري صورة بصيغة JPG أو PNG أو WebP");
  const decoded=await decodeImageFile(file);
  try{
    const attempts=[{side:1800,quality:.84},{side:1500,quality:.78},{side:1280,quality:.72}];let blob=null;
    for(const attempt of attempts){
      const scale=Math.min(1,attempt.side/Math.max(decoded.width,decoded.height));
      const width=Math.max(1,Math.round(decoded.width*scale)),height=Math.max(1,Math.round(decoded.height*scale));
      const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d",{alpha:false});if(!context)throw new Error("تعذّر تجهيز الصورة");
      context.fillStyle="#fff";context.fillRect(0,0,width,height);context.drawImage(decoded.source,0,0,width,height);
      blob=await canvasToImageBlob(canvas,attempt.quality);canvas.width=1;canvas.height=1;
      if(blob.size<=2.4*1024*1024)break;
    }
    if(!blob)throw new Error("تعذّر تجهيز الصورة");
    const base=(file.name||"photo").replace(/\.[^.]+$/,"" ).replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,60)||"photo";
    return new File([blob],`${base}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
  }finally{decoded.close()}
}

function applySiteSettings(data){
  const settings=data?.settings||{};
  $$("[data-school-name]").forEach(element=>element.textContent=settings.school_name||"مدرسة الطفولة المبكرة بابتدائية عسفان");
  $$("[data-lab-name]").forEach(element=>element.textContent=settings.lab_name||"العالم الصغير");
  $$("[data-teacher-name]").forEach(element=>element.textContent=settings.teacher_name||"حنان الحربي");
  $$("[data-principal-name]").forEach(element=>element.textContent=settings.principal_name||"ابتسام الجهني");
}

function initNavigation(){
  const toggle=$("#menuToggle"),nav=$("#siteNav");
  if(toggle&&nav)toggle.addEventListener("click",()=>{const open=nav.classList.toggle("open");toggle.setAttribute("aria-expanded",String(open))});
  const current=document.body.dataset.page;
  $$(`[data-nav]`).forEach(link=>link.classList.toggle("active",link.dataset.nav===current));
}

function initVisionIdentity(){
  const footer=document.querySelector("footer");
  if(!footer||document.querySelector(".vision-band"))return;
  const band=document.createElement("aside");
  band.className="vision-band";
  band.setAttribute("aria-label","رؤية السعودية 2030");
  band.innerHTML='<div class="container vision-inner"><img class="vision-logo" src="/alalam-alsaghir/vision-2030.jpg" alt="شعار رؤية السعودية 2030" loading="lazy"><div class="vision-copy"><strong>تعليم طموح لمستقبل مزدهر</strong><span>نلهم طالباتنا للتعلّم والإبداع والمشاركة</span></div></div>';
  footer.before(band);
}

function setPageLoading(container){if(container)container.innerHTML='<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'}
function setPageError(container,retry){if(!container)return;container.innerHTML=emptyState("تعذّر تحميل المحتوى","تحققي من الإنترنت ثم أعيدي المحاولة.","↻");const button=document.createElement("button");button.className="btn btn-primary btn-sm retry-btn";button.type="button";button.textContent="إعادة المحاولة";button.addEventListener("click",retry);container.querySelector(".empty-state").append(button)}

document.addEventListener("DOMContentLoaded",()=>{initNavigation();initVisionIdentity()});
