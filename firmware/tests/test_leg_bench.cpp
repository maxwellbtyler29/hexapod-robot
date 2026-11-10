// Executes the actual firmware with simulated serial, time and PCA writes.
#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <iostream>
#include "../src/leg_bench.cpp"

void tick(unsigned ms) { fakeMillis += ms; loop(); }
void settle() { for(int n=0;n<30;++n) tick(20); }
void feed(const std::string& value) {
  Serial.feed(value);
  while(Serial.available()) loop();
}
int main() {
  setup();
  assert(ready && !active);
  for(auto w:pca.writes) assert(w.off==4096); // No boot motion.
  auto count=pca.writes.size();
  execute("KNEE_LOW");
  assert(pca.writes.size()==count && !active);
  feed(std::string(60,'X')+"CENTER\n"); // Overlong suffix must not execute.
  feed(std::string("CEN\0TER\n",8));
  assert(!active);
  execute("CENTER");
  assert(active);
  for(int ch=0;ch<3;++ch) assert(currentUs[ch]==1500);
  for(int joint=0;joint<3;++joint) {
    const char* low[]={"HIP_LOW","KNEE_LOW","FOOT_LOW"};
    const char* high[]={"HIP_HIGH","KNEE_HIGH","FOOT_HIGH"};
    execute(low[joint]);
    tick(20);
    assert(currentUs[joint]==1498); // Rate-limited, not an immediate jump.
    settle();
    assert(currentUs[joint]==1475);
    for(int ch=0;ch<3;++ch) if(ch!=joint) assert(currentUs[ch]==1500);
    execute(high[(joint+1)%3]); // Different joint cannot start off-center.
    assert(targetUs[joint]==1475);
    assert(targetUs[(joint+1)%3]==1500);
    execute(high[joint]); settle();
    assert(currentUs[joint]==1525);
    execute("CENTER"); settle();
    for(int ch=0;ch<3;++ch) assert(currentUs[ch]==1500);
  }
  execute("HIP_1400"); settle();
  assert(currentUs[0]==1440); // 30 ticks at 2 us per 20 ms.
  settle(); assert(currentUs[0]==1400);
  for(int ch:{1,2}) assert(currentUs[ch]==1500);
  execute("CENTER"); settle(); settle(); assert(currentUs[0]==1500);
  execute("HIP_1600"); settle(); settle();
  assert(currentUs[0]==1600);
  for(int ch:{1,2}) assert(currentUs[ch]==1500);
  execute("CENTER"); settle(); settle(); assert(currentUs[0]==1500);
  execute("STEP_RATE 4"); assert(presetRate==5);
  execute("STEP_RATE 101"); assert(presetRate==5);
  execute("STEP_RATE 100 EXTRA"); assert(presetRate==5);
  execute("STEP_RATE 100"); assert(presetRate==100);
  execute("STEP_LIFT"); tick(20); assert(currentUs[1]==1600);
  execute("STEP_RATE 5"); assert(presetRate==100); // Cannot change mid-motion.
  execute("OFF"); assert(presetRate==5); execute("CENTER");
  // STATUS does not extend the five-second timeout.
  execute("STEP_FORWARD"); // Cannot skip lift.
  assert(targetUs[0]==1500 && targetUs[1]==1500);
  execute("STEP_LIFT"); tick(20);
  assert(currentUs[1]==1505 && currentUs[2]==1495);
  execute("STEP_FORWARD"); // Cannot advance mid-ramp.
  assert(targetUs[0]==1500);
  for(int n=0;n<110;++n) tick(20);
  assert(currentUs[0]==1500 && currentUs[1]==2000 && currentUs[2]==1238);
  execute("STEP_FORWARD");
  for(int n=0;n<110;++n) tick(20);
  assert(currentUs[0]==1650 && currentUs[1]==2000 && currentUs[2]==1238);
  execute("STEP_LOWER");
  for(int n=0;n<110;++n) tick(20);
  assert(currentUs[0]==1650 && currentUs[1]==1850 && currentUs[2]==1238);
  execute("STEP_RETURN"); for(int n=0;n<40;++n) tick(20);
  assert(currentUs[0]==1500 && currentUs[1]==1850 && currentUs[2]==1238);
  for(int cycle=0;cycle<3;++cycle) {
    for(const char* cmd:{"STEP_LIFT","STEP_FORWARD","STEP_LOWER","STEP_RETURN"}) {
      execute(cmd); for(int n=0;n<40;++n) tick(20);
      assert(active && currentUs[2]==1238);
    }
  }
  execute("CENTER");
  for(int n=0;n<110;++n) tick(20);
  assert(currentUs[0]==1500 && currentUs[1]==1500 && currentUs[2]==1500);
  execute("STEP_LIFT"); tick(20); execute("OFF");
  count=pca.writes.size(); execute("STEP_FORWARD");
  assert(!active && pca.writes.size()==count);
  execute("CENTER"); execute("STEP_LIFT");
  fakeMillis=lastCommand+4999; execute("STATUS");
  tick(1); assert(!active);
  // Timeouts remain valid over the millis() rollover.
  fakeMillis=0xfffffff0U; execute("CENTER"); tick(5000);
  assert(!active);
  // Failure halfway through centering must turn everything off and latch fault.
  execute("J 1600 1400 1520 20"); assert(!active); // Cannot arm live from OFF.
  execute("CENTER");
  execute("J 1600 1400 1520 20"); tick(20);
  assert(liveMode && currentUs[0]==1520 && currentUs[1]==1480 && currentUs[2]==1520);
  const auto lastValid=lastCommand;
  execute("J 2001 1400 1520 20"); assert(targetUs[0]==1600 && lastCommand==lastValid);
  execute("J 1600 1400 1520 101"); assert(rampUs==20 && lastCommand==lastValid);
  execute("J 1600 1400 1520 20 EXTRA"); assert(lastCommand==lastValid);
  execute("STEP_LIFT"); assert(targetUs[0]==1600);
  execute("J 1520 1480 1520 1"); tick(20);
  assert(currentUs[0]==1520 && currentUs[1]==1480); // Hold.
  fakeMillis=lastCommand+600; loop(); assert(!active && !liveMode);
  execute("CENTER"); execute("J 1600 1400 1520 20"); execute("CENTER");
  assert(!liveMode && rampUs==5);
  execute("J 1500 1750 1250 100"); for(int n=0;n<5;++n) tick(20);
  assert(currentUs[1]==1750 && currentUs[2]==1250);
  execute("J 1500 2001 1250 100"); assert(targetUs[1]==1750);
  execute("J 1500 1750 999 100"); assert(targetUs[2]==1250);
  execute("OFF");
  pca.failChannel=1;
  execute("CENTER"); assert(!ready && !active);
  count=pca.writes.size(); execute("CENTER");
  assert(pca.writes.size()==count);
  // Every enabled write stayed within the intended three channels and pulse ranges.
  for(auto w:pca.writes) if(w.off!=4096) {
    assert(w.ch<3 && w.on==0);
    if(w.ch==0) assert(w.off>=205 && w.off<=410);
    if(w.ch==1) assert(w.off>=205 && w.off<=410);
    if(w.ch==2) assert(w.off>=205 && w.off<=410);
  }
  std::cout<<"PASS: startup off, parser, channel mapping, pulse bounds, ramps, joint interlock, timeout/rollover, fault latch\n";
}
