#pragma once
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <string>
#include <deque>
inline uint32_t fakeMillis=0;
inline uint32_t millis(){return fakeMillis;}
inline void delay(uint32_t ms){fakeMillis+=ms;}
struct SerialMock{
 std::string out;std::deque<char> in;
 void begin(long){}
 template<class... T> void printf(const char* f,T... a){char b[1024];snprintf(b,sizeof(b),f,a...);out+=b;}
 void println(const char* s){out+=s;out+="\n";}
 int available(){return int(in.size());}
 int read(){if(in.empty())return -1;char c=in.front();in.pop_front();return c;}
 void feed(const char* s){while(*s)in.push_back(*s++);}
};
inline SerialMock Serial;
