"use strict";

const activeSection=normalizeSection(document.body.dataset.section);

async function loadSectionPage(){
  const grid=$("#classesGrid");
  try{
    const data=await loadPublicData();applySiteSettings(data);
    $("#sectionTitle").textContent=sectionName(activeSection);
    $("#sectionDescription").textContent=sectionMeta(activeSection).description;
    $("#sectionSymbol").textContent=sectionIcon(activeSection);
    grid.innerHTML=(data.classes||[]).map(item=>{
      const assignments=(data.assignments||[]).filter(row=>row.section===activeSection&&(row.class_id===null||Number(row.class_id)===Number(item.id))).length;
      const submissions=(data.submissions||[]).filter(row=>row.section===activeSection&&Number(row.class_id)===Number(item.id)).length;
      return `<a class="class-door" href="/class?section=${activeSection}&class=${item.id}" style="--door-color:${escapeHtml(item.color)}"><span class="door-number">${item.id}</span><span class="door-copy"><strong>${escapeHtml(item.name)}</strong><small>${assignments} ${escapeHtml(sectionMeta(activeSection).item)} • ${submissions} مشاركة</small></span><span class="door-arrow">←</span></a>`;
    }).join("");
  }catch(error){setPageError(grid,loadSectionPage);showToast(error.message,"error")}
}

loadSectionPage();
