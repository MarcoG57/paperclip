import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

ROOT=Path(__file__).resolve().parents[2]
SCRIPT=ROOT/'scripts/company/company_bwrap.py'
spec=importlib.util.spec_from_file_location('company_bwrap',SCRIPT)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

@unittest.skipUnless(sys.platform=='linux','Linux supervisor')
class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.state=self.root/'state';self.children=[]
    def tearDown(self):
        for child in self.children:
            if child.poll() is None: child.terminate()
        for child in self.children:
            try: child.wait(timeout=10)
            except subprocess.TimeoutExpired: child.kill();child.wait()
        self.tmp.cleanup()
    def test_success(self):
        self.assertEqual(mod.supervise([sys.executable,'-c','pass'],self.state),0)
        self.assertEqual(mod.control(self.state,'--company-status')['busy'],0)
    def test_exit_code(self):
        self.assertEqual(mod.supervise([sys.executable,'-c','raise SystemExit(7)'],self.state),7)
    def test_stop_prevents_work(self):
        marker=self.root/'should-not-exist';mod.control(self.state,'--company-stop')
        self.assertEqual(mod.supervise([sys.executable,'-c',f'open({str(marker)!r},"w").close()'],self.state),75)
        self.assertFalse(marker.exists());mod.control(self.state,'--company-resume')
        self.assertFalse(mod.control(self.state,'--company-status')['stopped'])
    def test_timeout(self):
        self.assertEqual(mod.supervise([sys.executable,'-c','import time;time.sleep(5)'],self.state,run_seconds=.1,grace_seconds=.1),124)
        self.assertEqual(mod.control(self.state,'--company-status')['busy'],0)
    def test_unsafe_directory(self):
        self.state.mkdir(mode=0o755)
        with self.assertRaises(PermissionError):mod.supervise([sys.executable,'-c','pass'],self.state)
    def test_symlink_slot(self):
        self.state.mkdir(mode=0o700);target=self.root/'target';target.write_text('unchanged');(self.state/'slot-0').symlink_to(target)
        with self.assertRaises(OSError):mod.supervise([sys.executable,'-c','pass'],self.state)
        self.assertEqual(target.read_text(),'unchanged')
    def test_hardlinked_slot(self):
        self.state.mkdir(mode=0o700);target=self.root/'target';target.write_text('x');target.chmod(0o600);os.link(target,self.state/'slot-0')
        with self.assertRaises(PermissionError):mod.supervise([sys.executable,'-c','pass'],self.state)
    def launch(self):
        code=f'''import importlib.util;from pathlib import Path
s=importlib.util.spec_from_file_location("b",{str(SCRIPT)!r});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
raise SystemExit(m.supervise([{sys.executable!r},"-c","import time;time.sleep(30)"],Path({str(self.state)!r}),wait_seconds=5,run_seconds=40,grace_seconds=.1))'''
        child=subprocess.Popen([sys.executable,'-c',code]);self.children.append(child);return child
    def wait_busy(self,n):
        end=time.monotonic()+8
        while time.monotonic()<end:
            if mod.control(self.state,'--company-status')['busy']==n:return
            time.sleep(.05)
        self.fail(f'{n} slots not reached')
    def test_four_slots_and_queued_request(self):
        for _ in range(4):self.launch()
        self.wait_busy(4)
        self.assertEqual(mod.supervise([sys.executable,'-c','pass'],self.state,wait_seconds=.1),75)
        self.assertEqual(mod.control(self.state,'--company-status')['busy'],4)
        self.children[0].terminate();self.children[0].wait(timeout=3);self.wait_busy(3)
        self.assertEqual(mod.supervise([sys.executable,'-c','pass'],self.state,wait_seconds=.1),0)
    def test_stop_cancels_running(self):
        child=self.launch();self.wait_busy(1);mod.control(self.state,'--company-stop');self.assertEqual(child.wait(timeout=4),75);self.wait_busy(0)
    def test_signal_cancels_running(self):
        child=self.launch();self.wait_busy(1);child.send_signal(signal.SIGTERM);self.assertEqual(child.wait(timeout=4),143);self.wait_busy(0)

if __name__=='__main__':unittest.main()
