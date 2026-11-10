#pragma once
#include <cstdint>
#include <cstring>
#include <string>
#include <deque>
inline uint32_t fakeMillis = 0;
inline uint32_t millis() { return fakeMillis; }
inline void delay(unsigned ms) { fakeMillis += ms; }
struct SerialMock {
  std::deque<char> input;
  void begin(unsigned) {}
  void println(const char *) {}
  template<class... T> void printf(const char *, T...) {}
  int available() { return int(input.size()); }
  int read() { char c=input.front(); input.pop_front(); return c; }
  void feed(const std::string& text) { for(char c:text) input.push_back(c); }
};
inline SerialMock Serial;
