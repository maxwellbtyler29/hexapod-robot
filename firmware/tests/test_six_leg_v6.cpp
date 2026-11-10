// Native tests for firmware v6 (six_leg_setup.cpp) against recording Wire/PCA stubs.
#include "../src/six_leg_setup.cpp"
#include <cstdio>
#include <string>
static int failures=0;
#define CHECK(c,msg) do{if(!(c)){++failures;printf("FAIL %s (line %d)\n  last reply: %s\n",msg,__LINE__,Serial.out.c_str());}}while(0)
std::string cmd(const char* c){Serial.out.clear();execute(c);return Serial.out;}
bool okReply(const std::string& r){return r.rfind("OK",0)==0;}
void runMs(uint32_t ms){uint32_t end=fakeMillis+ms;while(int32_t(fakeMillis-end)<0){loop();if(fakeMillis%200==0){std::string keep=Serial.out;execute("PING");Serial.out=keep;}}}
// Decode the last burst written to a board: returns ticks for channel ch (0 = full off), -1 if none.
int lastTicks(uint8_t addr,int ch){for(auto it=Wire.log.rbegin();it!=Wire.log.rend();++it){if(it->addr!=addr||it->bytes.empty()||it->bytes[0]!=0x06)continue;
 size_t i=1+4*ch;if(i+3>=it->bytes.size())continue;if(it->bytes[i+3]&0x10)return 0;return it->bytes[i+2]|(it->bytes[i+3]<<8);}return -1;}
int ticksOf(int us){return (us*25+61)/122;}
void boot(){Wire.log.clear();Serial.out.clear();setup();}
void calibrateAll(){for(int i=0;i<18;++i){char b[48];snprintf(b,sizeof b,"CALSAVE %d %d",i,settings.centers[i]);cmd(b);snprintf(b,sizeof b,"DIR %d %d",i,i>=9?1:0);cmd(b);}}
int main(){
 // --- migration from the v5 blob (v2 struct), including v1 limit widening
 nativeV2Present=true;memset(&nativeV2Store,0,sizeof nativeV2Store);nativeV2Store.magic=MAGIC;nativeV2Store.version=2;nativeV2Store.confirmed=ALL_JOINTS;
 for(int i=0;i<18;++i){nativeV2Store.centers[i]=1400+i*10;nativeV2Store.minimum[i]=900;nativeV2Store.maximum[i]=2100;}
 nativeV2Store.checksum=fnv(nativeV2Store);
 boot();
 CHECK(migratedFromV2&&nativeV3Present,"v2 calibration migrated and saved as v3");
 CHECK(settings.centers[5]==1450&&settings.minimum[5]==900&&settings.maximum[5]==2100&&settings.confirmed==ALL_JOINTS,"centers/limits kept");
 CHECK(settings.dirOk==0&&settings.invert==defaultInvert()&&settings.tested==0,"directions need confirming after migration");
 CHECK(Serial.out.find("migrated")!=std::string::npos,"boot reports migration");
 CHECK(Wire.clock==400000,"I2C runs at 400 kHz");
 CHECK((Wire.mode1[0]&0x20)&&(Wire.mode1[1]&0x20),"auto-increment enabled on both boards");
 // second boot reads v3, not v2 again
 nativeV2Store.centers[0]=1111;nativeV2Store.checksum=fnv(nativeV2Store);boot();CHECK(!migratedFromV2&&settings.centers[0]==1400,"v3 preferred after migration");
 // v1 widening
 {SavedSettingsV2 o=nativeV2Store;o.version=1;for(int i=0;i<18;++i){o.minimum[i]=1000;o.maximum[i]=2000;}o.checksum=fnv(o);nativeV3Present=false;nativeV2Store=o;boot();
  CHECK(settings.minimum[3]==500&&settings.maximum[3]==2500,"v1 limits widened");}
 nativeV2Store.version=2;nativeV2Store.centers[0]=1400;nativeV2Store.checksum=fnv(nativeV2Store);nativeV3Present=false;boot();

 // --- calibration: no 1500 snap, hold others
 Wire.log.clear();
 CHECK(okReply(cmd("JSET 4 1440")),"JSET energises");runMs(40);
 CHECK(lastTicks(0x40,4)==ticksOf(1440),"joint starts at its saved pulse, not 1500");
 CHECK(okReply(cmd("JSET 7 1470")),"second joint");runMs(40);
 CHECK(lastTicks(0x40,4)==ticksOf(1440)&&lastTicks(0x40,7)==ticksOf(1470),"first joint still held");
 CHECK(okReply(cmd("JSET 4 1442 2000")),"fine nudge");runMs(40);CHECK(tgt[4]==1442&&fabsf(cur[4]-1442)<0.01f,"nudge reached");
 // bursts are one transaction per board with 9 channels
 bool burstOk=true;for(auto& t:Wire.log)if(t.bytes.size()>1&&t.bytes[0]==0x06&&t.bytes.size()!=37&&t.bytes.size()!=65)burstOk=false;CHECK(burstOk,"burst writes");
 // limits no longer need to include 1500
 CHECK(okReply(cmd("LIMIT 4 1300 1460")),"limit excluding 1500 accepted");
 CHECK(!okReply(cmd("LIMIT 4 1450 1460")),"limit must contain the held/saved pulse");
 CHECK(okReply(cmd("CALSAVE 4 1442")),"save held pulse");CHECK(settings.centers[4]==1442,"saved");
 CHECK(cmd("CFG 0 1500 500 2500 1").find("removed")!=std::string::npos,"CFG removed");
 CHECK(okReply(cmd("OFF")),"off");CHECK(lastTicks(0x40,4)==0,"off writes full-off");
 CHECK(okReply(cmd("LIMIT 4 500 2500")),"restore limit");

 // --- gating
 CHECK(cmd("GDRIVE 100 0 0").find("ERR")==0,"drive refused before directions confirmed");
 calibrateAll();CHECK(allConfirmed()&&allDirections(),"calibration complete");
 CHECK(okReply(cmd("POWER 63 1")),"stand up");
 runMs(100);CHECK(mode==M_ENABLE&&outMask!=ALL_JOINTS,"staggered enable in progress");
 runMs(2500);CHECK(mode==M_HOLD&&outMask==ALL_JOINTS,"all outputs on");runMs(1500);CHECK(atReadyPose(),"ramped to ready");
 CHECK(cmd("GDRIVE 100 0 0").find("one-cycle test")!=std::string::npos,"untested direction blocked");
 // --- one-cycle test for each direction
 for(int code=1;code<=4;++code){char b[16];snprintf(b,sizeof b,"GTEST %d",code);CHECK(okReply(cmd(b)),"test starts");
  uint32_t t0=fakeMillis;while(mode==M_GAIT&&fakeMillis-t0<15000)runMs(20);
  CHECK(mode==M_HOLD&&(settings.tested&(1<<(code-1))),"test completes and is recorded");runMs(1000);CHECK(atReadyPose(),"back at ready after test");}
 CHECK(settings.tested==15&&nativeV3Store.tested==15,"tested bits persisted");
 // --- walking: continuous, within limits, outputs batched
 cmd("GCONFIG 0 1");Wire.log.clear();
 CHECK(okReply(cmd("GDRIVE 100 0 0")),"walk starts");
 float prevCur[18];for(int i=0;i<18;++i)prevCur[i]=cur[i];float maxStep=0;bool inLimits=true;
 for(int k=0;k<300;++k){runMs(20);for(int i=0;i<18;++i){float d=fabsf(cur[i]-prevCur[i]);if(d>maxStep)maxStep=d;prevCur[i]=cur[i];if(cur[i]<settings.minimum[i]||cur[i]>settings.maximum[i])inLimits=false;}
  if(k==100)cmd("GDRIVE 60 40 0");if(k==200)cmd("GDRIVE 0 0 100");}
 CHECK(inLimits,"pulses within limits");
 CHECK(maxStep<=effectiveCap()*0.02f*1.6f,"no jumps beyond the safety cap");
 printf("walk: max step %.1f us/tick, cap %.0f us/s, need %.0f, limiting=%d\n",maxStep,effectiveCap(),needSpeed(1),limiting);
 size_t perTick=0;for(auto& t:Wire.log)if(!t.bytes.empty()&&t.bytes[0]==0x06)++perTick;CHECK(perTick<=2*300+20,"at most one burst per board per tick");
 CHECK(cmd("GSTATUS").find("mode=gait walking=1")!=std::string::npos,"status reports walking");
 CHECK(okReply(cmd("GSTOP")),"release");{uint32_t t0=fakeMillis;while(mode==M_GAIT&&fakeMillis-t0<8000)runMs(20);}
 CHECK(mode==M_HOLD,"gait comes to rest");runMs(1000);CHECK(atReadyPose(),"returns to ready on release");
 // --- slew cap too low is reported
 cmd("GCONFIG 200 1");cmd("GDRIVE 100 0 0");runMs(1500);CHECK(limiting&&cmd("GSTATUS").find("limiting=1")!=std::string::npos,"limiting reported to UI");
 cmd("GSTOP");{uint32_t t0=fakeMillis;while(mode==M_GAIT&&fakeMillis-t0<10000)runMs(20);}runMs(3000);cmd("GCONFIG 0 0");
 // --- envelope check
 settings.maximum[1]=settings.centers[1]+50;CHECK(cmd("GDRIVE 100 0 0").find("would pass its limit")!=std::string::npos,"envelope check names the joint");settings.maximum[1]=2500;
 // --- tick timing: exactly 50 ticks per second, no drift
 {uint32_t before=fakeMillis;uint32_t n0=nextTick;runMs(10000);CHECK((nextTick-n0)==10000&&fakeMillis-before>=10000,"fixed 20 ms schedule without drift");}
 // --- I2C hiccup: retries, then 100 kHz fallback, no fault
 Wire.failNext=4;cmd("JSET 0 1450");runMs(60);CHECK(ready&&Wire.clock==100000,"transient I2C errors recovered at 100 kHz");
 // --- heartbeat
 cmd("READY");runMs(500);{uint32_t t=fakeMillis+1500;while(int32_t(fakeMillis-t)<0)loop();}
 CHECK(!outputsOn()&&cmd("GSTATUS").find("err=heartbeat")!=std::string::npos,"heartbeat drop visible in status");
 // --- hard fault and recovery
 cmd("JSET 0 1450");Wire.dead=true;runMs(60);CHECK(!ready&&cmd("GSTATUS").find("err=i2c")!=std::string::npos,"fault reported");
 CHECK(cmd("JSET 0 1450").find("RECOVER")!=std::string::npos,"fault message tells how to recover");
 Wire.dead=false;CHECK(okReply(cmd("RECOVER"))&&ready&&Wire.clock==400000,"RECOVER restores 400 kHz");
 // --- park
 cmd("POWER 63 0");runMs(3000);CHECK(okReply(cmd("PARK")),"park starts");runMs(4000);CHECK(!outputsOn()&&mode==M_OFF,"parked then outputs off");
 // --- gait params persisted and validated
 CHECK(okReply(cmd("GPARAM 160 120 30 100 50 2600 1300 200")),"gait params");CHECK(nativeV3Store.gait.stride==160&&settings.tested==0,"params saved, tests invalidated");
 CHECK(!okReply(cmd("GPARAM 160 0 30 100 50 2600 1300 200")),"bad params refused");
 if(failures){printf("%d firmware checks FAILED\n",failures);return 1;}
 printf("all firmware v6 tests passed\n");return 0;
}
