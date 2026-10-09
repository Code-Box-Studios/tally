#!/usr/bin/env python3
"""Regression: financial period writes must not invalidate recurrence jobs."""
import datetime
from supabase_test_support import LocalBackend

def main():
 t=LocalBackend()
 try:
  owner=t.owner();uid,token=owner
  today=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=8)).date();date=today.isoformat()
  rule={'frequency':'monthly','interval':1,'unit':'months','anchorDate':date,'preferredDay':today.day,'monthEnd':False,'timezone':'Asia/Manila','localDeductionTime':'23:59','startDate':date,'endDate':None,'ruleVersion':1}
  terms={'title':'Payment before recurrence','description':'','notes':'','contactId':None,'categoryId':'default-utilities','currency':'PHP','amountKind':'fixed','defaultAmountMinor':169900,'paymentMode':'manual','paymentSourceId':None,'recurrence':rule,'reminderPolicy':{'enabled':True,'offsetDays':[3,0],'localTime':'09:00'}}
  code,created=t.action(uid,token,'createRecurring',terms);t.check(code==200,'Template and first period created');ids=created['result']
  code,paid=t.action(uid,token,'recordPayment',{'obligationId':ids['obligationId'],'obligationInstanceId':ids['firstInstanceId'],'currency':'PHP','amountMinor':50000,'paymentDate':date,'paymentSourceId':None,'paymentMethod':'cash','notes':''})
  t.check(code==200,'Partial payment precedes first recurrence run')
  t.worker();t.worker()
  periods=t.rows(owner,'obligation_instances','&data->>obligationId=eq.'+ids['obligationId'])
  t.check(len(periods)>=3,'Payment does not stall future recurring generation')
  first=[r for r in periods if r['id']==ids['firstInstanceId']][0]['data']
  t.check(first['totalPaidMinor']==50000 and first['remainingMinor']==119900,'Generation preserves paid period balances')
 finally:t.close()
if __name__=='__main__':main()
