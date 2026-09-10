(function(root,factory){
  var api=factory(); if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DoToDoSnapshot=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function invalid(){var error=new Error('일정 형식을 확인해 주세요.');error.code='VALIDATION';throw error;}
  function text(value,max,required){
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))invalid();
    return value.trim();
  }
  function date(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\+09:00)?$/.test(value))invalid();
    var raw=value.length===10?value+'T00:00:00+09:00':value;
    var parsed=Date.parse(raw);
    if(!Number.isFinite(parsed)||new Date(parsed+9*3600000).toISOString().slice(0,19)!==raw.slice(0,19))invalid();
    return value;
  }
  function sanitizeSnapshot(value){
    if(!value||!Array.isArray(value.events)||value.events.length>30||!Array.isArray(value.todos)||value.todos.length>100)invalid();
    return {events:value.events.map(function(item){
      if(!item||!Array.isArray(item.checklist)||item.checklist.length>30)invalid();
      var start=date(item.start),end=date(item.end);
      if(start.length!==end.length||end<=start)invalid();
      return {title:text(item.title,300,true),start:start,end:end,location:text(item.location||'',500,false),
        checklist:item.checklist.map(function(line){return text(line,1000,true);})};
    }),todos:value.todos.map(function(item){
      if(!item)invalid();return {text:text(item.text,1000,true),done:item.done===true};
    })};
  }
  function googleBody(event){
    return {summary:event.title,location:event.location,
      description:event.checklist.length?'챙길 것\n'+event.checklist.map(function(s){return '• '+s;}).join('\n'):'',
      start:event.start.length===10?{date:event.start}:{dateTime:event.start,timeZone:'Asia/Seoul'},
      end:event.end.length===10?{date:event.end}:{dateTime:event.end,timeZone:'Asia/Seoul'}};
  }
  return {sanitizeSnapshot:sanitizeSnapshot,googleBody:googleBody};
});
