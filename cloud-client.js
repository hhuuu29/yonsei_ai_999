(function(root){
  'use strict';
  var doc=root.document,refreshing=null;
  var messages={NOT_CONFIGURED:'보관함 서비스를 준비 중이에요. 운영 연결이 끝나면 사용할 수 있어요.',
    LOGIN_REQUIRED:'로그인이 필요해요.',AUTH_FAILED:'Google 로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',GOOGLE_LOGIN_FAILED:'로그인 요청이 만료됐어요. 다시 Google 계정을 선택해 주세요.',
    RATE_LIMIT:'요청이 많아요. 잠시 후 다시 시도해 주세요.',INVALID_INPUT:'제목·일정 수·날짜를 확인해 주세요. 최대 30개 일정을 담을 수 있어요.',
    STORAGE_FAILED:'저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',LINK_UNAVAILABLE:'만료되었거나 해제된 공유 링크예요.',
    GOOGLE_AUTH:'Google 연결이 만료됐어요. 다시 연결해 주세요.',IMPORT_FAILED:'일부 일정을 등록하지 못했어요. 다시 누르면 이미 등록한 일정은 건너뜁니다.'};
  async function request(body,retry){
    var get=['session','list','load','links'].indexOf(body.action)>=0;
    var response=await root.fetch('/api/cloud'+(get?'?'+new URLSearchParams(body):''),{method:get?'GET':'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},...(get?{}:{body:JSON.stringify(body)})});
    var data=await response.json();
    if(response.status===401&&data.error==='LOGIN_REQUIRED'&&retry!==false){
      if(!refreshing)refreshing=request({action:'refresh'},false).finally(function(){refreshing=null;});
      await refreshing;return request(body,false);
    }
    if(!response.ok){var error=new Error(messages[data.error]||'처리하지 못했어요. 잠시 후 다시 시도해 주세요.');error.code=data.error;error.count=data.count||0;throw error;}
    return data;
  }
  function node(tag,text,cls){var item=doc.createElement(tag);if(text)item.textContent=text;if(cls)item.className=cls;return item;}
  function button(parent,text,fn,cls){var item=node('button',text,cls);item.type='button';item.addEventListener('click',fn);parent.appendChild(item);return item;}
  function preview(parent,snapshot,editable){
    snapshot.events.forEach(function(event){
      var card=node('article','','cloud-event');parent.appendChild(card);
      card.appendChild(node('h3',event.title));
      card.appendChild(node('p',event.start.replace('T',' ').replace('+09:00','')+' → '+event.end.replace('T',' ').replace('+09:00','')));
      if(event.location)card.appendChild(node('p',event.location));
      event.checklist.forEach(function(text,index){
        if(!editable){card.appendChild(node('p','• '+text));return;}
        var label=node('label'),check=node('input');check.type='checkbox';check.checked=true;
        check.addEventListener('change',function(){event._excluded=event._excluded||{};event._excluded[index]=!check.checked;});
        label.append(check,doc.createTextNode(text));card.appendChild(label);
      });
    });
    snapshot.todos.forEach(function(todo){parent.appendChild(node('p',(todo.done?'✓ ':'□ ')+todo.text));});
  }
  function mount(options){
    var trigger=doc.getElementById('openLibrary');if(!trigger)return;
    var user=null,busy=false,draft=null;
    var dialog=node('dialog','','cloud-panel');dialog.setAttribute('aria-labelledby','cloudHeading');
    var head=node('header'),heading=node('h2','내 보관함');heading.id='cloudHeading';head.appendChild(heading);
    button(head,'닫기',function(){if(!busy)dialog.close();});dialog.appendChild(head);
    var nav=node('nav');dialog.appendChild(nav);
    var status=node('p','','cloud-status');status.setAttribute('role','status');dialog.appendChild(status);
    var content=node('div');dialog.appendChild(content);doc.body.appendChild(dialog);
    dialog.addEventListener('cancel',function(event){if(busy)event.preventDefault();});
    dialog.addEventListener('close',function(){trigger.focus();});
    function say(text){status.textContent=text;}
    function lock(value){busy=value;dialog.querySelectorAll('button,input').forEach(function(item){item.disabled=value||(item.tagName==='INPUT'&&!!(draft&&draft.pending));});}
    async function task(fn){if(busy)return;lock(true);try{await fn();}catch(error){say(error.message);if(error.code==='LOGIN_REQUIRED'){user=null;login();}}finally{lock(false);}}
    function navigation(){
      nav.replaceChildren();
      if(!user)return;
      button(nav,'저장한 일정',function(){draft=null;task(library);});
      button(nav,'공유 링크 관리',function(){draft=null;task(links);});
      button(nav,'로그아웃',function(){task(async function(){
        try{await request({action:'logout'},false);}finally{user=null;draft=null;content.replaceChildren();options.onLogout();login();say('로그아웃했어요.');}
      });});
    }
    async function login(){
      heading.textContent='일정을 내 계정에 보관하기';navigation();content.replaceChildren();
      content.appendChild(node('p','Google 계정으로 로그인하고 내 일정을 보관하세요. 원문 없이 일정과 할 일만 저장합니다.'));
      content.appendChild(node('p','캘린더 접근은 캘린더 기능을 사용할 때 별도로 동의해요.'));
      var target=node('div');content.appendChild(target);
      try{
        var configResponse=await root.fetch('/api/config');
        if(!configResponse.ok)throw new Error('로그인 설정을 불러오지 못했어요.');
        var config=await configResponse.json();
        if(!config.googleClientId||!root.google?.accounts?.id)throw new Error('Google 로그인을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        if(!content.contains(target)||!dialog.open)return;
        var challenge=await request({action:'google_nonce'},false);
        if(!content.contains(target)||!dialog.open)return;
        root.google.accounts.id.initialize({client_id:config.googleClientId,nonce:challenge.nonce,auto_select:false,
          callback:function(response){
            if(!content.contains(target)||!dialog.open)return;
            task(async function(){
              try{
                var data=await request({action:'google_verify',credential:response.credential},false);user=data.user;
                if(draft)compose();else await library();
              }catch(error){await login();throw error;}
            });
          }});
        root.google.accounts.id.renderButton(target,{type:'standard',theme:'outline',size:'large',text:'continue_with',width:280,locale:'ko'});
      }catch(error){
        if(!content.contains(target))return;
        say(error.message);button(target,'로그인 다시 준비하기',function(){login();});
      }
    }
    async function session(){
      try{var data=await request({action:'session'});user=data.user;return true;}
      catch(error){user=null;login();say(error.message);if(error.code==='NOT_CONFIGURED')content.replaceChildren(node('p','저장소 연결을 준비 중입니다. 대화 정리와 Google 캘린더는 계속 사용할 수 있어요.'));return false;}
    }
    async function library(){
      navigation();heading.textContent='저장한 일정';content.replaceChildren();say(user.email+' · 최근 100개');
      var data=await request({action:'list'});
      if(!data.items.length)content.appendChild(node('p','아직 저장한 일정이 없어요. 일정판에서 보관함에 저장을 눌러주세요.'));
      data.items.forEach(function(item){
        var row=node('article','','cloud-event');row.appendChild(node('h3',item.title));row.appendChild(node('p',new Date(item.created_at).toLocaleString('ko-KR')));
        button(row,'내용 보기',function(){task(async function(){
          var saved=await request({action:'load',id:item.id});content.replaceChildren();heading.textContent=saved.title;preview(content,saved.snapshot,false);
          button(content,'일정판에서 열기',function(){if(root.confirm('현재 일정판을 저장한 일정으로 바꿀까요?')){options.restore(saved);dialog.close();}},'cloud-primary');
        });});
        button(row,'보관함에서 삭제',function(){if(root.confirm('보관함의 사본을 삭제할까요? Google 일정과 공유 링크는 유지됩니다.'))task(async function(){await request({action:'remove',id:item.id});await library();});});content.appendChild(row);
      });
    }
    async function links(){
      navigation();heading.textContent='공유 링크 관리';content.replaceChildren();say('링크를 해제해도 친구가 이미 복사한 일정은 유지됩니다.');
      var data=await request({action:'links'});
      if(!data.items.length)content.appendChild(node('p','아직 만든 공유 링크가 없어요.'));
      data.items.forEach(function(item){
        var row=node('article','','cloud-event');row.appendChild(node('h3',item.title));
        var inactive=item.revoked_at||Date.parse(item.expires_at)<Date.now();row.appendChild(node('p',inactive?'만료 또는 해제됨':'만료: '+new Date(item.expires_at).toLocaleString('ko-KR')));
        if(!inactive)button(row,'링크 해제',function(){if(root.confirm('이 링크로 더 이상 조회·등록할 수 없도록 해제할까요?'))task(async function(){await request({action:'revoke',id:item.id});await links();});});content.appendChild(row);
      });
    }
    function compose(){
      navigation();heading.textContent=draft.mode==='share'?'친구에게 보낼 일정':'보관함에 저장';content.replaceChildren();
      say(draft.mode==='share'?'아래 내용만 공유됩니다. 링크는 7일 뒤 만료돼요.':'선택한 일정과 할 일을 저장합니다. 원문 대화는 저장하지 않아요.');
      var label=node('label','묶음 이름'),title=node('input');title.value=draft.title;title.maxLength=120;label.appendChild(title);content.appendChild(label);
      preview(content,draft.snapshot,true);
      button(content,draft.mode==='share'?'이 내용으로 공유 링크 만들기':'이 내용으로 저장',function(){task(async function(){
        if(!title.value.trim()){say('묶음 이름을 입력해 주세요.');return;}
        var clean=root.DoToDoSnapshot.sanitizeSnapshot({events:draft.snapshot.events.map(function(event){return {...event,checklist:event.checklist.filter(function(_,i){return !event._excluded||!event._excluded[i];})};}),todos:draft.snapshot.todos});
        // Preserve the exact saved request across an uncertain network failure.
        draft.pending=draft.pending||{action:draft.mode,id:draft.id,title:title.value.trim(),snapshot:clean};
        var result=await request(draft.pending);
        if(draft.mode==='share'){
          draft=null;
          content.replaceChildren();heading.textContent='공유 링크가 준비됐어요';say('링크를 가진 사람이 내용을 보고 자기 캘린더에 복사할 수 있어요. 지금 링크를 복사해 두세요.');
          var field=node('input');field.value=result.url;field.readOnly=true;field.setAttribute('aria-label','공유 링크');content.appendChild(field);
          button(content,'링크 복사',async function(){try{await root.navigator.clipboard.writeText(result.url);say('링크를 복사했어요.');}catch{field.select();say('선택된 링크를 복사해 주세요.');}},'cloud-primary');
          button(content,'공유 페이지 열기',function(){root.open(result.url,'_blank','noopener,noreferrer');});
        }else{draft=null;await library();say('내 보관함에 저장했어요.');}
      });},'cloud-primary');
    }
    async function open(mode){
      if(busy)return;
      try{draft=mode?{mode:mode,id:root.crypto.randomUUID(),title:options.title(),snapshot:options.snapshot()}:null;}
      catch(error){root.alert(error.message);return;}
      if(!dialog.open)dialog.showModal();
      await task(async function(){if(await session()){if(draft)compose();else await library();}});
    }
    trigger.addEventListener('click',function(){open();});
    doc.getElementById('btnSaveCloud').addEventListener('click',function(){open('save');});
    doc.getElementById('btnShare').addEventListener('click',function(){open('share');});
  }
  root.DoToDoCloud={mount:mount,request:request,preview:preview};
})(globalThis);
