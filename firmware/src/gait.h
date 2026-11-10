#pragma once
// Continuous, time-based tripod gait generator for the P3DRO hexapod.
// Pure C++ (no Arduino dependencies) so it can be unit tested natively.
//
// Logical joint axes (before per-joint invert/calibration):
//   hip  +  = foot swings toward the head (forward)
//   knee +  = foot lifts up
//   foot +  = foot tucks inward / curls under
// Pulse = saved ready pulse + direction(+1/-1) * logical offset.
//
// Each leg runs a local phase psi in [0,1): stance for psi < DUTY, swing after.
// Tripod A = legs 0,2,4 (LF, LR, RM); tripod B = legs 1,3,5 (LM, RF, RR), offset
// by half a cycle. DUTY > 0.5 gives a short six-feet-down overlap at each
// hand-over, so the body is always supported.
//
// Swing: the foot lifts first, the hip only starts moving once the foot is
// already half-way up, the hip finishes its move, and only then the foot comes
// down (touchdown happens after the hip swing has completed).
// Stance: the hip sweeps back at constant speed, with short velocity ramps at
// both ends that line up with the overlap windows (no stop-start).
// Stroke amplitudes are latched per leg at touchdown, so joystick changes never
// cause a jump of a planted foot; a swinging leg aims at the live command.
#include <stdint.h>
#include <math.h>

namespace hx {

constexpr int LEGS=6;
constexpr float DUTY=0.56f;          // stance fraction of the cycle
constexpr float RAMP=0.06f;          // stance speed ramp (cycle fraction) at each end
constexpr float LIFT_UP=0.30f;       // swing fraction used to raise the foot
constexpr float LIFT_DOWN=0.70f;     // swing fraction where lowering starts
constexpr float HIP_START=0.15f;     // swing fraction where the hip starts moving
constexpr float HIP_END=0.80f;       // swing fraction where the hip has finished (foot still >= 75 % up)
constexpr float PI_F=3.14159265f;

struct GaitParams {
  uint16_t stride=150;   // hip sweep, peak-to-peak, us
  uint16_t lift=140;     // knee lift during swing, us
  uint16_t tuck=40;      // foot tuck during swing, us (0 = foot stays put)
  uint16_t reach=120;    // crab: foot sweep peak-to-peak, us
  uint16_t mix=50;       // crab: knee follows foot sweep by mix % (keeps height)
  uint16_t ecoMs=2400;   // Eco cycle time
  uint16_t sportMs=1200; // Sport cycle time
  uint16_t park=220;     // knee raise used to sit the body down, us
};

inline bool validParams(const GaitParams& p){
  return p.stride<=600&&p.lift>=20&&p.lift<=600&&p.tuck<=400&&p.reach<=600&&p.mix<=150&&
         p.ecoMs>=600&&p.ecoMs<=6000&&p.sportMs>=600&&p.sportMs<=6000&&p.park<=600;
}

inline bool tripodA(int leg){return leg==0||leg==2||leg==4;}
inline bool leftSide(int leg){return leg<3;}
inline float clampf(float x,float a,float b){return x<a?a:(x>b?b:x);}
inline float minJerk(float u){u=clampf(u,0,1);return u*u*u*(10+u*(-15+6*u));}
// Normalised trapezoidal-velocity position 0..1 over u in 0..1 with ramp r at both ends.
inline float trapezoid(float u,float r){
  u=clampf(u,0,1);if(r<=0)return u;
  const float v=1.0f/(1.0f-r);             // cruise speed (area = 1)
  if(u<r)return v*u*u/(2*r);
  if(u>1-r){float w=1-u;return 1-v*w*w/(2*r);}
  return v*r/2+v*(u-r);
}
// Raised-cosine lift profile over the swing fraction s (0 at liftoff and touchdown).
inline float liftProfile(float s){
  if(s<=0||s>=1)return 0;
  if(s<LIFT_UP)return 0.5f*(1-cosf(PI_F*s/LIFT_UP));
  if(s>LIFT_DOWN)return 0.5f*(1+cosf(PI_F*(s-LIFT_DOWN)/(1-LIFT_DOWN)));
  return 1;
}
// Stance stroke position: +1 at touchdown (psi=0) to -1 at liftoff (psi=DUTY).
inline float stanceStroke(float psi){return 1-2*trapezoid(psi/DUTY,RAMP/DUTY);}

// Peak joint speed (us/s) the trajectory needs for the given params and cycle.
inline float requiredSpeed(const GaitParams& p,float cycleMs){
  const float tsw=(1-DUTY)*cycleMs/1000.0f;
  const float hipT=(HIP_END-HIP_START)*tsw,upT=LIFT_UP*tsw;
  const float hip=1.875f*p.stride/hipT;
  const float lift=(PI_F/2)*p.lift/upT;
  const float sweep=1.875f*p.reach/hipT;
  const float knee=lift+sweep*p.mix/100.0f;
  const float foot=(PI_F/2)*p.tuck/upT+sweep;
  float m=hip;if(knee>m)m=knee;if(foot>m)m=foot;return m;
}

struct LegOffsets {float hip,knee,foot;};

struct Gait {
  GaitParams params;
  bool active=false;        // generator running (legs stepping)
  float phase=0;            // global cycle phase 0..1
  float cycleMs=2400,targetCycleMs=2400;
  float cmd[3]={0,0,0};     // requested forward, turn, side (-1..1)
  float drive[3]={0,0,0};   // smoothed command
  float cycles=0;           // completed cycles (fractional)
  bool swing[LEGS]={};      // leg currently in swing
  float stanceHip[LEGS]={},stanceReach[LEGS]={};   // amplitudes latched at touchdown
  float liftHip[LEGS]={},liftReach[LEGS]={};       // positions latched at liftoff
  LegOffsets out[LEGS]={};

  void begin(float cycle){
    active=true;phase=0;cycles=0;cycleMs=targetCycleMs=cycle;
    for(int i=0;i<3;++i)drive[i]=0;
    for(int l=0;l<LEGS;++l){swing[l]=false;stanceHip[l]=stanceReach[l]=liftHip[l]=liftReach[l]=0;out[l]={0,0,0};}
  }
  void setCommand(float f,float t,float s){cmd[0]=clampf(f,-1,1);cmd[1]=clampf(t,-1,1);cmd[2]=clampf(s,-1,1);}
  bool commandZero()const{return cmd[0]==0&&cmd[1]==0&&cmd[2]==0;}
  // Live stroke amplitude targets for one leg (us, signed), from the smoothed drive.
  void amplitudes(int leg,float& hipAmp,float& reachAmp)const{
    float f=drive[0],t=drive[1];
    float a=leftSide(leg)?f+t:f-t;
    float n=fabsf(f)+fabsf(t);if(n>1)a/=n;
    hipAmp=a*params.stride*0.5f;
    reachAmp=drive[2]*(leftSide(leg)?-1.0f:1.0f)*params.reach*0.5f;
  }
  bool settledAtReady()const{
    for(int l=0;l<LEGS;++l){if(swing[l])return false;if(fabsf(stanceHip[l])>0.01f||fabsf(stanceReach[l])>0.01f)return false;}
    for(int i=0;i<3;++i)if(drive[i]!=0)return false;
    return true;
  }
  // Advance by dt milliseconds. Returns false once the gait has come to rest
  // (command zero, every foot down at the ready pose).
  bool step(float dtMs){
    if(!active)return false;
    // Smooth command changes (full range in ~0.5 s) and cycle time changes.
    const float maxDelta=dtMs/500.0f;
    for(int i=0;i<3;++i){float d=cmd[i]-drive[i];if(d>maxDelta)d=maxDelta;if(d<-maxDelta)d=-maxDelta;drive[i]+=d;if(fabsf(drive[i])<1e-4f&&cmd[i]==0)drive[i]=0;}
    {float d=targetCycleMs-cycleMs,m=cycleMs*dtMs/600.0f;if(d>m)d=m;if(d<-m)d=-m;cycleMs+=d;}
    if(commandZero()&&settledAtReady()){
      // All six feet planted with zero stroke; stop only inside a both-tripods-down window.
      active=false;for(int l=0;l<LEGS;++l)out[l]={0,0,0};return false;
    }
    const float dPhase=dtMs/cycleMs;
    phase+=dPhase;cycles+=dPhase;if(phase>=1)phase-=1;
    for(int l=0;l<LEGS;++l){
      float psi=phase+(tripodA(l)?0.0f:0.5f);if(psi>=1)psi-=1;
      float hipAmp,reachAmp;amplitudes(l,hipAmp,reachAmp);
      const bool inSwing=psi>=DUTY;
      if(inSwing&&!swing[l]){liftHip[l]=out[l].hip;liftReach[l]=reachPos(l);swing[l]=true;}
      else if(!inSwing&&swing[l]){stanceHip[l]=hipAmp;stanceReach[l]=reachAmp;swing[l]=false;}
      float hip,reach,lift=0;
      if(!inSwing){
        float sigma=stanceStroke(psi);
        hip=sigma*stanceHip[l];reach=sigma*stanceReach[l];
      }else{
        float s=(psi-DUTY)/(1-DUTY);
        float u=minJerk((s-HIP_START)/(HIP_END-HIP_START));
        hip=liftHip[l]+(hipAmp-liftHip[l])*u;
        reach=liftReach[l]+(reachAmp-liftReach[l])*u;
        lift=liftProfile(s);
      }
      setReach(l,reach);
      out[l].hip=hip;
      out[l].knee=lift*params.lift+reach*params.mix/100.0f;
      out[l].foot=lift*params.tuck-reach;
      lastReach[l]=reach;
    }
    return true;
  }
  float lastReach[LEGS]={};
  float reachPos(int l)const{return lastReach[l];}
  void setReach(int l,float r){lastReach[l]=r;}
  float liftOf(int l)const{ // 0..1 lift fraction for tests/telemetry
    float psi=phase+(tripodA(l)?0.0f:0.5f);if(psi>=1)psi-=1;
    return psi<DUTY?0:liftProfile((psi-DUTY)/(1-DUTY));
  }
};

} // namespace hx
