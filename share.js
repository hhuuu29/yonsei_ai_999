(function(){
  'use strict';
  var status=document.getElementById('shareStatus'),content=document.getElementById('shareContent'),button=document.getElementById('shareImport');
  var token=location.hash.slice(1),clientId='',busy=false,share=null;
  async function load(){
    try{
      share=await DoToDoCloud.request({action:'preview',token:token},false);
      document.getElementById('shareTitle').textContent=share.title;
      content.replaceChildren();DoToDoCloud.preview(content,share.snapshot,false);
      status.textContent='만료: '+new Date(share.expiresAt).toLocaleString('ko-KR');
      var response=await fetch('/api/config');if(!response.ok)throw new Error('Google 연결 설정을 불러오지 못했어요. 새로고침해 주세요.');
      clientId=(await response.json()).googleClientId;
      button.disabled=!clientId||!share.snapshot.events.length;
      if(!clientId)status.textContent='Google 연결을 준비 중이에요. 잠시 후 새로고침해 주세요.';
    }catch(error){status.textContent=error.message;button.disabled=true;}
  }
  button.addEventListener('click',async function(){
    if(busy||!share)return;busy=true;button.disabled=true;status.textContent='Google 연결 중…';
    try{
      var auth=await DoToDoCalendar.requestAccessToken({clientId:clientId,googleIdentity:window.google});
      if(auth.status!=='success'){status.textContent='Google 연결이 취소됐어요. 다시 눌러 연결할 수 있어요.';return;}
      status.textContent='내 캘린더에 등록 중…';
      var result=await DoToDoCloud.request({action:'import',token:token,googleAccessToken:auth.accessToken},false);
      status.textContent=result.count+'개 일정을 내 Google 캘린더에서 확인할 수 있어요.';
    }catch(error){status.textContent=error.message+(error.count?' ('+error.count+'개 처리됨)':'');if(error.code==='LINK_UNAVAILABLE')share=null;}
    finally{busy=false;button.disabled=!share;}
  });
  load();
})();
