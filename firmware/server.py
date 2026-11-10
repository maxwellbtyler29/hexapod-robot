"""Local preview: HTTP UI + authoritative native C++ controller at 50 Hz.
No external Python packages. Binds to loopback by default, never drives hardware.
"""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import argparse, json, math, queue, subprocess, threading, time

ROOT = Path(__file__).resolve().parent
FIELDS = ('session', 'seq', 'mode', 'x', 'y', 'gain', 'leg', 'lift', 'action', 'routine')
INTEGER = {'session', 'seq', 'mode', 'leg', 'action', 'routine'}

def controller_binary():
    for name in ('controller', 'controller.exe'):
        path = ROOT / 'build' / name
        if path.is_file():
            return path
    raise FileNotFoundError(
        'Desktop controller is not built. From the repository root: '
        'g++ -std=c++17 -O2 firmware/native/main.cpp -o firmware/build/controller')

class Engine:
    def __init__(self):
        self.process = subprocess.Popen([str(controller_binary())], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.start = time.monotonic()
        self.requests = queue.Queue(maxsize=30)
        self.state = self.rpc('S')
        self.error = None
        self.closed = False
        self.worker = threading.Thread(target=self.run, daemon=True)
        self.worker.start()

    def rpc(self, line):
        self.process.stdin.write(line+'\n'); self.process.stdin.flush()
        reply = self.process.stdout.readline()
        if not reply: raise RuntimeError('Native controller stopped')
        return json.loads(reply)

    def run(self):
        last = time.monotonic()
        try:
            while not self.closed:
                now = time.monotonic()
                for _ in range(8):
                    try: request = self.requests.get_nowait()
                    except queue.Empty: break
                    data, result, done = request
                    stamp = time.monotonic()-self.start
                    response = self.rpc('C '+str(stamp)+' '+' '.join(str(data[k]) for k in FIELDS))
                    result.append(response); done.set()
                stamp = time.monotonic()
                self.state = self.rpc(f'T {stamp-self.start} {stamp-last}')
                last = stamp
                time.sleep(max(0, .02-(time.monotonic()-now)))
        except Exception as exc:
            self.error = str(exc)

    def command(self, data):
        result, done = [], threading.Event()
        try: self.requests.put_nowait((data, result, done))
        except queue.Full: return None
        if not done.wait(2): return None
        return result[0]

    def close(self):
        self.closed = True
        self.worker.join(1)
        self.process.terminate()
        self.process.wait(timeout=3)

def validate(raw):
    if set(raw) != set(FIELDS) or any(len(v)!=1 for v in raw.values()): raise ValueError('Invalid command fields')
    out={}
    for k in FIELDS:
        s=raw[k][0]
        out[k]=int(s) if k in INTEGER else float(s)
        if not math.isfinite(out[k]): raise ValueError('Nonfinite command')
    if not(1<=out['session']<=4294967295 and 1<=out['seq']<=4294967295): raise ValueError('Invalid command identifier')
    return out

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def send_json(self, status, data):
        payload=json.dumps(data, separators=(',',':')).encode()
        self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(payload))); self.end_headers()
        try: self.wfile.write(payload)
        except (ConnectionAbortedError,ConnectionResetError,BrokenPipeError): pass
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/state':
            if self.server.engine.error: return self.send_json(503,{'error':self.server.engine.error})
            return self.send_json(200,self.server.engine.state)
        if path not in ('/','/index.html'): return self.send_json(404,{'error':'Not found'})
        data=(ROOT/'preview'/'index.html').read_bytes()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_POST(self):
        if urlsplit(self.path).path!='/api/command': return self.send_json(404,{'error':'Not found'})
        # Commands are same-origin only. No CORS or cross-origin form control.
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc!=self.headers.get('Host'): return self.send_json(403,{'error':'Origin rejected'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length<1 or length>2048: raise ValueError('Invalid command size')
            raw=parse_qs(self.rfile.read(length).decode('utf-8'),keep_blank_values=True,strict_parsing=True)
            data=validate(raw)
        except (ValueError,UnicodeError): return self.send_json(400,{'error':'Malformed command'})
        result=self.server.engine.command(data)
        if result is None:return self.send_json(503,{'error':'Controller unavailable'})
        self.send_json(200 if result['accepted'] else 409,result)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);args=parser.parse_args()
    engine=Engine()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.engine=engine
    print(f'Hexapod preview: http://127.0.0.1:{args.port} — simulated commands only',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close();engine.close()
