// Google Calendar 串接（GIS token flow，純前端，只用 Client ID）
window.GCAL = (function(){
  const CLIENT_ID='451197570079-dro1v51b321g3c1kggj91rauucmne86g.apps.googleusercontent.com';
  const SCOPE='https://www.googleapis.com/auth/calendar.events';
  const LS='gcal_token_v1';
  let token=null, tokenClient=null, onChange=null;

  function saveTok(tok, expSec){ try{ localStorage.setItem(LS, JSON.stringify({t:tok, exp:Date.now()+((expSec||3600)-90)*1000})); }catch(e){} }
  function loadTok(){ try{ const o=JSON.parse(localStorage.getItem(LS)||'null'); if(o && o.t && o.exp>Date.now()) return o.t; }catch(e){} return null; }
  function clearTok(){ try{ localStorage.removeItem(LS); }catch(e){} }

  function whenReady(cb){
    if(window.google && google.accounts && google.accounts.oauth2) cb();
    else setTimeout(()=>whenReady(cb), 200);
  }
  function init(cb){
    onChange=cb;
    whenReady(()=>{
      tokenClient=google.accounts.oauth2.initTokenClient({
        client_id:CLIENT_ID, scope:SCOPE,
        callback:(resp)=>{ if(resp && resp.access_token){ token=resp.access_token; saveTok(token, resp.expires_in); onChange&&onChange(true); } },
        error_callback:()=>{ onChange&&onChange(false); }   // 靜默授權失敗：維持未連結，不彈錯
      });
      // 1) 先用本機儲存的權杖（1 小時內免重連）
      const t=loadTok();
      if(t){ token=t; onChange&&onChange(true); return; }
      // 2) 嘗試「靜默」重新授權（已登入＋授權過 → 不彈窗）
      try{ tokenClient.requestAccessToken({prompt:''}); }catch(e){ onChange&&onChange(false); }
    });
  }
  function connect(){ if(tokenClient) tokenClient.requestAccessToken({prompt: token?'':'consent'}); }
  function connected(){ return !!token; }

  async function api(path, opts={}){
    const r=await fetch('https://www.googleapis.com/calendar/v3'+path, {
      ...opts, headers:{...(opts.headers||{}), 'Authorization':'Bearer '+token, 'Content-Type':'application/json'}
    });
    if(r.status===401){ token=null; clearTok(); onChange&&onChange(false); throw new Error('授權過期，請重新連結'); }
    if(!r.ok){ throw new Error('行事曆錯誤 '+r.status); }
    return r.status===204?null:r.json();
  }
  async function listUpcoming(max=8){
    const now=new Date().toISOString();
    const d=await api('/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults='+max+'&timeMin='+encodeURIComponent(now));
    return (d&&d.items)||[];
  }
  // 全天事件：end.date 為「結束日的隔天」（exclusive）
  function plusDay(ymd){ const [y,m,d]=ymd.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d+1)); return dt.toISOString().slice(0,10); }
  function body(summary, ymd, desc){ return JSON.stringify({summary, description:desc||'', start:{date:ymd}, end:{date:plusDay(ymd)}}); }
  async function createEvent(summary, ymd, desc){ return api('/calendars/primary/events',{method:'POST',body:body(summary,ymd,desc)}); }
  async function updateEvent(id, summary, ymd, desc){ return api('/calendars/primary/events/'+id,{method:'PATCH',body:body(summary,ymd,desc)}); }
  async function deleteEvent(id){ return api('/calendars/primary/events/'+encodeURIComponent(id),{method:'DELETE'}); }

  return {init, connect, connected, listUpcoming, createEvent, updateEvent, deleteEvent};
})();
