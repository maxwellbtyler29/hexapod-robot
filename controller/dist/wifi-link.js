'use strict';
// Same-origin only. The cloud HTTPS site never sends commands to a local HTTP device.
class SetupWifi extends (typeof module!=='undefined'?require('./serial-link.js'):SetupSerial) {
  constructor(onState,onFault,fetcher=(...args)=>fetch(...args)){
    super(onState,onFault);this.fetcher=fetcher;this.sequence=0;this.session=null;this.timeoutMs=2000;
  }
  async exchange(path,body=''){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1500);
    try{
      const response=await this.fetcher(path,{method:'POST',cache:'no-store',credentials:'omit',
        headers:{'Content-Type':'text/plain','X-Hexapod':'control-v4',...(this.session?{'X-Session':this.session}:{})},
        body,signal:controller.signal});
      const text=await response.text();
      if(!response.ok)throw Error(text||'Wi-Fi controller unavailable.');
      return text.trim();
    }finally{clearTimeout(timer);}
  }
  async connect(){
    try{
      const token=await this.exchange('/api/session');
      if(!/^[a-f0-9]{32}$/.test(token))throw Error('Not a HEXAPOD Wi-Fi controller.');
      this.session=token;this.sequence=0;
      this.writer={write:async bytes=>{
        try{const command=new TextDecoder().decode(bytes).trim();
          const reply=await this.exchange('/api/command',`${++this.sequence}\n${command}`);
          for(const line of reply.split('\n'))this.line(line.trim());
        }catch(e){this.fault(e);}
      }};
      await this.request('OFF');await this.request('CAPS');const state=await this.request('STATUS');
      if(!state.ready||state.leg!==-1||state.mask!==0||state.current.some(Boolean))throw Error('Controller is not ready with outputs off.');
      this.connected=true;return state;
    }catch(e){await this.close();throw e;}
  }
  async close(){
    const wasConnected=this.connected;this.connected=false;
    if(this.writer&&wasConnected){try{await this.stop();}catch{}}
    this.writer=null;this.session=null;
  }
}
if(typeof module!=='undefined')module.exports=SetupWifi;
