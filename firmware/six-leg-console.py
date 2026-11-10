"""USB serial terminal for six_leg_setup firmware v6.

Nothing moves on connect and NOTHING is written to calibration on connect
(the old console pushed CFG limits from a JSON file, which narrowed limits).

  python six-leg-console.py --port COM4            interactive terminal
  python six-leg-console.py --port COM4 --status   print status once and exit
  python six-leg-console.py --port COM4 --backup cal-backup.txt

Type any firmware command (GSTATUS, CALDATA, GPARAM, OFF, RECOVER, ...).
While outputs are on, a PING is sent every 0.3 s so the 1 s watchdog stays
satisfied; Ctrl+C or 'quit' always sends OFF first.
"""
import argparse, threading, time, sys
import serial

def open_port(port):
    p = serial.Serial(port=None, baudrate=115200, timeout=0.1)
    p.dtr = False; p.rts = False  # do not reset the ESP32 on open
    p.port = port; p.open(); p.reset_input_buffer()
    return p

class Console:
    def __init__(self, port):
        self.p = open_port(port); self.lock = threading.Lock(); self.stop = threading.Event(); self.outputs_on = False
    def ask(self, cmd, timeout=2.0):
        """Send one command, return its first reply line (OK/ERR/data)."""
        with self.lock:
            self.p.write((cmd + '\n').encode()); end = time.monotonic() + timeout
            while time.monotonic() < end:
                line = self.p.readline().decode(errors='replace').strip()
                if not line: continue
                if line.startswith(('OK', 'ERR', 'GAIT', 'POSE', 'CALDATA', 'GPARAM', 'CAPS', 'SETUP')): return line
                print('  ' + line)  # boot/log text
            return 'ERR no reply (is the ESP32 on this port and running six_leg_setup?)'
    def keepalive(self):
        while not self.stop.wait(0.3):
            if not self.outputs_on: continue
            r = self.ask('GSTATUS')
            self.outputs_on = ' out=0 ' not in r or ' mode=enabling' in r
    def close(self):
        self.stop.set()
        try: print(self.ask('OFF'))
        finally: self.p.close()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', default='COM4')
    ap.add_argument('--status', action='store_true'); ap.add_argument('--backup')
    a = ap.parse_args(); c = Console(a.port)
    if a.status or a.backup:
        lines = [c.ask('CAPS'), c.ask('GSTATUS'), c.ask('CALDATA'), c.ask('GPARAM')]
        c.p.close()
        if a.backup:
            open(a.backup, 'w').write('\n'.join(lines) + '\n'); print('Saved', a.backup)
        print('\n'.join(lines))
        sys.exit(0 if lines[0].startswith('CAPS v=6') else 1)
    print(c.ask('CAPS')); print(c.ask('GSTATUS'))
    print("Connected. Outputs were not changed. Type a command, 'help', or 'quit'.")
    threading.Thread(target=c.keepalive, daemon=True).start()
    try:
        while True:
            line = input('hx> ').strip()
            if not line: continue
            if line in ('quit', 'exit'): break
            if line == 'help':
                print('Read: CAPS GSTATUS STATE CALDATA GPARAM | Safe: OFF RECOVER\n'
                      'Move: POWER 63 0 (hold all), JSET id pulse [rate], JOFF id, READY, PARK, GTEST 1..4\n'
                      'Save: CALSAVE id pulse, LIMIT id min max, DIR id invert(0/1), GPARAM s l t r m eco sport park\n'
                      'Joint id = leg*3 + joint; legs LF LM LR RF RM RR; joints hip knee foot.')
                continue
            r = c.ask(line); print(r)
            verb = line.split()[0].upper()
            if r.startswith('OK') and verb in ('POWER', 'JSET', 'READY', 'GTEST', 'GDRIVE', 'FRAME'): c.outputs_on = True
            if verb == 'OFF': c.outputs_on = False
    except (KeyboardInterrupt, EOFError): print()
    finally: c.close()

if __name__ == '__main__': main()
