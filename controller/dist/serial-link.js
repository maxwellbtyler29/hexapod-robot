'use strict';
// One request at a time. Stop invalidates queued commands before sending OFF.
class SetupSerial {
  constructor(onState=()=>{},onFault=()=>{}) {
    this.onState=onState;this.onFault=onFault;this.epoch=0;this.chain=Promise.resolve();this.pending=null;this.connected=false;this.timeoutMs=650;
  }
  static parse(line) {
    const gait=line.match(/^GAIT v=1 active=(0|1) ending=(0|1) kind=([01]) dir=(-1|0|1) phase=(-1|[0-5]) cycles=(\d+) tested=(\d+)$/);
    if(gait)return {gait:true,active:gait[1]==='1',ending:gait[2]==='1',kind:Number(gait[3]),direction:Number(gait[4]),phase:Number(gait[5]),cycles:Number(gait[6]),tested:Number(gait[7])};
    const calibration=line.match(/^CALDATA v=1 confirmed=(\d+) centers=([\d,]+) minimum=([\d,]+) maximum=([\d,]+)$/);
    if(calibration){const centers=calibration[2].split(',').map(Number),minimum=calibration[3].split(',').map(Number),maximum=calibration[4].split(',').map(Number),confirmed=Number(calibration[1]);if([centers,minimum,maximum].some(a=>a.length!==18||a.some(n=>!Number.isInteger(n)||n<500||n>2500))||confirmed>262143)return null;return {calibration:true,centers,minimum,maximum,confirmed};}
    const crab=line.match(/^CRABDATA v=1 flags=(\d+) pulses=([\d,]+)$/);
    if(crab){const pulses=crab[2].split(',').map(Number),flags=Number(crab[1]);if(pulses.length!==72||pulses.some(n=>!Number.isInteger(n)||n<500||n>2500)||flags>16777215)return null;return {crab:true,pulses,flags};}
    const frame=line.match(/^POSE v=3 ready=(0|1) mask=(\d+) current=([\d,]+) target=([\d,]+)$/);
    if(frame){const current=frame[3].split(',').map(Number),target=frame[4].split(',').map(Number),mask=Number(frame[2]);
      if(mask>63||current.length!==18||target.length!==18||[...current,...target].some(n=>n>2500))return null;
      return {ready:frame[1]==='1',mask,current,target,frame:true};
    }
    const m=line.match(/^SETUP v=1 ready=(0|1) leg=(-1|[0-5]) current=(\d+),(\d+),(\d+) target=(\d+),(\d+),(\d+) frontPair=(0|1) groupMask=(\d+)$/);
    if(!m)return null;
    const n=m.slice(1).map(Number);
    if(n.slice(2,8).some(v=>v>2500)||n[9]>63)return null;
    return {ready:!!n[0],leg:n[1],current:n.slice(2,5),target:n.slice(5,8),group:!!n[8],mask:n[9]};
  }
  async connect(port) {
    this.port=port;
    try {
      await port.open({baudRate:115200,flowControl:'none'});
      await port.setSignals({dataTerminalReady:false,requestToSend:false});
      this.writer=port.writable.getWriter();this.reader=port.readable.getReader();
      this.readTask=this.read();
      await new Promise(r=>setTimeout(r,1800));
      await this.request('OFF');await this.request('CAPS');const state=await this.request('STATUS');
      if(!state.ready||state.leg!==-1||state.mask!==0||state.current.some(Boolean))throw Error('Controller is not ready with outputs off.');
      this.connected=true;return state;
    } catch(e) {await this.close();throw e;}
  }
  async read() {
    let buffer='';const decoder=new TextDecoder();
    try {
      while(true) {
        const {value,done}=await this.reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        if(buffer.length>8192)throw Error('Invalid controller data.');
        let i;while((i=buffer.indexOf('\n'))>=0){this.line(buffer.slice(0,i).trim());buffer=buffer.slice(i+1);}
      }
      if(!this.closing)throw Error('USB disconnected.');
    } catch(e) {if(!this.closing)this.fault(e);}
  }
  line(line) {
    if(line.startsWith('ERR')){
      if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(Error(line));}
      else this.fault(Error(line));
      return;
    }
    if(this.pending?.command==='CAPS'&&line.startsWith('CAPS ')&&line!=='CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1'){this.fault(Error('Firmware update required: install the Setup/Crabwalk v5 firmware.'));return;}
    const state=SetupSerial.parse(line);
    if(state&&!state.calibration&&!state.crab){this.state=state;this.onState(state);}
    const p=this.pending;
    if(p&&((p.command==='STATUS'||p.command==='STATE'||p.command==='GSTATUS')?!!state&&(p.command==='STATE'?!!state.frame:p.command==='GSTATUS'?!!state.gait:!state.frame&&!state.gait):p.command==='CALDATA'?!!state?.calibration:p.command==='CRABDATA'?!!state?.crab:p.command==='CAPS'?line==='CAPS v=5 min=500 max=2500 rate=100 frames=18 joint=1 nvs=1 crab=1 wifi=1':line===`OK ${p.command.split(' ')[0]}`)){
      this.pending=null;clearTimeout(p.timer);p.resolve(state||line);
    }
  }
  fault(error) {
    const wasConnected=this.connected;this.connected=false;this.epoch++;
    if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(error);this.pending=null;}
    if(wasConnected)this.onFault(error);
  }
  request(command,epoch=this.epoch) {
    const task=this.chain.then(()=>{
      if(epoch!==this.epoch)throw Error('Cancelled.');
      if(!this.writer)throw Error('USB is not connected.');
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>this.fault(Error('Controller response timed out.')),this.timeoutMs);
        this.pending={command,resolve,reject,timer};
        this.writer.write(new TextEncoder().encode(command+'\n')).catch(e=>this.fault(e));
      });
    });
    this.chain=task.catch(()=>{});return task;
  }
  async stop() {
    const epoch=++this.epoch;
    await this.request('OFF',epoch);return this.request('STATUS',epoch);
  }
  async close() {
    this.connected=false;
    if(this.writer){try{await this.stop();}catch{}}
    this.closing=true;
    try{await this.reader?.cancel();await this.readTask;}catch{}
    this.reader?.releaseLock();this.writer?.releaseLock();
    this.reader=this.writer=null;
    try{await this.port?.close();}catch{}
    this.port=null;this.closing=false;
  }
}
if(typeof module!=='undefined')module.exports=SetupSerial;
