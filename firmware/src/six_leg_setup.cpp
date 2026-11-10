// P3DRO six-leg controller, firmware v6 (PlatformIO env: six_leg_setup).
// Leg order LF LM LR RF RM RR; joint order hip knee foot; joint id = leg*3+joint.
// Left legs on PCA9685 0x40 channels 0-8, right legs on 0x41 channels 0-8.
#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <stdio.h>
#include <stdlib.h>
#include <stddef.h>
#include <string.h>
#include <math.h>
#include "gait.h"
#ifdef ARDUINO_ARCH_ESP32
#include <Preferences.h>
#include "setup_wifi.h"
#else
#define reply Serial
#endif

constexpr uint16_t COMMAND_MIN_US=500,COMMAND_MAX_US=2500;
constexpr uint32_t TICK_MS=20;            // fixed control period (50 Hz, one servo frame)
constexpr uint32_t HEARTBEAT_MS=1000;     // outputs off if the controlling link goes quiet
constexpr uint32_t ENABLE_STAGGER_MS=40;  // one servo energised at a time
constexpr uint32_t I2C_FAST=400000,I2C_SAFE=100000;
constexpr uint32_t ALL_JOINTS=(1u<<18)-1;
const char* const JOINT_NAMES[18]={"LF hip","LF knee","LF foot","LM hip","LM knee","LM foot","LR hip","LR knee","LR foot",
 "RF hip","RF knee","RF foot","RM hip","RM knee","RM foot","RR hip","RR knee","RR foot"};

Adafruit_PWMServoDriver leftBoard(0x40,Wire),rightBoard(0x41,Wire);
const uint8_t BOARD_ADDR[2]={0x40,0x41};

// ---------------------------------------------------------------- settings (NVS)
// v2 (previous firmware, key "settings") is read once and migrated into v3
// (key "cal3"); the old blob is left untouched so older firmware still boots.
struct SavedSettingsV2 {uint32_t magic,version,confirmed,crabFlags;uint16_t centers[18],minimum[18],maximum[18],crab[72];uint32_t checksum;};
struct SavedSettings {uint32_t magic,version,confirmed,invert,dirOk,tested;uint16_t centers[18],minimum[18],maximum[18];hx::GaitParams gait;uint32_t checksum;};
constexpr uint32_t MAGIC=0x48585044;
SavedSettings settings={};
bool migratedFromV2=false;
template<class T> uint32_t fnv(const T& s){const uint8_t* b=(const uint8_t*)&s;uint32_t h=2166136261u;for(size_t i=0;i<offsetof(T,checksum);++i)h=(h^b[i])*16777619u;return h;}
uint32_t defaultInvert(){uint32_t m=0;for(int i=9;i<18;++i)m|=1u<<i;return m;}   // right side mirrored, as in v5
void defaultSettings(){settings=SavedSettings{};settings.magic=MAGIC;settings.version=3;settings.invert=defaultInvert();
 for(int i=0;i<18;++i){settings.centers[i]=1500;settings.minimum[i]=COMMAND_MIN_US;settings.maximum[i]=COMMAND_MAX_US;}
 settings.gait=hx::GaitParams();settings.checksum=fnv(settings);}
bool validJoint(uint16_t c,uint16_t lo,uint16_t hi){return lo>=COMMAND_MIN_US&&hi<=COMMAND_MAX_US&&lo<hi&&c>=lo&&c<=hi;}
bool validSettings(const SavedSettings& s){
 if(s.magic!=MAGIC||s.version!=3||s.checksum!=fnv(s)||(s.confirmed|s.invert|s.dirOk)>>18||s.tested>>4||!hx::validParams(s.gait))return false;
 for(int i=0;i<18;++i)if(!validJoint(s.centers[i],s.minimum[i],s.maximum[i]))return false;return true;}
bool validV2(const SavedSettingsV2& s){
 if(s.magic!=MAGIC||(s.version!=1&&s.version!=2)||s.checksum!=fnv(s)||s.confirmed>>18)return false;
 for(int i=0;i<18;++i)if(s.minimum[i]<COMMAND_MIN_US||s.maximum[i]>COMMAND_MAX_US||s.centers[i]<s.minimum[i]||s.centers[i]>s.maximum[i]||s.minimum[i]>=s.maximum[i])return false;return true;}
void migrateV2(const SavedSettingsV2& old){
 defaultSettings();settings.confirmed=old.confirmed;
 for(int i=0;i<18;++i){settings.centers[i]=old.centers[i];
  // v1 stored 1000..2000 defaults; v5 firmware widened those to 500..2500 on load.
  settings.minimum[i]=old.version==1?COMMAND_MIN_US:old.minimum[i];settings.maximum[i]=old.version==1?COMMAND_MAX_US:old.maximum[i];}
 migratedFromV2=true;}
#ifndef ARDUINO_ARCH_ESP32
SavedSettingsV2 nativeV2Store={};bool nativeV2Present=false;SavedSettings nativeV3Store={};bool nativeV3Present=false;int nativeWrites=0;
#endif
bool persistSettings(){settings.checksum=fnv(settings);
#ifdef ARDUINO_ARCH_ESP32
 Preferences p;if(!p.begin("hex-setup",false))return false;size_t n=p.putBytes("cal3",&settings,sizeof(settings));p.end();return n==sizeof(settings);
#else
 nativeV3Store=settings;nativeV3Present=true;++nativeWrites;return true;
#endif
}
void loadSettings(){defaultSettings();migratedFromV2=false;bool loaded=false;(void)loaded;
#ifdef ARDUINO_ARCH_ESP32
 Preferences p;
 if(p.begin("hex-setup",true)){
  SavedSettings c={};
  if(p.getBytesLength("cal3")==sizeof(c)&&p.getBytes("cal3",&c,sizeof(c))==sizeof(c)&&validSettings(c)){settings=c;loaded=true;}
  if(!loaded){SavedSettingsV2 o={};if(p.getBytesLength("settings")==sizeof(o)&&p.getBytes("settings",&o,sizeof(o))==sizeof(o)&&validV2(o)){migrateV2(o);}}
  p.end();
 }
#else
 if(nativeV3Present&&validSettings(nativeV3Store)){settings=nativeV3Store;loaded=true;}
 else if(nativeV2Present&&validV2(nativeV2Store))migrateV2(nativeV2Store);
#endif
 if(migratedFromV2)persistSettings();
}
int dirSign(int id){return (settings.invert>>id)&1u?-1:1;}
bool allConfirmed(){return settings.confirmed==ALL_JOINTS;}
bool allDirections(){return settings.dirOk==ALL_JOINTS;}
void invalidateTests(){settings.tested=0;}

// ---------------------------------------------------------------- output state
enum Mode {M_OFF,M_HOLD,M_ENABLE,M_GAIT,M_PARK};
const char* const MODE_NAMES[]={"off","hold","enabling","gait","park"};
Mode mode=M_OFF;
bool ready=false;
uint32_t outMask=0;          // energised joints
float cur[18]={0};           // commanded pulse now (us, float for sub-tick smoothness)
uint16_t tgt[18]={0};        // hold-mode target
uint16_t written[18]={0};    // last PCA ticks written (0 = full off)
float holdRate=400;          // us/s for hold-mode moves
uint32_t heartbeat=0,nextTick=0;
bool heartbeatAllowed=true;  // set false by the transport layer for non-owner pollers
const char* lastError="none";
uint32_t i2cClock=I2C_FAST,i2cRetries=0;
// staggered enable queue
uint8_t enOrder[18];uint16_t enPulse[18];int enCount=0,enIndex=0;uint32_t enNext=0;float enRate=400;
// gait
hx::Gait gait;
int gaitTempo=0;             // 0 Eco, 1 Sport
int capSetting=0;            // 0 = auto (sized to tempo), else us/s
int testCode=0;              // 0 drive, 1 fwd, 2 back, 3 left, 4 right
bool testReleased=false;
int lastBlocked=0;
uint32_t clipCount=0;int clipJoint=-1;uint32_t limitTicks=0,lastLimitMs=0;bool limiting=false;
float driveCmd[3]={0,0,0};

bool outputsOn(){return outMask!=0||mode==M_ENABLE;}   // enabling counts: watchdog and ownership apply
void refreshHeartbeat(){if(heartbeatAllowed)heartbeat=millis();}
float cycleFor(int tempo){return tempo?settings.gait.sportMs:settings.gait.ecoMs;}
float needSpeed(int tempo){return hx::requiredSpeed(settings.gait,cycleFor(tempo));}
float effectiveCap(){return capSetting?float(capSetting):needSpeed(gaitTempo)*1.25f+50;}
uint16_t usToTicks(float us){return uint16_t((uint32_t(us+0.5f)*25+61)/122);}
uint16_t parkPulse(int id){int j=id%3;float v=settings.centers[id];if(j==1)v+=dirSign(id)*float(settings.gait.park);
 if(v<settings.minimum[id])v=settings.minimum[id];if(v>settings.maximum[id])v=settings.maximum[id];return uint16_t(v);}

// ---------------------------------------------------------------- PCA9685 I/O
// One auto-increment burst per board (LED0_ON_L = 0x06, 4 bytes per channel).
bool writeBurst(uint8_t addr,const uint16_t* ticks,int channels){
 Wire.beginTransmission(addr);Wire.write(uint8_t(0x06));
 for(int ch=0;ch<channels;++ch){uint16_t t=ticks[ch];
  Wire.write(uint8_t(0));Wire.write(uint8_t(0));
  if(t==0){Wire.write(uint8_t(0));Wire.write(uint8_t(0x10));}     // full off
  else {Wire.write(uint8_t(t&0xFF));Wire.write(uint8_t(t>>8));}}
 return Wire.endTransmission()==0;}
bool writeBurstRetry(uint8_t addr,const uint16_t* ticks,int channels){
 for(int attempt=0;attempt<3;++attempt){if(writeBurst(addr,ticks,channels))return true;++i2cRetries;}
 if(i2cClock!=I2C_SAFE){i2cClock=I2C_SAFE;Wire.setClock(I2C_SAFE);   // noisy bus: fall back to 100 kHz once
  for(int attempt=0;attempt<2;++attempt)if(writeBurst(addr,ticks,channels))return true;}
 return false;}
bool writeReg(uint8_t addr,uint8_t reg,uint8_t v){Wire.beginTransmission(addr);Wire.write(reg);Wire.write(v);return Wire.endTransmission()==0;}
int readReg(uint8_t addr,uint8_t reg){Wire.beginTransmission(addr);Wire.write(reg);if(Wire.endTransmission()!=0)return -1;if(Wire.requestFrom(int(addr),1)!=1)return -1;return Wire.read();}
bool boardsOff(){uint16_t zero[16]={0};bool ok=writeBurstRetry(BOARD_ADDR[0],zero,16);ok=writeBurstRetry(BOARD_ADDR[1],zero,16)&&ok;
 for(int i=0;i<18;++i)written[i]=0;return ok;}
// Push changed joints. Returns false on an I2C failure that survived retries.
bool flushOutputs(){
 for(int b=0;b<2;++b){uint16_t t[9];bool changed=false;
  for(int k=0;k<9;++k){int id=b*9+k;t[k]=(outMask>>id)&1u?usToTicks(cur[id]):0;if(t[k]!=written[id])changed=true;}
  if(!changed)continue;
  if(!writeBurstRetry(BOARD_ADDR[b],t,9))return false;
  for(int k=0;k<9;++k)written[b*9+k]=t[k];}
 return true;}

void resetMotion(){outMask=0;mode=M_OFF;gait.active=false;testCode=0;enCount=enIndex=0;for(int i=0;i<18;++i){cur[i]=0;tgt[i]=0;}
 for(int i=0;i<3;++i)driveCmd[i]=0;limiting=false;}
bool off(){resetMotion();return boardsOff();}
void fault(const char* why){resetMotion();boardsOff();ready=false;lastError=why;
 reply.printf("ERR fault: %s; outputs off. Send RECOVER (or reset) after checking wiring and power\n",why);}
bool initBoards(){
 bool l=leftBoard.begin(),r=rightBoard.begin();if(!l||!r){lastError="boards";return false;}
 leftBoard.setPWMFreq(50);rightBoard.setPWMFreq(50);
 if(leftBoard.readPrescale()!=121||rightBoard.readPrescale()!=121){lastError="prescale";return false;}
 Wire.setClock(i2cClock);
 for(int b=0;b<2;++b){int m=readReg(BOARD_ADDR[b],0x00);if(m<0||!writeReg(BOARD_ADDR[b],0x00,uint8_t((m&~0x10)|0x20))){lastError="i2c";return false;}} // awake + auto-increment
 if(!boardsOff()){lastError="i2c";return false;}
 return true;}

// ---------------------------------------------------------------- status lines
void printList(const char* key,const uint16_t* v,int n){reply.printf(" %s=",key);for(int i=0;i<n;++i)reply.printf("%s%u",i?",":"",unsigned(v[i]));}
void poseStatus(){uint16_t c[18];for(int i=0;i<18;++i)c[i]=(outMask>>i)&1u?uint16_t(cur[i]+0.5f):0;
 reply.printf("POSE v=4 ready=%d out=%lu",ready,(unsigned long)outMask);printList("current",c,18);printList("target",tgt,18);reply.println("");}
void calibrationStatus(){reply.printf("CALDATA v=2 confirmed=%lu invert=%lu dirok=%lu",(unsigned long)settings.confirmed,(unsigned long)settings.invert,(unsigned long)settings.dirOk);
 printList("centers",settings.centers,18);printList("minimum",settings.minimum,18);printList("maximum",settings.maximum,18);reply.println("");}
void paramStatus(){const hx::GaitParams& g=settings.gait;
 reply.printf("GPARAM v=1 stride=%u lift=%u tuck=%u reach=%u mix=%u eco=%u sport=%u park=%u needEco=%d needSport=%d\n",
  g.stride,g.lift,g.tuck,g.reach,g.mix,g.ecoMs,g.sportMs,g.park,int(needSpeed(0)+0.5f),int(needSpeed(1)+0.5f));}
void gaitStatus(){if(outputsOn())refreshHeartbeat();
 reply.printf("GAIT v=2 ready=%d out=%lu mode=%s walking=%d test=%d phase=%.3f cycles=%.2f tested=%lu tempo=%d cap=%d auto=%d need=%d limiting=%d clip=%d drive=%d,%d,%d blocked=%d confirmed=%d dirok=%d i2c=%lu err=%s\n",
  ready,(unsigned long)outMask,MODE_NAMES[mode],gait.active,testCode,gait.phase,gait.cycles,(unsigned long)settings.tested,gaitTempo,int(effectiveCap()+0.5f),capSetting==0,
  int(needSpeed(gaitTempo)+0.5f),limiting,clipJoint,int(gait.drive[0]*100),int(gait.drive[1]*100),int(gait.drive[2]*100),lastBlocked,
  allConfirmed(),allDirections(),(unsigned long)(i2cClock/1000),lastError);}

// ---------------------------------------------------------------- motion helpers
bool atReadyPose(){if(outMask!=ALL_JOINTS||mode!=M_HOLD)return false;for(int i=0;i<18;++i)if(tgt[i]!=settings.centers[i]||fabsf(cur[i]-settings.centers[i])>0.5f)return false;return true;}
const char* gaitBlocker(){
 if(!ready)return "controller fault; RECOVER first";
 if(!allConfirmed())return "save all 18 ready pulses on the calibration page first";
 if(!allDirections())return "check all 18 joint directions on the calibration page first";
 if(outMask!=ALL_JOINTS)return "stand up (all 18 outputs on) first";
 if(mode==M_ENABLE)return "still enabling outputs";
 if(mode==M_PARK)return "parking";
 return nullptr;}
// Worst-case envelope check against saved limits before starting.
const char* envelopeProblem(){static char msg[96];const hx::GaitParams& g=settings.gait;
 for(int id=0;id<18;++id){int j=id%3;float lo=0,hi=0;
  if(j==0){lo=-g.stride*0.5f;hi=g.stride*0.5f;}
  else if(j==1){lo=-g.reach*0.5f*g.mix/100.0f;hi=g.lift+g.reach*0.5f*g.mix/100.0f;}
  else {lo=-g.reach*0.5f;hi=g.tuck+g.reach*0.5f;}
  float a=settings.centers[id]+dirSign(id)*lo,b=settings.centers[id]+dirSign(id)*hi;if(a>b){float t=a;a=b;b=t;}
  if(a<settings.minimum[id]-0.5f||b>settings.maximum[id]+0.5f){snprintf(msg,sizeof(msg),"%s would pass its limit (%d..%d); reduce stride/lift/tuck/reach or widen limits",JOINT_NAMES[id],int(a),int(b));return msg;}}
 return nullptr;}
int testedBit(int code){return 1<<(code-1);}  // 1 fwd, 2 back, 4 left, 8 right
void applyDrive(){ // gate untested directions
 float f=driveCmd[0],t=driveCmd[1],s=driveCmd[2];int blocked=0;uint32_t ok=settings.tested;
 if(f>0&&!(ok&1)){f=0;blocked|=1;} if(f<0&&!(ok&2)){f=0;blocked|=2;}
 if(t!=0&&(ok&3)!=3){t=0;blocked|=3;}
 if(s<0&&!(ok&4)){s=0;blocked|=4;} if(s>0&&!(ok&8)){s=0;blocked|=8;}
 lastBlocked=blocked;gait.setCommand(f,t,s);}
void startGait(){gait.params=settings.gait;gait.begin(cycleFor(gaitTempo));mode=M_GAIT;clipJoint=-1;limitTicks=0;limiting=false;testReleased=false;}

void gaitTick(float dtMs){
 if(testCode&&!testReleased&&gait.cycles>=1.25f){testReleased=true;gait.setCommand(0,0,0);}
 bool running=gait.step(dtMs);
 const float cap=effectiveCap(),maxStep=cap*dtMs/1000.0f;bool limitedNow=false;
 for(int id=0;id<18;++id){const hx::LegOffsets& o=gait.out[id/3];float logical=id%3==0?o.hip:(id%3==1?o.knee:o.foot);
  float want=running?settings.centers[id]+dirSign(id)*logical:settings.centers[id];
  if(want<settings.minimum[id]){want=settings.minimum[id];++clipCount;clipJoint=id;}
  if(want>settings.maximum[id]){want=settings.maximum[id];++clipCount;clipJoint=id;}
  float d=want-cur[id];if(d>maxStep){d=maxStep;limitedNow=true;}if(d<-maxStep){d=-maxStep;limitedNow=true;}
  cur[id]+=d;}
 if(limitedNow){++limitTicks;lastLimitMs=millis();}limiting=limitTicks&&uint32_t(millis()-lastLimitMs)<500;   // sticky ~0.5 s for the UI
 if(!running){
  for(int id=0;id<18;++id)tgt[id]=settings.centers[id];
  mode=M_HOLD;holdRate=cap;
  if(testCode&&testReleased){settings.tested|=testedBit(testCode);persistSettings();}
  testCode=0;}}
void holdTick(float dtMs){float step=(mode==M_ENABLE?enRate:(mode==M_PARK?150.0f:holdRate))*dtMs/1000.0f;bool done=true;
 for(int id=0;id<18;++id){if(!((outMask>>id)&1u))continue;float d=tgt[id]-cur[id];if(d>step)d=step;if(d<-step)d=-step;cur[id]+=d;if(fabsf(tgt[id]-cur[id])>0.01f)done=false;else cur[id]=tgt[id];}
 if(mode==M_ENABLE&&enIndex>=enCount&&done)mode=M_HOLD;
 if(mode==M_PARK&&done){if(!off())fault("i2c");else lastError="parked";}}
void enableTick(uint32_t now){
 if(mode!=M_ENABLE||enIndex>=enCount||int32_t(now-enNext)<0)return;
 int id=enOrder[enIndex];cur[id]=enPulse[id];outMask|=1u<<id;++enIndex;enNext=now+ENABLE_STAGGER_MS;}
void controlTick(uint32_t now,float dtMs){
 enableTick(now);
 if(mode==M_GAIT)gaitTick(dtMs);else if(outputsOn())holdTick(dtMs);
 if(!flushOutputs())fault("i2c");}

// ---------------------------------------------------------------- commands
bool parseInts(const char* s,long* v,int n){for(int i=0;i<n;++i){while(*s==' ')++s;if(!*s)return false;char* e;v[i]=strtol(s,&e,10);if(e==s||(*e&&*e!=' '))return false;s=e;}while(*s==' ')++s;return *s==0;}
bool startsWith(const char* c,const char* p){return !strncmp(c,p,strlen(p));}
void ok(const char* verb){reply.printf("OK %s\n",verb);}
void err(const char* verb,const char* why){reply.printf("ERR %s: %s\n",verb,why);}
bool motionBusy(){return mode==M_GAIT||mode==M_PARK;}
void queueEnable(uint32_t legMask,bool fromPark,float rate){
 // Energise one servo at a time (knee, foot, then hip; legs LF RF LM RM LR RR) at the
 // ready pulse (or the park pose when standing up), then ramp everything to ready.
 static const int legOrder[6]={0,3,1,4,2,5},jointOrder[3]={1,2,0};
 enCount=enIndex=0;
 for(int li=0;li<6;++li){int leg=legOrder[li];if(!((legMask>>leg)&1u))continue;
  for(int ji=0;ji<3;++ji){int id=leg*3+jointOrder[ji];tgt[id]=settings.centers[id];
   if((outMask>>id)&1u)continue;enOrder[enCount++]=uint8_t(id);enPulse[id]=fromPark?parkPulse(id):settings.centers[id];}}
 enRate=rate;enNext=millis();mode=M_ENABLE;}

void execute(const char* cmd){
 long v[20];
 if(!strcmp(cmd,"CAPS")){reply.println("CAPS v=6 min=500 max=2500 joints=18 nvs=3 gait=2 drive=1 park=1 tests=4 wifi=1");return;}
 if(!strcmp(cmd,"STATE")){poseStatus();return;}
 if(!strcmp(cmd,"CALDATA")){calibrationStatus();return;}
 if(!strcmp(cmd,"GPARAM")){paramStatus();return;}
 if(!strcmp(cmd,"GSTATUS")||!strcmp(cmd,"STATUS")){gaitStatus();return;}
 if(!strcmp(cmd,"OFF")){if(!off())fault("i2c");else{if(strcmp(lastError,"parked"))lastError="none";ok("OFF");}return;}
 if(!strcmp(cmd,"RECOVER")){if(outputsOn()){err("RECOVER","outputs are on; OFF first");return;}
  resetMotion();i2cClock=I2C_FAST;ready=initBoards();if(ready){lastError="none";ok("RECOVER");}else err("RECOVER",lastError);return;}
 if(!strcmp(cmd,"PING")){if(outputsOn())refreshHeartbeat();ok("PING");return;}
 if(!ready){reply.printf("ERR not ready: fault (%s); check PCA boards/power, then RECOVER\n",lastError);return;}

 if(startsWith(cmd,"POWER ")){ // POWER <legMask 1..63> [stand 0/1]
  long a[2];bool two=parseInts(cmd+6,a,2);if(!two&&!parseInts(cmd+6,a,1)){err("POWER","usage POWER <legmask> [stand]");return;}if(!two)a[1]=0;
  if(a[0]<1||a[0]>63||(a[1]!=0&&a[1]!=1)){err("POWER","leg mask 1..63, stand 0/1");return;}
  if(motionBusy()||mode==M_ENABLE){err("POWER","wait for the current motion to finish");return;}
  if(a[1]&&(!allConfirmed()||!allDirections())){err("POWER","stand-up needs all ready pulses and directions saved");return;}
  queueEnable(uint32_t(a[0]),a[1]==1,a[1]?250.0f:400.0f);heartbeat=millis();ok("POWER");return;}
 if(startsWith(cmd,"JSET ")){ // JSET <id> <pulse> [rate us/s]
  long a[3];bool three=parseInts(cmd+5,a,3);if(!three&&!parseInts(cmd+5,a,2)){err("JSET","usage JSET <joint> <pulse> [rate]");return;}if(!three)a[2]=400;
  if(a[0]<0||a[0]>17||a[2]<10||a[2]>5000){err("JSET","joint 0..17, rate 10..5000");return;}
  int id=int(a[0]);if(a[1]<settings.minimum[id]||a[1]>settings.maximum[id]){reply.printf("ERR JSET: %s limit is %u..%u\n",JOINT_NAMES[id],settings.minimum[id],settings.maximum[id]);return;}
  if(motionBusy()||mode==M_ENABLE){err("JSET","wait for the current motion to finish");return;}
  if(!((outMask>>id)&1u)){cur[id]=float(a[1]);outMask|=1u<<id;}   // energise at the requested (saved) pulse; no 1500 snap
  tgt[id]=uint16_t(a[1]);holdRate=float(a[2]);mode=M_HOLD;heartbeat=millis();ok("JSET");return;}
 if(startsWith(cmd,"JOFF ")){long a[1];if(!parseInts(cmd+5,a,1)||a[0]<0||a[0]>17){err("JOFF","joint 0..17");return;}
  if(motionBusy()){err("JOFF","stop motion first");return;}
  outMask&=~(1u<<a[0]);cur[a[0]]=0;tgt[a[0]]=0;if(!outMask)mode=M_OFF;heartbeat=millis();ok("JOFF");return;}
 if(startsWith(cmd,"FRAME ")){ // FRAME <rate us/s> <18 pulses, 0 = leave>
  if(!parseInts(cmd+6,v,19)||v[0]<10||v[0]>5000){err("FRAME","rate 10..5000 then 18 pulses");return;}
  if(motionBusy()||mode==M_ENABLE||!outputsOn()){err("FRAME","outputs must be holding");return;}
  for(int i=0;i<18;++i){long p=v[i+1];if(!p)continue;if(!((outMask>>i)&1u)||p<settings.minimum[i]||p>settings.maximum[i]){reply.printf("ERR FRAME: %s off or outside limits\n",JOINT_NAMES[i]);return;}}
  for(int i=0;i<18;++i)if(v[i+1])tgt[i]=uint16_t(v[i+1]);holdRate=float(v[0]);heartbeat=millis();ok("FRAME");return;}
 if(!strcmp(cmd,"READY")){ // ramp every energised joint back to its saved ready pulse
  if(motionBusy()||!outputsOn()){err("READY","outputs must be holding");return;}
  for(int i=0;i<18;++i)if((outMask>>i)&1u)tgt[i]=settings.centers[i];holdRate=400;heartbeat=millis();ok("READY");return;}
 if(startsWith(cmd,"CALSAVE ")){long a[2];if(!parseInts(cmd+8,a,2)||a[0]<0||a[0]>17){err("CALSAVE","joint 0..17 and pulse");return;}
  int id=int(a[0]);if(a[1]<settings.minimum[id]||a[1]>settings.maximum[id]){err("CALSAVE","pulse outside saved limits");return;}
  if(motionBusy()){err("CALSAVE","stop motion first");return;}
  if(((outMask>>id)&1u)&&tgt[id]!=a[1]){err("CALSAVE","pulse differs from the held position");return;}
  settings.centers[id]=uint16_t(a[1]);settings.confirmed|=1u<<id;invalidateTests();if(!persistSettings()){err("CALSAVE","storage write");return;}ok("CALSAVE");return;}
 if(startsWith(cmd,"LIMIT ")){long a[3];if(!parseInts(cmd+6,a,3)||a[0]<0||a[0]>17){err("LIMIT","joint 0..17 min max");return;}
  int id=int(a[0]);if(a[1]<COMMAND_MIN_US||a[2]>COMMAND_MAX_US||a[1]>=a[2]){err("LIMIT","need 500 <= min < max <= 2500");return;}
  if(settings.centers[id]<a[1]||settings.centers[id]>a[2]){err("LIMIT","saved ready pulse must stay inside the limits");return;}
  if(motionBusy()){err("LIMIT","stop motion first");return;}
  if(((outMask>>id)&1u)&&(tgt[id]<a[1]||tgt[id]>a[2])){err("LIMIT","held position outside new limits");return;}
  settings.minimum[id]=uint16_t(a[1]);settings.maximum[id]=uint16_t(a[2]);invalidateTests();if(!persistSettings()){err("LIMIT","storage write");return;}ok("LIMIT");return;}
 if(startsWith(cmd,"DIR ")){long a[2];if(!parseInts(cmd+4,a,2)||a[0]<0||a[0]>17||(a[1]!=0&&a[1]!=1)){err("DIR","joint 0..17 invert 0/1");return;}
  if(motionBusy()){err("DIR","stop motion first");return;}
  uint32_t bit=1u<<a[0];if(a[1])settings.invert|=bit;else settings.invert&=~bit;settings.dirOk|=bit;invalidateTests();
  if(!persistSettings()){err("DIR","storage write");return;}ok("DIR");return;}
 if(startsWith(cmd,"CALSET ")){ // CALSET id center min max invert dirok confirmed  (backup restore, outputs off)
  long a[7];if(!parseInts(cmd+7,a,7)||a[0]<0||a[0]>17||!validJoint(uint16_t(a[1]),uint16_t(a[2]),uint16_t(a[3]))||a[2]<500||a[3]>2500||(a[4]|a[5]|a[6])>1||a[4]<0||a[5]<0||a[6]<0){err("CALSET","id center min max invert dirok confirmed");return;}
  if(outputsOn()){err("CALSET","outputs off first");return;}
  int id=int(a[0]);uint32_t bit=1u<<id;settings.centers[id]=uint16_t(a[1]);settings.minimum[id]=uint16_t(a[2]);settings.maximum[id]=uint16_t(a[3]);
  if(a[4])settings.invert|=bit;else settings.invert&=~bit;if(a[5])settings.dirOk|=bit;else settings.dirOk&=~bit;if(a[6])settings.confirmed|=bit;else settings.confirmed&=~bit;
  invalidateTests();if(!persistSettings()){err("CALSET","storage write");return;}ok("CALSET");return;}
 if(!strcmp(cmd,"CALRESET")){if(outputsOn()){err("CALRESET","outputs off first");return;}defaultSettings();if(!persistSettings()){err("CALRESET","storage write");return;}ok("CALRESET");return;}
 if(startsWith(cmd,"GPARAM ")){ // GPARAM stride lift tuck reach mix ecoMs sportMs park
  long a[8];if(!parseInts(cmd+7,a,8)){err("GPARAM","stride lift tuck reach mix eco sport park");return;}
  hx::GaitParams p;p.stride=uint16_t(a[0]);p.lift=uint16_t(a[1]);p.tuck=uint16_t(a[2]);p.reach=uint16_t(a[3]);p.mix=uint16_t(a[4]);p.ecoMs=uint16_t(a[5]);p.sportMs=uint16_t(a[6]);p.park=uint16_t(a[7]);
  for(int i=0;i<8;++i)if(a[i]<0||a[i]>6000){err("GPARAM","out of range");return;}
  if(!hx::validParams(p)){err("GPARAM","stride<=600 lift 20..600 tuck<=400 reach<=600 mix<=150 cycles 600..6000 park<=600");return;}
  if(motionBusy()){err("GPARAM","stop walking first");return;}
  settings.gait=p;invalidateTests();if(!persistSettings()){err("GPARAM","storage write");return;}ok("GPARAM");return;}
 if(startsWith(cmd,"GCONFIG ")){ // GCONFIG <cap us/s, 0=auto> <tempo 0 Eco / 1 Sport>
  long a[2];if(!parseInts(cmd+8,a,2)||(a[0]!=0&&(a[0]<50||a[0]>5000))||a[1]<0||a[1]>1){err("GCONFIG","cap 0(auto) or 50..5000, tempo 0/1");return;}
  capSetting=int(a[0]);gaitTempo=int(a[1]);gait.targetCycleMs=cycleFor(gaitTempo);if(outputsOn())refreshHeartbeat();ok("GCONFIG");return;}
 if(startsWith(cmd,"GDRIVE ")){ // GDRIVE <forward> <turn> <side>, each -100..100
  long a[3];if(!parseInts(cmd+7,a,3)||a[0]<-100||a[0]>100||a[1]<-100||a[1]>100||a[2]<-100||a[2]>100){err("GDRIVE","forward turn side, each -100..100");return;}
  if(testCode){err("GDRIVE","a test cycle is running");return;}
  for(int i=0;i<3;++i)driveCmd[i]=a[i]/100.0f;heartbeat=millis();
  bool any=a[0]||a[1]||a[2];
  if(mode==M_GAIT){applyDrive();ok("GDRIVE");return;}
  if(!any){lastBlocked=0;ok("GDRIVE");return;}
  const char* b=gaitBlocker();if(b){err("GDRIVE",b);return;}
  if(!atReadyPose()){err("GDRIVE","return to the ready pose first (READY)");return;}
  const char* e=envelopeProblem();if(e){err("GDRIVE",e);return;}
  applyDrive();if(gait.commandZero()){err("GDRIVE","run the one-cycle test for this direction first (deck: Tests)");return;}
  startGait();applyDrive();ok("GDRIVE");
  return;}
 if(!strcmp(cmd,"GSTOP")||!strcmp(cmd,"GRELEASE")){for(int i=0;i<3;++i)driveCmd[i]=0;if(mode==M_GAIT&&!testCode)gait.setCommand(0,0,0);heartbeat=millis();ok("GSTOP");return;}
 if(startsWith(cmd,"GTEST ")){ // GTEST <1 forward | 2 backward | 3 crab left | 4 crab right>
  long a[1];if(!parseInts(cmd+6,a,1)||a[0]<1||a[0]>4){err("GTEST","1 forward, 2 backward, 3 left, 4 right");return;}
  const char* b=gaitBlocker();if(b){err("GTEST",b);return;}
  if(mode==M_GAIT){err("GTEST","already walking");return;}
  if(!atReadyPose()){err("GTEST","return to the ready pose first (READY)");return;}
  const char* e=envelopeProblem();if(e){err("GTEST",e);return;}
  testCode=int(a[0]);startGait();
  const float dirs[4][3]={{1,0,0},{-1,0,0},{0,0,-1},{0,0,1}};gait.setCommand(dirs[a[0]-1][0],dirs[a[0]-1][1],dirs[a[0]-1][2]);lastBlocked=0;
  heartbeat=millis();ok("GTEST");return;}
 if(!strcmp(cmd,"PARK")){
  if(outMask!=ALL_JOINTS||mode!=M_HOLD){err("PARK","stand at the ready pose with all outputs on first");return;}
  if(!allDirections()){err("PARK","check joint directions first");return;}
  for(int i=0;i<18;++i)tgt[i]=parkPulse(i);mode=M_PARK;heartbeat=millis();ok("PARK");return;}
 if(startsWith(cmd,"START ")||startsWith(cmd,"JSTART ")||startsWith(cmd,"GSTART ")||startsWith(cmd,"CRABSET ")||startsWith(cmd,"CFG ")||startsWith(cmd,"ARM")||startsWith(cmd,"MOVE ")){
  reply.println("ERR removed in firmware v6: use POWER/JSET/GDRIVE/GTEST (limits live in NVS; CFG no longer exists)");return;}
 reply.println("ERR unknown command");}

// ---------------------------------------------------------------- Arduino entry
char buffer[192];unsigned used=0;bool overflow=false;
void setup(){Serial.begin(115200);Wire.begin(21,22);Wire.setClock(I2C_FAST);Wire.setTimeOut(50);
 loadSettings();resetMotion();ready=initBoards();
 if(!ready){reply.printf("ERR need PCA 0x40 and 0x41 (%s); outputs off attempted. Send RECOVER to retry\n",lastError);}
 else {reply.println(migratedFromV2?"OK boot v6: migrated saved v5 calibration (check joint directions)":"OK boot v6: outputs off");}
 nextTick=millis()+TICK_MS;
#ifdef ARDUINO_ARCH_ESP32
 setupWifiBegin();
#endif
}
void loop(){
#ifdef ARDUINO_ARCH_ESP32
 setupWifiPoll();
#endif
 for(unsigned n=0;n<192&&Serial.available();++n){char c=char(Serial.read());
  if(c=='\r'||c=='\n'){if(overflow)reply.println("ERR invalid command");else if(used){buffer[used]=0;
#ifdef ARDUINO_ARCH_ESP32
   executeSerial(buffer);
#else
   execute(buffer);
#endif
  }used=0;overflow=false;}
  else if(c<32||c>126)overflow=true;else if(!overflow){if(used<sizeof(buffer)-1)buffer[used++]=c;else overflow=true;}}
 uint32_t now=millis();
 if(outputsOn()&&uint32_t(now-heartbeat)>=HEARTBEAT_MS){if(!off())fault("i2c");else{lastError="heartbeat";reply.println("ERR heartbeat expired; outputs off");}}
 if(int32_t(now-nextTick)>=0){
  // Fixed-rate schedule: advance by whole periods so timing never drifts; resync after long stalls.
  float dt=float(TICK_MS);
  if(int32_t(now-nextTick)>int32_t(5*TICK_MS)){dt=float(now-nextTick+TICK_MS);if(dt>100)dt=100;nextTick=now+TICK_MS;}
  else nextTick+=TICK_MS;
  if(ready&&outputsOn())controlTick(now,dt);}
 delay(1);
}
