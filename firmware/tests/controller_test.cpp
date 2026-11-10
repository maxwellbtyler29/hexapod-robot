#include "../core/telemetry.h"
#include "../core/servo_calibration.h"
#include <cstdio>
#include <initializer_list>
#include <limits>
using namespace control;
int checks=0,failures=0;
void check(bool ok,const char* label){++checks;if(!ok){++failures;std::fprintf(stderr,"FAIL %s\n",label);}}
double distance(Vec a,Vec b){Vec d=a-b;return std::sqrt(d.x*d.x+d.y*d.y+d.z*d.z);}
void run(Controller& r,Command& c,double seconds){
    const int n=int(seconds/.02+.5);
    for(int i=0;i<n;++i){
        if(i%5==0){c.seq++;check(r.accept(c,r.now),"heartbeat accepted");c.action=0;}
        r.tick(.02,r.now+.02);
        if(r.fault){check(false,"unexpected geometric fault");return;}
        for(int j=0;j<6;++j)check(distance(links(j,r.feet[j].angles,r.body)[3],r.feet[j].world)<1e-7,"FK matches world target");
    }
}
void enable(Controller& r,Command& c){c.action=1;c.seq++;check(r.accept(c,r.now),"enable");c.action=0;}
int main(){
    {Controller r;check(!r.enabled,"boot disabled");Command c;c.x=1;c.action=1;check(!r.accept(c,0),"enable requires centered stick");}
    for(int mode:{0,1}){
        Controller r;Command c;enable(r,c);c.mode=mode;run(r,c,.4);
        c.y=.8;c.x=mode? .5:.3;const double yaw=r.body.yaw;run(r,c,10);
        check(distance(r.body.p,{0,0,120})>20,"walk advances body");
        if(mode==1)check(std::abs(r.body.yaw-yaw)<1e-10,"crab holds commanded yaw");
        else check(std::abs(r.body.yaw)> .01,"normal turns");
        c.x=c.y=0;run(r,c,3);check(r.still(),"release settles gait");
        c.action=2;run(r,c,.1);check(!r.enabled,"stop disables command motion");
    }
    {Controller r;Command c;enable(r,c);c.mode=2;run(r,c,.3);const auto feet=r.feet;
        c.x=.7;c.y=.7;run(r,c,3);check(std::abs(r.body.roll)>.03&&std::abs(r.body.pitch)>.03,"roll mode tilts body");
        for(int i=0;i<6;++i)check(distance(feet[i].world,r.feet[i].world)<1e-10,"roll anchors feet");
        c.x=c.y=0;run(r,c,2);check(std::abs(r.body.roll)+std::abs(r.body.pitch)<1e-8,"roll release levels");}
    {Controller r;Command c;enable(r,c);c.mode=3;run(r,c,.3);const auto feet=r.feet;
        c.lift=20;c.y=.6;run(r,c,1.5);check(r.manualFree&&r.feet[0].world.z>19,"climber lifts selected foot");
        for(int i=1;i<6;++i)check(distance(feet[i].world,r.feet[i].world)<1e-10,"other climber feet hold");
        c.x=c.y=0;const auto held=r.feet[0].world;run(r,c,.4);check(distance(held,r.feet[0].world)<1e-9,"climber release holds");
        Command other=c;other.leg=1;other.seq++;check(!r.accept(other,r.now),"reject leg change before place");c.seq=other.seq;
        c.action=3;c.seq++;check(r.accept(c,r.now),"place foot");c.action=0;c.lift=0;
        c.leg=1;run(r,c,.3);check(r.selected==1,"select another placed leg");}
    for(int routine:{0,1,2}){Controller r;Command c;enable(r,c);c.mode=4;run(r,c,.4);
        const auto feet=r.feet;c.routine=routine;c.action=4;run(r,c,2);
        check(std::abs(r.body.roll)+std::abs(r.body.pitch)+std::abs(r.body.p.z-120)>.01,"preset moves body");
        run(r,c,4);check(r.routine==-1,"preset completes");
        for(int i=0;i<6;++i)check(distance(feet[i].world,r.feet[i].world)<1e-9,"preset anchors feet");}
    {Controller r;Command c;enable(r,c);c.y=1;run(r,c,1);
        for(int i=0;i<200;++i)r.tick(.02,r.now+.02);
        check(!r.enabled&&r.still(),"watchdog stops and settles");
        c.seq++;c.x=c.y=0;check(r.accept(c,r.now)&&!r.enabled,"reconnect never auto-enables");
        check(!r.accept(c,r.now),"duplicate sequence rejected");
        Command b=c;b.session=9;b.seq=1;b.action=1;check(!r.accept(b,r.now),"another tab cannot take fresh lease");
        c.seq++;c.x=std::numeric_limits<double>::quiet_NaN();check(!r.accept(c,r.now),"NaN command rejected");}
    {Controller r;Command c;enable(r,c);c.y=1;run(r,c,2);c.mode=2;c.x=c.y=0;run(r,c,3);
        check(r.mode==Mode::Roll&&!r.transition&&r.still(),"mode change finishes walking first");}
    {Controller r;Command c;enable(r,c);c.mode=4;c.action=7;run(r,c,7);
        check(r.sleeping&&!r.enabled&&r.body.p.z<56,"park curls and disables motion");
        c.mode=0;c.action=8;run(r,c,10);
        check(!r.sleeping&&r.enabled&&r.mode==Mode::Normal&&std::abs(r.body.p.z-120)<.01,"wake unfolds stands and returns normal");}
    {Controller r;Command c;enable(r,c);c.mode=4;run(r,c,.3);const auto before=r.feet;
        c.routine=5;c.action=4;run(r,c,2);
        check(r.feet[0].world.z>30&&r.feet[3].world.z>30,"jab lifts both front legs");
        for(int i:{1,2,4,5})check(distance(before[i].world,r.feet[i].world)<1e-9,"jab leaves other feet planted");
        run(r,c,4);for(int i=0;i<6;++i)check(distance(before[i].world,r.feet[i].world)<1e-8,"jab returns feet");}
    for(int mode:{0,1}){Controller r;Command c;enable(r,c);c.mode=mode;c.gain=1;run(r,c,.3);c.y=1;run(r,c,12);
        check(!r.fault&&r.vx>34,"faster full-speed preview");}
    {Controller r;Command c;enable(r,c);c.mode=2;run(r,c,.3);c.x=1;run(r,c,4);
        check(!r.fault&&std::abs(r.body.roll)>hexapod::radians(10),"aggressive roll remains reachable");}
    {Controller r;Command c;c.action=8;check(r.accept(c,0),"queue wake");
        r.tick(.2,.2);check(!r.enabled&&r.routine==-1&&r.queuedRoutine==-1&&!r.transition,"timing gap cancels queued wake");}
    for(double x:{-1.0,0.0,1.0})for(double y:{-1.0,0.0,1.0}){
        Controller r;Command c;enable(r,c);c.mode=2;run(r,c,.3);const auto planted=r.feet;
        c.x=x;c.y=y;run(r,c,4);check(!r.fault,"all roll directions remain controlled");
        for(int i=0;i<6;++i)check(distance(planted[i].world,r.feet[i].world)<1e-9,"roll direction keeps feet planted");}
    {Controller r;Command c;enable(r,c);c.gain=1;c.x=1;run(r,c,15);check(!r.fault&&r.body.yaw<-2,"pure turning at full speed");}
    {Controller r;auto map=uncalibratedMap();std::array<double,18> pulses{};
        check(!posePulses(r,map,pulses),"uncalibrated hardware output rejected");
        ServoCalibration cal;cal.calibrated=true;cal.usPerRad=500;cal.minRad=-1;cal.maxRad=1;double pulse=0;
        check(pulseFor(.5,cal,pulse)&&std::abs(pulse-1750)<1e-9,"calibrated pulse conversion");
        check(!pulseFor(2,cal,pulse),"physical angle limit rejection");}
    std::printf("%d checks; %d failures\n",checks,failures);return failures?1:0;
}
