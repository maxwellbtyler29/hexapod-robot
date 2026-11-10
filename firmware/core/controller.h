#pragma once
#include "geometry.h"
#include <cstdint>

namespace control {
enum class Mode {Normal,Crabwalk,Roll,Climber,Library};
constexpr const char* modeNames[5]={"Normal","Crabwalk","Roll","Climber","Library"};
struct Command {
    uint32_t session=1,seq=1;
    int mode=0,leg=0,action=0,routine=0;
    double x=0,y=0,gain=.5,lift=0;
};
// Actions: 0 heartbeat/update, 1 enable, 2 stop, 3 confirm foot placement,
// 4 play routine, 5 cancel routine, 6 reset preview after a fault,
// 7 park, 8 wake/unfold/stretch. Neither action physically switches power.
struct Foot {
    Vec world,from,to; double u=0,ground=0;
    bool swing=false;
    hexapod::LegAngles angles{};
};
class Controller {
public:
    Pose body;
    std::array<Foot,6> feet;
    Command command;
    Mode mode=Mode::Normal,pending=Mode::Normal;
    bool enabled=false,transition=false,fault=false,manualFree=false,walking=false;
    bool sleeping=false,workspaceLimited=false;
    int selected=0,routine=-1,queuedRoutine=-1;
    Pose routineStartBody;
    std::array<Vec,6> routineStartFeet{};
    double vx=0,vy=0,wz=0,lastSeen=-100,now=0,halfClock=0,routineTime=0;
    uint32_t owner=0,lastSeq=0;
    bool nextB=true;
    const char* message="Ready. Enable preview to move.";
    static constexpr double halfPeriod=.85;
    Controller(){resetGeometry();}
    void resetGeometry(){
        body=Pose{};vx=vy=wz=0;walking=false;halfClock=0;nextB=true;manualFree=false;routine=-1;queuedRoutine=-1;sleeping=false;workspaceLimited=false;
        for(int i=0;i<6;++i){feet[i]=Foot{};feet[i].world=toWorld(neutralBody(i),body);feet[i].ground=feet[i].world.z;}
        solve();
    }
    bool grounded() const {for(const auto& f:feet)if(f.swing)return false;return true;}
    bool still() const{return std::abs(vx)+std::abs(vy)+std::abs(wz)<.001 && grounded();}
    static bool valid(const Command& c){
        return c.session!=0 && c.seq!=0 && c.mode>=0 && c.mode<5 && c.leg>=0 && c.leg<6
            && c.action>=0 && c.action<=8 && c.routine>=0 && c.routine<6
            && std::isfinite(c.x)&&std::isfinite(c.y)&&std::isfinite(c.gain)&&std::isfinite(c.lift)
            && std::abs(c.x)<=1 && std::abs(c.y)<=1 && c.gain>=.1 && c.gain<=1 && c.lift>=0 && c.lift<=35;
    }
    bool accept(const Command& c,double t){
        if(!valid(c)||!std::isfinite(t)||t<now)return false;
        if(owner && c.session!=owner && (enabled || !still() || t-lastSeen<1.0))return false;
        if(c.session==owner && c.seq<=lastSeq)return false;
        owner=c.session;lastSeq=c.seq;lastSeen=t;
        if(c.action==6){if(enabled||!still())return false;resetGeometry();fault=false;transition=false;mode=pending=Mode::Normal;message="Preview reset.";}
        if(c.action==2){enabled=false;routine=-1;queuedRoutine=-1;transition=false;message="Stopping; holding or finishing foot placement.";}
        const bool lifecycle=routine==3||routine==4||queuedRoutine==3||queuedRoutine==4;
        if(c.action==1){
            if(sleeping){message="Use Wake to unfold before enabling movement.";return false;}
            if(fault||!still()||std::hypot(c.x,c.y)>.1){message="Center joystick and wait for stop before enabling.";return false;}
            enabled=true;message="Enabled in simulation. Servo output disabled.";
        }
        if(static_cast<Mode>(c.mode)!=mode && routine>=0 && !lifecycle && c.action!=2 && c.action!=5){message="Finish or cancel the current preset first.";return false;}
        if(static_cast<Mode>(c.mode)!=mode && !lifecycle && c.action!=7 && c.action!=8){
            if(mode==Mode::Climber && manualFree){message="Confirm the selected foot placement before changing modes.";return false;}
            pending=static_cast<Mode>(c.mode);transition=true;routine=-1;
        }
        if(mode==Mode::Climber && c.leg!=selected){
            if(manualFree){message="Place the current foot before selecting another.";return false;}
            selected=c.leg;
        }
        if(c.action==3 && mode==Mode::Climber && enabled){
            feet[selected].ground=feet[selected].world.z;manualFree=false;message="Foot placement confirmed at its current height.";
        }
        if(c.action==4 && mode==Mode::Library && enabled && !transition && c.routine!=3 && c.routine!=4){beginRoutine(c.routine);}
        if(c.action==7 || c.action==8 || (c.action==4 && (c.routine==3||c.routine==4))){
            if(fault||manualFree||std::hypot(c.x,c.y)>.1){message="Place any lifted leg and center controls before park/wake.";return false;}
            const bool wake=c.action==8||(c.action==4&&c.routine==4);
            if(!wake&&!enabled)return false;
            enabled=true;queuedRoutine=wake?4:3;pending=Mode::Library;transition=true;
            message=wake?"Preparing to unfold and stretch.":"Settling before compact park pose.";
        }
        if(c.action==5 && enabled){routine=-1;queuedRoutine=4;pending=Mode::Library;transition=true;message="Routine cancelled; recovering through the wake sequence.";}
        command=c;
        // Place uses the CURRENT foot location; subsequent heartbeats start from zero lift.
        if(c.action==3)command.lift=0;
        return true;
    }
    void beginRoutine(int id){
        routine=id;routineTime=0;routineStartBody=body;
        for(int i=0;i<6;++i)routineStartFeet[i]=feet[i].world;
        message="Running preset.";
    }
    bool solve(){
        std::array<hexapod::LegAngles,6> next{};
        for(int i=0;i<6;++i)if(!ik(targetLocal(i,feet[i].world,body),next[i]))return false;
        for(int i=0;i<6;++i)feet[i].angles=next[i];
        return true;
    }
    void beginSwing(bool b){
        Pose future=body;
        // Predict a neutral foothold half a stance beyond the upcoming touchdown.
        const double lead=halfPeriod*1.5;
        Pose mid=body;mid.yaw+=wz*lead*.5;
        future.p=future.p+rotate({vx*lead,vy*lead,0},mid);future.yaw+=wz*lead;
        for(int i=0;i<6;++i)if(groupB[i]==b){
            auto& f=feet[i];f.swing=true;f.u=0;f.from=f.world;
            f.to=toWorld(neutralBody(i),future);f.to.z=f.ground;
        }
    }
    void tick(double dt,double t){
        if(!std::isfinite(dt)||dt<=0||!std::isfinite(t)||t<now)return;
        if(dt>.1){enabled=false;routine=-1;queuedRoutine=-1;transition=false;message="Control timing gap; stopped.";dt=.02;}
        now=t;
        if(enabled && now-lastSeen>.6){enabled=false;routine=-1;queuedRoutine=-1;transition=false;message="Command timeout; re-enable after reconnecting.";}
        const auto oldBody=body;const auto oldFeet=feet;
        double x=0,y=0;
        if(enabled&&!fault&&!transition){
            const double r=std::hypot(command.x,command.y);
            if(r>.1){const double strength=(std::min(r,1.0)-.1)/.9;x=command.x/r*strength;y=command.y/r*strength;}
        }
        double tx=0,ty=0,tw=0;
        if(mode==Mode::Normal){tx=y*35*command.gain;tw=-x*.22*command.gain;}
        if(mode==Mode::Crabwalk){tx=y*35*command.gain;ty=-x*35*command.gain;}
        vx=approach(vx,tx,25*dt);vy=approach(vy,ty,25*dt);wz=approach(wz,tw,.25*dt);
        const bool wantsWalk=std::abs(tx)+std::abs(ty)+std::abs(tw)>.001;
        if((mode==Mode::Normal||mode==Mode::Crabwalk)&&!fault){
            Pose mid=body;mid.yaw+=wz*dt*.5;
            body.p=body.p+rotate({vx*dt,vy*dt,0},mid);body.yaw+=wz*dt;
            if(!walking && wantsWalk){walking=true;halfClock=0;nextB=true;beginSwing(nextB);nextB=!nextB;}
            if(walking){
                halfClock+=dt;
                for(auto& f:feet)if(f.swing){
                    f.u=std::min(1.0,f.u+dt/halfPeriod);
                    f.world=mix(f.from,f.to,smooth(f.u));
                    f.world.z+=10*16*f.u*f.u*(1-f.u)*(1-f.u);
                    if(f.u>=1){f.swing=false;f.world=f.to;}
                }
                if(halfClock>=halfPeriod && grounded()){
                    halfClock=0;
                    if(wantsWalk){beginSwing(nextB);nextB=!nextB;}else walking=false;
                }
            }
        }
        double roll=0,pitch=0,height=120;
        if(sleeping||queuedRoutine>=3||(mode==Mode::Library&&routine<0))height=body.p.z;
        if(mode==Mode::Roll && enabled&&!transition){roll=-x*hexapod::radians(15);pitch=y*hexapod::radians(15);}
        if(mode==Mode::Library && routine>=0 && enabled&&!transition){
            routineTime+=dt;const double duration=routine==4?8:(routine==3?6:5);
            const double u=clamp(routineTime/duration,0,1);
            const double bump=smooth(u<.5?2*u:2*(1-u));
            if(routine==0)pitch=hexapod::radians(8)*bump;
            if(routine==1)roll=hexapod::radians(8)*std::sin(2*pi*u)*bump;
            if(routine==2)height=120-12*bump;
            if(routine==3){
                height=routineStartBody.p.z+(55-routineStartBody.p.z)*smooth(std::min(1.0,u*2));
                const double tuck=smooth((u-.5)*2);
                Pose final=body;final.p.z=55;final.roll=final.pitch=0;
                for(int i=0;i<6;++i){
                    const Vec tucked=toWorld(shoulder(i)+localVectorToBody(i,{130,0,-55}),final);
                    feet[i].world=mix(routineStartFeet[i],tucked,tuck);
                }
            }
            if(routine==4){
                const double unfold=smooth(u*3);
                const double rise=smooth((u-1.0/3)*3);
                height=routineStartBody.p.z+(120-routineStartBody.p.z)*rise;
                Pose final=routineStartBody;final.p.z=120;final.roll=final.pitch=0;
                for(int i=0;i<6;++i)feet[i].world=mix(routineStartFeet[i],toWorld(neutralBody(i),final),unfold);
                const double stretch=clamp((u-2.0/3)*3,0,1);
                const double envelope=std::pow(std::sin(pi*stretch),2);
                roll=hexapod::radians(7)*std::sin(4*pi*stretch)*envelope;
                pitch=hexapod::radians(7)*envelope;
            }
            if(routine==5){
                // Visual jab: front feet lift, extend, retract, and lower.
                const double liftPhase=u<.25?smooth(u*4):(u>.75?smooth((1-u)*4):1);
                const double jab=u<.5?smooth((u-.25)*4):smooth((.75-u)*4);
                const Vec delta=rotate({40*jab,0,35*liftPhase},routineStartBody);
                feet[0].world=routineStartFeet[0]+delta;feet[3].world=routineStartFeet[3]+delta;
            }
            if(routineTime>=duration){
                const int finished=routine;routine=-1;
                if(finished==3){sleeping=true;enabled=false;message="Parked. This does not cut power; physical pose is unverified.";}
                else if(finished==4){sleeping=false;mode=pending=Mode::Normal;command.mode=0;message="Awake and stretched. Ready.";}
                else message="Preset complete.";
                for(auto& f:feet)f.ground=f.world.z;
            }
        }
        body.roll=approach(body.roll,roll,.12*dt);body.pitch=approach(body.pitch,pitch,.12*dt);body.p.z=approach(body.p.z,height,15*dt);
        if(mode==Mode::Climber && enabled&&!transition){
            auto& f=feet[selected];
            if(std::abs(x)+std::abs(y)>.001 || std::abs(f.world.z-(f.ground+command.lift))>.05)manualFree=true;
            if(manualFree){
                const Vec delta=rotate({y*12*dt,-x*12*dt,0},body);
                f.world.x+=delta.x;f.world.y+=delta.y;
                f.world.z=approach(f.world.z,f.ground+command.lift,15*dt);
            }
        }
        workspaceLimited=false;
        if(!solve()){
            body=oldBody;feet=oldFeet;
            if(mode==Mode::Roll){workspaceLimited=true;message="Roll limited by geometric reach at this stance.";}
            else{vx=vy=wz=0;enabled=false;fault=true;walking=false;routine=-1;queuedRoutine=-1;
                for(auto& f:feet)f.swing=false;
                message="Target exceeded geometric reach. Last valid pose held; reset preview.";}
        }
        if(transition && still() && std::abs(body.roll)+std::abs(body.pitch)<.001 && (queuedRoutine>=3||std::abs(body.p.z-120)<.01)){
            mode=pending;transition=false;command.x=command.y=0;command.lift=0;manualFree=false;
            message="Mode ready.";
            if(queuedRoutine>=0){const int next=queuedRoutine;queuedRoutine=-1;beginRoutine(next);}
        }
    }
};
} // namespace control
