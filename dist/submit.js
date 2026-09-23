"use strict";

const submitParams=new URLSearchParams(location.search);
let submitSection=normalizeSection(submitParams.get("section"));
let submitClass=Math.min(4,Math.max(1,Number(submitParams.get("class"))||1));
const requestedAssignment=submitParams.get("assignment")||"";
let submitData=null;
let preparedSubmissionImage=null;
let submissionImageTask=Promise.resolve();
let submissionPreviewUrl="";

function fillSubmissionOptions(){
  $("#sectionSelect").value=submitSection;
  $("#classSelect").innerHTML=(submitData.classes||[]).map(item=>`<option value="${item.id}" ${Number(item.id)===submitClass?"selected":""}>${escapeHtml(item.name)}</option>`).join("");
  updateAssignments();updateSubmitContext();
}

function updateAssignments(){
  submitSection=$("#sectionSelect").value;submitClass=Number($("#classSelect").value)||1;
  const items=(submitData.assignments||[]).filter(item=>item.section===submitSection&&(item.class_id===null||Number(item.class_id)===submitClass));
  $("#assignmentSelect").innerHTML=`<option value="">مشاركة حرة</option>${items.map(item=>`<option value="${escapeHtml(item.id)}" ${item.id===requestedAssignment?"selected":""}>${escapeHtml(item.title)}</option>`).join("")}`;
  $("#sectionHidden").value=submitSection;updateSubmitContext();
  history.replaceState(null,"",`/submit?section=${submitSection}&class=${submitClass}`);
}

function updateSubmitContext(){
  document.body.dataset.section=submitSection;
  $("#submitPageTitle").textContent=sectionMeta(submitSection).submitTitle;
  $("#submitPageDescription").textContent=`${sectionName(submitSection)} • ${getClassName(submitData,submitClass)}`;
  $("#backToClass").href=`/class?section=${submitSection}&class=${submitClass}`;
}

async function submitStudentWork(event){
  event.preventDefault();const button=$("#submitButton");button.disabled=true;button.textContent="جارٍ الإرسال...";
  try{
    await submissionImageTask;
    const formData=new FormData(event.currentTarget);formData.set("section",submitSection);formData.set("class_id",String(submitClass));formData.delete("image");
    if(preparedSubmissionImage)formData.append("image",preparedSubmissionImage,preparedSubmissionImage.name);
    const response=await fetch(ALALAM_API,{method:"POST",body:formData});const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"تعذّر إرسال المشاركة");
    clearPublicCache();$("#submissionCard").classList.add("hidden");$("#successCard").classList.remove("hidden");$("#successMessage").textContent=result.message||"وصلت مشاركتك للمراجعة";$("#successBack").href=`/class?section=${submitSection}&class=${submitClass}`;scrollTo({top:0,behavior:"smooth"});
  }catch(error){showToast(error.message,"error")}
  finally{button.disabled=false;button.textContent="إرسال للمراجعة"}
}

async function handleSubmissionImage(file){
  const preview=$("#filePreview"),help=$("#studentImageHelp"),button=$("#submitButton");
  preparedSubmissionImage=null;if(submissionPreviewUrl){URL.revokeObjectURL(submissionPreviewUrl);submissionPreviewUrl=""}
  if(!file){preview.classList.add("hidden");help.textContent="سيتم تجهيز الصورة تلقائيًا قبل الإرسال";return}
  button.disabled=true;help.textContent="جارٍ تجهيز الصورة...";
  try{preparedSubmissionImage=await prepareImageFile(file);submissionPreviewUrl=URL.createObjectURL(preparedSubmissionImage);preview.src=submissionPreviewUrl;preview.classList.remove("hidden");help.textContent="الصورة جاهزة للإرسال"}
  catch(error){$("#imageInput").value="";preview.classList.add("hidden");help.textContent="سيتم تجهيز الصورة تلقائيًا قبل الإرسال";showToast(error.message,"error");throw error}
  finally{button.disabled=false}
}

async function loadSubmitPage(){
  try{submitData=await loadPublicData();applySiteSettings(submitData);fillSubmissionOptions()}
  catch(error){showToast(error.message,"error")}
}

$("#sectionSelect").addEventListener("change",updateAssignments);$("#classSelect").addEventListener("change",updateAssignments);$("#submissionForm").addEventListener("submit",submitStudentWork);
$("#imageInput").addEventListener("change",event=>{submissionImageTask=handleSubmissionImage(event.target.files?.[0]).catch(()=>null)});

loadSubmitPage();
