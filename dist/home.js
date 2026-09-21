"use strict";

async function loadHome(){
  try{
    const data=await loadPublicData();applySiteSettings(data);
    const counts=Object.fromEntries(SECTION_KEYS.map(section=>[section,(data.assignments||[]).filter(item=>item.section===section).length]));
    const submissions=(data.submissions||[]).length;
    $("#mathCount").textContent=counts.math_lab?`${counts.math_lab} نشاط حالي` : "جاهز لاستقبال الأنشطة";
    $("#researchCount").textContent=counts.research?`${counts.research} طلب حالي` : "جاهز لاستقبال الأبحاث";
    $("#tripCount").textContent=counts.school_trip?`${counts.school_trip} فعالية حالية` : "جاهز لتفاصيل الرحلات";
    $("#readingCount").textContent=counts.reading_comprehension?`${counts.reading_comprehension} نشاط قرائي` : "جاهز للأنشطة القرائية";
    $("#workCount").textContent=submissions?`${submissions} مشاركة معتمدة` : "تظهر المشاركات بعد الاعتماد";
  }catch(error){showToast(error.message,"error")}
}

loadHome();
