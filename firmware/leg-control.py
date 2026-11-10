"""USB bench commands. No movement until the user chooses and confirms step."""
import argparse
import re
import time
import serial

STATE = re.compile(r'LEG ready=(\d) active=(\d) current_us=(\d+,\d+,\d+) target_us=(\d+,\d+,\d+)')
STAGES = ('CENTER', 'STEP_LIFT', 'STEP_FORWARD', 'STEP_LOWER', 'STEP_RETURN')


def receive_state(port, timeout, settled=False):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        line = port.readline().decode(errors='replace').strip()
        if not line:
            continue
        print(line, flush=True)
        if any(word in line for word in ('FAULT', 'rejected', 'Not ready', 'Send CENTER', 'Commands:', 'timeout:')):
            raise RuntimeError(line)
        match = STATE.search(line)
        if match:
            ready, active, current, target = match.groups()
            if ready != '1':
                raise RuntimeError('Controller is not ready.')
            if not settled:
                return active, current, target
            if active != '1':
                raise RuntimeError('Outputs switched off before target was reached.')
            if current == target:
                return active, current, target
    raise RuntimeError('No expected controller response before deadline.')


def send(port, command):
    print('SEND ' + command, flush=True)
    port.write((command + '\n').encode())
    port.flush()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('step', 'status', 'off'))
    parser.add_argument('--port', default='COM4')
    args = parser.parse_args()
    if args.action == 'step':
        print('Support the body with the foot clear. Connect the battery. Keep the joints clear.')
        if input('Type RUN for one step (Ctrl+C requests OFF): ').strip() != 'RUN':
            print('Cancelled.')
            return
    port = serial.Serial(port=None, baudrate=115200, timeout=0.1, write_timeout=1)
    port.dtr = False
    port.rts = False
    port.port = args.port
    port.open()
    try:
        port.reset_input_buffer()
        if args.action == 'off':
            send(port, 'OFF')
        send(port, 'STATUS')
        active, _, _ = receive_state(port, 2)
        if args.action == 'off' and active != '0':
            raise RuntimeError('OFF not confirmed; disconnect battery.')
        if args.action != 'step':
            return
        if active != '0':
            raise RuntimeError('Expected inactive outputs. Run off before a new step.')
        for command in STAGES:
            send(port, command)
            receive_state(port, 3.8, settled=True)
            time.sleep(0.4)
        print('Commanded step complete. Physical movement is not measured by this software.')
    finally:
        try:
            if args.action == 'step':
                send(port, 'OFF')
                send(port, 'STATUS')
                active, _, _ = receive_state(port, 2)
                if active != '0':
                    raise RuntimeError('OFF not confirmed; disconnect battery.')
        finally:
            port.close()


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Interrupted. Disconnect battery if motion continues.')
        raise SystemExit(130)
    except Exception as error:
        print('ERROR:', error)
        raise SystemExit(1)
