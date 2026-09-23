"use strict";

const classParams=new URLSearchParams(location.search);
const classSection=normalizeSection(classParams.get("section"));
const classId=Math.min(4,Math.max(1,Number(classParams.get("class"))||1));
let classData=null;

function renderClassPage(){
  const name=getClassName(classData,classId),section=sectionName(classSection);
  document.body.dataset.section=classSection;
  document.title=`${name} | ${section} | العالم الصغير`;
  $("#classPageTitle").textContent=name;$("#breadcrumbClass").textContent=name;$("#classSectionName").textContent=section;$("#classSectionIcon").textContent=sectionIcon(classSection);
  $("#breadcrumbSection").textContent=section;$("#breadcrumbSection").href=sectionPath(classSection);
  $("#submitLink").href=`/alalam-alsaghir/submit/?section=${classSection}&class=${classId}`;
  $("#switchClasses").innerHTML=(classData.classes||[]).map(item=>`<a class="mini-class ${Number(item.id)===classId?"active":""}" href="/alalam-alsaghir/class/?section=${classSection}&class=${item.id}" style="--class-color:${escapeHtml(item.color)}">${escapeHtml(item.name)}</a>`).join("");
  renderClassAssignments();renderClassSubmissions();
}

function renderClassAssignments(){
  const items=(classData.assignments||[]).filter(item=>item.section===classSection&&(item.class_id===null||Number(item.class_id)===classId));
  const meta=sectionMeta(classSection);$("#assignmentHeading").textContent=meta.heading;$("#assignmentCount").textContent=String(items.length);
  $("#assignmentsGrid").innerHTML=items.length?items.map(item=>{const urls=Array.isArray(item.image_urls)?item.image_urls.filter(Boolean):[];const gallery=urls.length?`<div class="assignment-gallery ${urls.length===1?"single":""}">${urls.map((url,index)=>`<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="${escapeHtml(item.title)} — صورة ${index+1}" loading="lazy"></a>`).join("")}</div>`:"";return`<article class="assignment-card section-${classSection}">${gallery}<div class="assignment-card-body"><span class="card-label">${item.class_id?escapeHtml(getClassName(classData,item.class_id)):"كل الفصول"}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)||"التفاصيل تحددها المعلمة."}</p>${item.due_date?`<div class="due">آخر موعد: ${escapeHtml(formatDate(item.due_date))}</div>`:""}<a class="text-link" href="/alalam-alsaghir/submit/?section=${classSection}&class=${classId}&assignment=${encodeURIComponent(item.id)}">إرسال المشاركة ←</a></div></article>`}).join(""):emptyState(meta.emptyTitle,"ستضيف المعلمة المحتوى الجديد هنا.",meta.icon);
}

function renderClassSubmissions(){
  const items=(classData.submissions||[]).filter(item=>item.section===classSection&&Number(item.class_id)===classId);
  $("#submissionCount").textContent=String(items.length);
  $("#submissionsGrid").innerHTML=items.length?items.map(item=>`<article class="submission-card">${item.image_url?`<img class="submission-image" src="${escapeHtml(item.image_url)}" alt="صورة مشاركة ${escapeHtml(item.title)}" loading="lazy">`:""}<div class="submission-body"><div class="submission-top"><div><h3>${escapeHtml(item.title)}</h3><span class="student">${escapeHtml(item.student_name)}</span></div><span class="stars">${starText(item.stars)}</span></div>${item.body_text?`<p>${escapeHtml(item.body_text)}</p>`:""}${item.featured?'<span class="featured-tag">✦ مشاركة مميزة</span>':""}</div></article>`).join(""):emptyState("كوني أول من يشارك","أرسلي عملك، وسيظهر هنا بعد اعتماد المعلمة.","✨");
}

async function loadClassPage(){
  try{classData=await loadPublicData();applySiteSettings(classData);renderClassPage()}
  catch(error){setPageError($("#assignmentsGrid"),loadClassPage);setPageError($("#submissionsGrid"),loadClassPage);showToast(error.message,"error")}
}

loadClassPage();
