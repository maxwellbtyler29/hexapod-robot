"""HTTP/native integration checks on an isolated ephemeral local port."""
import importlib.util
import json
from pathlib import Path
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location('bridge', Path(__file__).resolve().parents[1] / 'server.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
engine = bridge.Engine()
server = bridge.ThreadingHTTPServer(('127.0.0.1', 0), bridge.Handler)
server.engine = engine
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = 'http://127.0.0.1:' + str(server.server_port)
checks = 0

def request(path, data=None, origin=None):
    req = Request(base + path, data=None if data is None else urlencode(data).encode())
    if origin:
        req.add_header('Origin', origin)
    try:
        response = urlopen(req, timeout=3)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read()
        return response.status, json.loads(raw) if 'json' in response.headers['Content-Type'] else raw

def check(ok):
    global checks
    assert ok
    checks += 1

try:
    status, state = request('/api/state')
    check(status == 200 and len(state['legs']) == 6 and not state['hardwareOutput'])
    check(request('/')[0] == 200)
    check(request('/missing')[0] == 404)
    data = dict(session=1, seq=1, mode=0, x=0, y=0, gain=.5, leg=0, lift=0, action=1, routine=0)
    check(request('/api/command', data, 'http://other.invalid')[0] == 403)
    check(request('/api/command', dict(data, x='nan'))[0] == 400)
    status, state = request('/api/command', data, base)
    check(status == 200 and state['enabled'])
    check(request('/api/command', data)[0] == 409)
    check(request('/api/command', dict(data, session=2))[0] == 409)
    check(request('/api/command', dict(data, seq=2, gain=2))[0] == 409)
    time.sleep(.85)
    check(not request('/api/state')[1]['enabled'])
    status, state = request('/api/command', dict(data, seq=3, action=0))
    check(status == 200 and not state['enabled'])
    print(f'{checks} HTTP/native integration checks passed')
finally:
    server.shutdown()
    server.server_close()
    thread.join()
    engine.close()
