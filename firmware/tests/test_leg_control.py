import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('leg_control', Path(__file__).parents[1] / 'leg-control.py')
control = importlib.util.module_from_spec(spec)
spec.loader.exec_module(control)


class Port:
    def __init__(self, reject=None):
        self.commands, self.lines = [], []
        self.active, self.closed, self.reject = 0, False, reject
        self.pose = '0,0,0'

    def open(self): pass
    def flush(self): pass
    def reset_input_buffer(self): pass
    def close(self): self.closed = True

    def write(self, data):
        cmd = data.decode().strip()
        self.commands.append(cmd)
        if cmd == self.reject:
            self.lines.append(b'Step rejected: previous stage must be settled.\n')
            return
        if cmd == 'OFF':
            self.active, self.pose = 0, '0,0,0'
            return
        if cmd != 'STATUS':
            self.active = 1
            # Deliberately different values: runner must use reported poses,
            # not hard-code the original firmware's tuning values.
            self.pose = {'CENTER':'1500,1500,1500', 'STEP_LIFT':'1500,1400,1520',
                         'STEP_FORWARD':'1600,1400,1520', 'STEP_LOWER':'1650,1850,1238','STEP_RETURN':'1500,1850,1238'}[cmd]
        self.lines.append(f'LEG ready=1 active={self.active} current_us={self.pose} target_us={self.pose}\n'.encode())

    def readline(self): return self.lines.pop(0) if self.lines else b''


class RunnerTests(unittest.TestCase):
    def run_action(self, action, port):
        with patch.object(control.serial, 'Serial', return_value=port), patch('builtins.input', return_value='RUN'), patch.object(control.time, 'sleep'), patch('sys.argv', ['leg-control.py', action]):
            control.main()

    def test_step_and_cleanup(self):
        port = Port()
        self.run_action('step', port)
        self.assertEqual(port.commands, ['STATUS', *control.STAGES, 'OFF', 'STATUS'])
        self.assertTrue(port.closed)
        self.assertEqual(port.active, 0)

    def test_rejected_stage_stops(self):
        port = Port(reject='STEP_FORWARD')
        with self.assertRaises(RuntimeError): self.run_action('step', port)
        self.assertNotIn('STEP_LOWER', port.commands)
        self.assertEqual(port.commands[-2:], ['OFF', 'STATUS'])
        self.assertTrue(port.closed)

    def test_status_never_moves(self):
        port = Port()
        self.run_action('status', port)
        self.assertEqual(port.commands, ['STATUS'])


if __name__ == '__main__': unittest.main()
