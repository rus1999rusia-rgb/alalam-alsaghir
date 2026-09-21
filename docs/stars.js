"use strict";

function buildLeaders(data){
  const map=new Map();
  for(const item of data.submissions||[]){const key=`${String(item.student_name).trim().toLowerCase()}|${item.class_id}`;const current=map.get(key)||{name:item.student_name,class_id:item.class_id,count:0,stars:0,featured:0};current.count+=1;current.stars+=Number(item.stars)||0;if(item.featured)current.featured+=1;map.set(key,current)}
  return [...map.values()].sort((a,b)=>(b.stars*10+b.count+b.featured*2)-(a.stars*10+a.count+a.featured*2));
}

async function loadStars(){
  const list=$("#starsList");
  try{
    const data=await loadPublicData();applySiteSettings(data);const leaders=buildLeaders(data);
    list.innerHTML=leaders.length?leaders.map((item,index)=>`<article class="star-card ${index<3?"top":""}"><span class="star-rank">${index+1}</span><span class="star-avatar">${index===0?"🏆":index===1?"🥈":index===2?"🥉":"⭐"}</span><div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(getClassName(data,item.class_id))} • ${item.count} مشاركة${item.featured?` • ${item.featured} مميزة`:""}</p></div><span class="star-score">${item.stars} ⭐</span></article>`).join(""):emptyState("لم تبدأ قائمة النجمات بعد","ستظهر الطالبات هنا بعد اعتماد المشاركات ومنح النجوم.","⭐");
  }catch(error){setPageError(list,loadStars);showToast(error.message,"error")}
}

loadStars();
