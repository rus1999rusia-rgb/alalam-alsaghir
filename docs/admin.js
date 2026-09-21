"use strict";

let adminToken=sessionStorage.getItem("alalam_admin_token")||"";
let adminData=null;

async function adminApi(action,payload={}){
  try{return await apiRequest(action,payload,adminToken)}catch(error){if(error.status===401){adminToken="";sessionStorage.removeItem("alalam_admin_token")}throw error}
}

function showLogin(){$("#adminLogin").classList.remove("hidden");$("#adminWorkspace").classList.add("hidden")}
function showWorkspace(){$("#adminLogin").classList.add("hidden");$("#adminWorkspace").classList.remove("hidden")}

async function loginAdmin(event){
  event.preventDefault();const button=$("#loginButton");button.disabled=true;button.textContent="جارٍ الدخول...";
  try{const result=await apiRequest("admin_login",{pin:$("#pinInput").value});adminToken=result.token;sessionStorage.setItem("alalam_admin_token",adminToken);$("#pinInput").value="";await loadAdmin();showWorkspace();showToast("مرحبًا بكِ في لوحة الإدارة")}
  catch(error){showToast(error.message,"error")}
  finally{button.disabled=false;button.textContent="دخول لوحة الإدارة"}
}

async function loadAdmin(){adminData=await adminApi("admin_feed");applySiteSettings(adminData);renderAdmin()}
function renderAdmin(){renderAdminStats();renderAssignments();renderSubmissions();renderSettings();populateAdminClasses()}

function renderAdminStats(){
  $("#pendingStat").textContent=String((adminData.submissions||[]).filter(item=>item.status==="pending").length);
  $("#approvedStat").textContent=String((adminData.submissions||[]).filter(item=>item.status==="approved").length);
  $("#contentStat").textContent=String((adminData.assignments||[]).length);
}

function populateAdminClasses(){$("#adminClass").innerHTML=`<option value="all">كل الفصول</option>${(adminData.classes||[]).map(item=>`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`}

function renderAssignments(){
  const items=adminData.assignments||[];
  $("#adminAssignmentsList").innerHTML=items.length?items.map(item=>`<div class="admin-item"><div class="admin-item-head"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(sectionName(item.section))} • ${escapeHtml(getClassName(adminData,item.class_id))}${item.due_date?` • حتى ${escapeHtml(formatDate(item.due_date))}`:""}</p></div><span class="status ${item.is_active?"approved":"rejected"}">${item.is_active?"ظاهر":"مخفي"}</span></div><p>${escapeHtml(item.description)}</p><div class="admin-item-actions"><button class="btn btn-soft btn-sm js-edit-assignment" type="button" data-id="${item.id}">تعديل</button><button class="btn btn-danger btn-sm js-delete-assignment" type="button" data-id="${item.id}">حذف</button></div></div>`).join(""):'<div class="admin-empty">لم تتم إضافة محتوى بعد.</div>';
}

function resetAssignmentForm(){$("#assignmentForm").reset();$("#adminAssignmentId").value="";$("#adminIsActive").checked=true;$("#assignmentFormTitle").textContent="إضافة محتوى جديد"}
function editAssignment(id){const item=adminData.assignments.find(entry=>entry.id===id);if(!item)return;$("#adminAssignmentId").value=item.id;$("#adminSection").value=item.section;$("#adminClass").value=item.class_id??"all";$("#adminAssignmentTitle").value=item.title;$("#adminDescription").value=item.description||"";$("#adminDueDate").value=item.due_date||"";$("#adminIsActive").checked=item.is_active;$("#assignmentFormTitle").textContent="تعديل المحتوى";$("#adminAssignmentTitle").focus();scrollTo({top:$("#assignmentEditor").offsetTop-100,behavior:"smooth"})}

async function saveAssignment(event){
  event.preventDefault();
  try{await adminApi("save_assignment",{id:$("#adminAssignmentId").value,section:$("#adminSection").value,class_id:$("#adminClass").value,title:$("#adminAssignmentTitle").value,description:$("#adminDescription").value,due_date:$("#adminDueDate").value,is_active:$("#adminIsActive").checked});clearPublicCache();resetAssignmentForm();await loadAdmin();showToast("تم حفظ المحتوى")}
  catch(error){showToast(error.message,"error")}
}

async function deleteAssignment(id){if(!confirm("هل تريدين حذف هذا المحتوى؟ ستبقى مشاركات الطالبات محفوظة."))return;try{await adminApi("delete_assignment",{id});clearPublicCache();await loadAdmin();showToast("تم حذف المحتوى")}catch(error){showToast(error.message,"error")}}

function renderSubmissions(){
  const filter=$("#moderationFilter").value,items=(adminData.submissions||[]).filter(item=>filter==="all"||item.status===filter),statusNames={pending:"بانتظار المراجعة",approved:"معتمدة",rejected:"مرفوضة"};
  $("#adminSubmissionsList").innerHTML=items.length?items.map(item=>`<div class="admin-item moderation-item"><div class="admin-item-head"><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.student_name)} • ${escapeHtml(getClassName(adminData,item.class_id))} • ${escapeHtml(sectionName(item.section))} • ${escapeHtml(formatDate(item.created_at))}</p></div><span class="status ${item.status}">${statusNames[item.status]||item.status}</span></div>${item.image_url?`<a href="${escapeHtml(item.image_url)}" target="_blank" rel="noopener"><img class="moderation-image" src="${escapeHtml(item.image_url)}" alt="صورة المشاركة"></a>`:""}${item.body_text?`<p>${escapeHtml(item.body_text)}</p>`:""}<div class="moderation-controls"><select class="js-status"><option value="pending" ${item.status==="pending"?"selected":""}>بانتظار المراجعة</option><option value="approved" ${item.status==="approved"?"selected":""}>معتمدة</option><option value="rejected" ${item.status==="rejected"?"selected":""}>مرفوضة</option></select><select class="js-stars">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${Number(item.stars)===n?"selected":""}>${n} ⭐</option>`).join("")}</select><label class="check"><input class="js-featured" type="checkbox" ${item.featured?"checked":""}> مميزة</label></div><div class="admin-item-actions"><button class="btn btn-primary btn-sm js-save-moderation" type="button" data-id="${item.id}">حفظ المراجعة</button><button class="btn btn-danger btn-sm js-delete-submission" type="button" data-id="${item.id}">حذف</button></div></div>`).join(""):'<div class="admin-empty">لا توجد مشاركات في هذا التصنيف.</div>';
}

async function saveModeration(id,button){const root=button.closest(".admin-item");try{await adminApi("moderate_submission",{id,status:$(".js-status",root).value,stars:Number($(".js-stars",root).value),featured:$(".js-featured",root).checked});clearPublicCache();await loadAdmin();showToast("تم اعتماد التغييرات") }catch(error){showToast(error.message,"error")}}
async function deleteSubmission(id){if(!confirm("هل تريدين حذف هذه المشاركة نهائيًا؟"))return;try{await adminApi("delete_submission",{id});clearPublicCache();await loadAdmin();showToast("تم حذف المشاركة")}catch(error){showToast(error.message,"error")}}

function renderSettings(){
  const settings=adminData.settings||{};$("#settingSchool").value=settings.school_name||"";$("#settingLab").value=settings.lab_name||"";$("#settingTeacher").value=settings.teacher_name||"";$("#settingPrincipal").value=settings.principal_name||"";
  $("#classSettingsList").innerHTML=(adminData.classes||[]).map(item=>`<form class="class-edit-row js-class-form" data-id="${item.id}"><input value="${escapeHtml(item.name)}" maxlength="50" required><button class="btn btn-soft btn-sm" type="submit">حفظ</button></form>`).join("");
}

async function saveSettings(event){event.preventDefault();try{await adminApi("update_settings",{school_name:$("#settingSchool").value,lab_name:$("#settingLab").value,teacher_name:$("#settingTeacher").value,principal_name:$("#settingPrincipal").value});clearPublicCache();await loadAdmin();showToast("تم تحديث بيانات الواجهة") }catch(error){showToast(error.message,"error")}}
async function saveClass(form){try{await adminApi("update_class",{id:Number(form.dataset.id),name:$("input",form).value});clearPublicCache();await loadAdmin();showToast("تم تحديث اسم الفصل") }catch(error){showToast(error.message,"error")}}

function switchAdminPane(id,button){$$(".admin-tab[data-pane]").forEach(item=>item.classList.toggle("active",item===button));$$(".admin-pane").forEach(pane=>pane.classList.toggle("active",pane.id===id))}
async function logout(){try{await adminApi("admin_logout")}catch{}adminToken="";adminData=null;sessionStorage.removeItem("alalam_admin_token");showLogin();showToast("تم تسجيل الخروج")}

$("#loginForm").addEventListener("submit",loginAdmin);$("#assignmentForm").addEventListener("submit",saveAssignment);$("#assignmentFormReset").addEventListener("click",resetAssignmentForm);$("#moderationFilter").addEventListener("change",renderSubmissions);$("#settingsForm").addEventListener("submit",saveSettings);$("#logoutButton").addEventListener("click",logout);$("#refreshAdmin").addEventListener("click",()=>loadAdmin().then(()=>showToast("تم تحديث اللوحة")).catch(error=>showToast(error.message,"error")));
$$(".admin-tab[data-pane]").forEach(button=>button.addEventListener("click",()=>switchAdminPane(button.dataset.pane,button)));
$("#adminAssignmentsList").addEventListener("click",event=>{const edit=event.target.closest(".js-edit-assignment"),remove=event.target.closest(".js-delete-assignment");if(edit)editAssignment(edit.dataset.id);if(remove)deleteAssignment(remove.dataset.id)});
$("#adminSubmissionsList").addEventListener("click",event=>{const save=event.target.closest(".js-save-moderation"),remove=event.target.closest(".js-delete-submission");if(save)saveModeration(save.dataset.id,save);if(remove)deleteSubmission(remove.dataset.id)});
$("#classSettingsList").addEventListener("submit",event=>{const form=event.target.closest(".js-class-form");if(!form)return;event.preventDefault();saveClass(form)});

(async()=>{if(!adminToken)return showLogin();try{await loadAdmin();showWorkspace()}catch{showLogin()}})();
