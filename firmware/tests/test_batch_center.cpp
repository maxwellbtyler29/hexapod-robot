#ifdef NDEBUG
#undef NDEBUG
#endif
#include <cassert>
#include <iostream>
#include "../src/batch_center.cpp"
int main(){setup();assert(ready&&!active);for(auto w:pca.writes)assert(w.off==4096);
execute("CENTER");assert(!active);execute("CENTER5");assert(!active);execute("CENTER6");loop();assert(centered==1);
for(int i=2;i<=6;++i){fakeMillis+=500;loop();assert(centered==i);}
for(auto w:pca.writes)if(w.off!=4096)assert(w.ch<6&&w.off==307);
auto count=pca.writes.size();execute("CENTER6");loop();assert(pca.writes.size()==count);
fakeMillis=started+120000;loop();assert(!active);
execute("CENTER6");Serial.feed("OFF\n");loop();assert(!active&&centered==0);
Serial.feed(std::string(30,'X')+"CENTER6\n");loop();loop();assert(!active);
execute("CENTER6");pca.failChannel=0;loop();assert(!ready&&!active);
std::cout<<"PASS: boot off, six sequential channels, timeout, OFF, parser and fault latch\n";
}