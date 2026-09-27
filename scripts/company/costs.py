#!/usr/bin/env python3
"""Reconcile a charge ledger without models, exchange-rate guesses or API prices."""
from __future__ import annotations
from collections import defaultdict
import csv
from decimal import Decimal, InvalidOperation, localcontext
import json
import re
import sys

FIELDS={'charge_id','task_id','currency','amount','kind','task_status'}
STATUSES={'accepted','rejected','in_progress','unknown'}

def summarize(rows):
    seen={};groups={};duplicates=0
    for row in rows:
        if set(row)!=FIELDS or any(not isinstance(v,str) for v in row.values()):
            raise ValueError('INVALID_COLUMNS')
        if not row['charge_id'] or not row['task_id'] or not re.fullmatch('[A-Z]{3}',row['currency']):
            raise ValueError('INVALID_IDENTIFIERS_OR_CURRENCY')
        if row['kind'] not in {'actual','estimate'} or row['task_status'] not in STATUSES:
            raise ValueError('INVALID_KIND_OR_STATUS')
        if row['charge_id'] in seen:
            if seen[row['charge_id']]!=row:raise ValueError('CONFLICTING_DUPLICATE_CHARGE')
            duplicates+=1;continue
        seen[row['charge_id']]=dict(row)
        try:amount=Decimal(row['amount'])
        except InvalidOperation as exc:raise ValueError('INVALID_AMOUNT')from exc
        if not amount.is_finite() or len(amount.as_tuple().digits)>28 or abs(amount.as_tuple().exponent)>12:
            raise ValueError('INVALID_AMOUNT_PRECISION')
        key=(row['currency'],row['kind']);group=groups.setdefault(key,{'amount':Decimal(0),'statuses':{}})
        old=group['statuses'].get(row['task_id'])
        if old is not None and old!=row['task_status']:raise ValueError('CONFLICTING_TASK_STATUS')
        with localcontext() as ctx:
            ctx.prec=50;group['amount']+=amount
        group['statuses'][row['task_id']]=row['task_status']
    result=[]
    for (currency,kind),group in sorted(groups.items()):
        accepted=sum(s=='accepted' for s in group['statuses'].values())
        with localcontext() as ctx:
            ctx.prec=50;unit=group['amount']/accepted if accepted else None
        result.append({'currency':currency,'kind':kind,'total_amount':str(group['amount']),
          'observed_tasks':len(group['statuses']),'accepted_observed_tasks':accepted,
          'amount_per_accepted_observed_task':str(unit)if unit is not None else None})
    return {'scope':'SUPPLIED_LEDGER_ONLY','groups':result,'duplicate_rows_ignored':duplicates,
      'limits':['No currency conversion','Actual and estimated charges stay separate',
      'Only tasks represented in this ledger are counted','Missing charges are not zero cost',
      'Acceptance labels are supplied data, not independently verified outcomes']}

def main():
    if len(sys.argv)!=2:raise ValueError('Usage: python3 scripts/company/costs.py LEDGER.csv')
    with open(sys.argv[1],newline='',encoding='utf-8')as f:print(json.dumps(summarize(csv.DictReader(f)),indent=2))

if __name__=='__main__':
    try:main()
    except (ValueError,OSError)as error:
        print(json.dumps({'error':str(error)}),file=sys.stderr);sys.exit(1)
