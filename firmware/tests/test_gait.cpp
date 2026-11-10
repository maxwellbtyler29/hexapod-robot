// Native tests for the continuous tripod gait generator (firmware/src/gait.h).
#include "../src/gait.h"
#include <cassert>
#include <cstdio>
#include <cmath>
using namespace hx;
static int failures=0;
#define CHECK(c,msg) do{if(!(c)){++failures;printf("FAIL %s (line %d)\n",msg,__LINE__);}}while(0)

struct Run{float maxJump[3]={0,0,0};float maxHip=0,maxLift=0;bool touchdownDuringHip=false;bool stanceLift=false;int ticks=0;};
// Drive the generator with dt and a command schedule, checking continuity per tick.
static Run run(Gait& g,float dt,float seconds,float f,float t,float s,float releaseAt){
 Run r;LegOffsets prev[6];for(int l=0;l<6;++l)prev[l]=g.out[l];
 float time=0;
 g.setCommand(f,t,s);
 while(time<seconds*1000){
  if(time>=releaseAt*1000)g.setCommand(0,0,0);
  bool running=g.step(dt);time+=dt;++r.ticks;
  for(int l=0;l<6;++l){
   const LegOffsets& o=g.out[l];
   float j[3]={fabsf(o.hip-prev[l].hip),fabsf(o.knee-prev[l].knee),fabsf(o.foot-prev[l].foot)};
   for(int k=0;k<3;++k)if(j[k]>r.maxJump[k])r.maxJump[k]=j[k];
   if(fabsf(o.hip)>r.maxHip)r.maxHip=fabsf(o.hip);
   float psi=g.phase+(tripodA(l)?0.f:0.5f);if(psi>=1)psi-=1;
   if(psi>=DUTY){float sw=(psi-DUTY)/(1-DUTY);
    // Foot must be fully clear (lift profile at its top) through the whole hip move window.
    if(sw>HIP_START+0.0f&&sw<HIP_END&&liftProfile(sw)<0.5f)r.touchdownDuringHip=true;
    // The hip must have arrived before the foot touches: once lowering is past half way, hip done.
    if(sw>=HIP_END+0.0f){float u=minJerk((sw-HIP_START)/(HIP_END-HIP_START));if(u<0.999f)r.touchdownDuringHip=true;}
   }else if(o.knee>0.5f+g.params.mix*fabsf(g.params.reach)/100.f)r.stanceLift=true;
   prev[l]=o;}
  if(!running)break;
 }
 return r;
}
int main(){
 // Profile helpers
 CHECK(fabsf(minJerk(0))<1e-6f&&fabsf(minJerk(1)-1)<1e-6f,"minJerk endpoints");
 CHECK(fabsf(trapezoid(1,0.1f)-1)<1e-5f&&fabsf(trapezoid(0.5f,0.1f)-0.5f)<1e-5f,"trapezoid endpoints");
 CHECK(liftProfile(0)==0&&liftProfile(1)==0&&fabsf(liftProfile(0.5f)-1)<1e-6f,"lift profile");
 for(float s=HIP_START;s<=HIP_END;s+=0.001f)CHECK(liftProfile(s)>=0.5f,"foot at least half up during hip swing");
 CHECK(liftProfile(HIP_END)>=0.74f&&liftProfile(LIFT_DOWN)>=0.999f,"foot still mostly up when the hip finishes");
 CHECK(HIP_END<=1.0f-0.0f&&HIP_END>LIFT_DOWN,"hip ends during lowering, before touchdown");

 GaitParams p;
 for(int tempo=0;tempo<2;++tempo){
  float cyc=tempo?p.sportMs:p.ecoMs;
  struct Case{const char* name;float f,t,s;} cases[]={{"forward",1,0,0},{"backward",-1,0,0},{"turn",0,1,0},{"crab left",0,0,-1},{"crab right",0,0,1},{"diagonal",0.7f,0.3f,0.5f}};
  for(auto& c:cases){
   Gait g;g.params=p;g.begin(cyc);
   Run r=run(g,20,30,c.f,c.t,c.s,6.0f);
   char m[96];
   snprintf(m,sizeof m,"%s %s: stops at ready",c.name,tempo?"sport":"eco");CHECK(!g.active,m);
   for(int l=0;l<6;++l){snprintf(m,sizeof m,"%s: final pose zero",c.name);CHECK(g.out[l].hip==0&&g.out[l].knee==0&&g.out[l].foot==0,m);}
   // Continuity: per-tick change bounded by the analytic peak speed (+10 % margin).
   float need=requiredSpeed(p,cyc)*1.10f*0.020f;
   snprintf(m,sizeof m,"%s %s: continuous (jumps %.1f %.1f %.1f, bound %.1f)",c.name,tempo?"sport":"eco",r.maxJump[0],r.maxJump[1],r.maxJump[2],need);
   CHECK(r.maxJump[0]<=need&&r.maxJump[1]<=need&&r.maxJump[2]<=need,m);
   snprintf(m,sizeof m,"%s: hip within stride/2",c.name);CHECK(r.maxHip<=p.stride*0.5f+0.01f,m);
   snprintf(m,sizeof m,"%s: no touchdown during hip swing",c.name);CHECK(!r.touchdownDuringHip,m);
   snprintf(m,sizeof m,"%s: planted feet stay down",c.name);CHECK(!r.stanceLift,m);
   printf("ok %-10s %-5s ticks=%4d jumps hip=%.2f knee=%.2f foot=%.2f (bound %.2f us/tick)\n",c.name,tempo?"sport":"eco",r.ticks,r.maxJump[0],r.maxJump[1],r.maxJump[2],need);
  }
 }
 // Support: at every instant at least 3 feet down, and each tripod alternates.
 {Gait g;g.params=p;g.begin(1200);g.setCommand(1,0,0);int minDown=6;
  for(int i=0;i<600;++i){g.step(20);int down=0;for(int l=0;l<6;++l)if(g.liftOf(l)==0)++down;if(down<minDown)minDown=down;
   bool a=g.liftOf(0)>0,b=g.liftOf(1)>0;CHECK(!(a&&b),"tripods never swing together");}
  CHECK(minDown>=3,"at least three feet down");}
 // Forward walking: stance hips move backward (toward -) at the expected speed.
 {Gait g;g.params=p;g.begin(2400);g.setCommand(1,0,0);for(int i=0;i<300;++i)g.step(20);
  bool sawBack=false;for(int i=0;i<120;++i){float h0=g.out[0].hip;bool st=g.liftOf(0)==0;g.step(20);if(st&&g.liftOf(0)==0&&g.out[0].hip<h0-0.5f)sawBack=true;CHECK(!(st&&g.liftOf(0)==0&&g.out[0].hip>h0+0.01f),"stance hip never moves forward when walking forward");}
  CHECK(sawBack,"stance hip sweeps backward");}
 // Turning: left and right stance strokes have opposite signs.
 {Gait g;g.params=p;g.begin(2400);g.setCommand(0,1,0);for(int i=0;i<400;++i)g.step(20);
  CHECK(g.stanceHip[0]*g.stanceHip[3]<0,"turn: left/right opposite");}
 // Joystick change mid-walk: planted legs keep their latched stroke (no jump).
 {Gait g;g.params=p;g.begin(1200);g.setCommand(1,0,0);for(int i=0;i<200;++i)g.step(20);
  Run r=run(g,20,10,-1,0,0,3);float need=requiredSpeed(p,1200)*1.1f*0.02f;CHECK(r.maxJump[0]<=need,"reversal stays continuous");CHECK(!g.active,"reversal then stop");}
 // Tempo change mid-walk is continuous.
 {Gait g;g.params=p;g.begin(2400);g.setCommand(1,0,0);for(int i=0;i<200;++i)g.step(20);g.targetCycleMs=1200;
  Run r=run(g,20,10,1,0,0,4);float need=requiredSpeed(p,1200)*1.1f*0.02f;CHECK(r.maxJump[0]<=need&&r.maxJump[1]<=need,"tempo change continuous");}
 // Coarse ticks (loop stall) still produce bounded output and stop.
 {Gait g;g.params=p;g.begin(1200);Run r=run(g,60,20,1,0,0,3);CHECK(!g.active,"stops with 60 ms ticks");(void)r;}
 // Required speed scales inversely with cycle time.
 CHECK(fabsf(requiredSpeed(p,1200)-2*requiredSpeed(p,2400))<1,"need scales with tempo");
 printf("need eco=%.0f sport=%.0f us/s\n",requiredSpeed(p,p.ecoMs),requiredSpeed(p,p.sportMs));
 CHECK(validParams(p),"defaults valid");GaitParams bad;bad.lift=0;CHECK(!validParams(bad),"bad params rejected");
 if(failures){printf("%d gait checks FAILED\n",failures);return 1;}
 printf("all gait tests passed\n");return 0;
}
