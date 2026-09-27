import importlib.util
from pathlib import Path
import unittest
s=importlib.util.spec_from_file_location('costs',Path(__file__).resolve().parents[2]/'scripts/company/costs.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def row(**kw):return {'charge_id':'one','task_id':'t1','currency':'USD','amount':'0.10','kind':'actual','task_status':'accepted',**kw}
class CostTests(unittest.TestCase):
 def test_decimal(self):self.assertEqual(m.summarize([row(),row(charge_id='two',amount='0.20')])['groups'][0]['total_amount'],'0.30')
 def test_duplicate(self):self.assertEqual(m.summarize([row(),row()])['duplicate_rows_ignored'],1)
 def test_conflicting_duplicate(self):
  with self.assertRaises(ValueError):m.summarize([row(),row(amount='0.20')])
 def test_separate_currency_and_estimate(self):self.assertEqual(len(m.summarize([row(),row(charge_id='two',currency='EUR'),row(charge_id='three',kind='estimate')])['groups']),3)
 def test_unknown_not_accepted(self):self.assertIsNone(m.summarize([row(task_status='unknown')])['groups'][0]['amount_per_accepted_observed_task'])
 def test_nonfinite(self):
  with self.assertRaises(ValueError):m.summarize([row(amount='NaN')])
 def test_conflicting_status(self):
  with self.assertRaises(ValueError):m.summarize([row(),row(charge_id='two',task_status='rejected')])
 def test_refund(self):self.assertEqual(m.summarize([row(amount='-1.00')])['groups'][0]['total_amount'],'-1.00')
if __name__=='__main__':unittest.main()
