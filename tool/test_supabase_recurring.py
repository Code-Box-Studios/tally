#!/usr/bin/env python3
"""Actual SQL/Edge recurrence, automatic deductions, installments, currencies."""
import concurrent.futures, datetime
from supabase_test_support import LocalBackend

def main():
 t=LocalBackend()
 try:
  owner=t.owner();uid,token=owner
  today=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=8)).date()
  date=today.isoformat();day=today.day
  def action(name,payload):return t.action(uid,token,name,payload)
  rule={'frequency':'monthly','interval':1,'unit':'months','anchorDate':date,'preferredDay':day,'monthEnd':False,
        'timezone':'Asia/Manila','localDeductionTime':'00:00','startDate':date,'endDate':None,'ruleVersion':1}
  terms={'title':'Internet','description':'','notes':'','contactId':None,'categoryId':'default-utilities','currency':'PHP',
    'amountKind':'fixed','defaultAmountMinor':169900,'paymentMode':'manual','paymentSourceId':None,
    'recurrence':rule,'reminderPolicy':{'enabled':True,'offsetDays':[3,0],'localTime':'09:00'}}
  code,created=action('createRecurring',terms);t.check(code==200,'Monthly template creates an independent first instance');ids=created['result']
  code,edited=action('editRecurring',{**terms,'defaultAmountMinor':189900,'obligationId':ids['obligationId'],'expectedRevision':1})
  t.check(code==200,'Price edit applies to future generation only')
  t.worker();t.worker()
  periods=t.rows(owner,'obligation_instances','&data->>obligationId=eq.'+ids['obligationId']);count=len(periods)
  t.check(3<=count<=4,'Server generates a bounded 90-day horizon')
  t.check(all(row['data']['amountMinor']==(169900 if row['id']==ids['firstInstanceId'] else 189900) for row in periods),'Original period retains old fee; new periods use new fee')
  t.worker();again=t.rows(owner,'obligation_instances','&data->>obligationId=eq.'+ids['obligationId'])
  t.check(len(again)==count,'Duplicate worker runs cannot generate duplicate periods')
  variable={**terms,'title':'Electricity','amountKind':'variable','defaultAmountMinor':None}
  code,response=action('createRecurring',variable);t.check(code==200,'Variable bill starts without a fabricated amount');variable_id=response['result']
  code,response=action('setRecurringAmount',{'obligationId':variable_id['obligationId'],'instanceId':variable_id['firstInstanceId'],'expectedRevision':1,'amountMinor':325000,'reason':'Actual statement'})
  t.check(code==200,'Each variable billing period gets its own statement amount')
  code,_=action('createRecurring',{**terms,'title':'Paused bill'});t.check(code==200,'Pause fixture created')
  parents=t.rows(owner,'obligations','&data->>title=eq.Paused%20bill');parent=parents[0]
  code,_=action('changeRecurringLifecycle',{'obligationId':parent['id'],'expectedRevision':1,'action':'pause','effectiveDate':date})
  t.check(code==200,'Recurring schedule pauses while retaining history');t.worker()
  paused=t.rows(owner,'obligation_instances','&data->>obligationId=eq.'+parent['id']);t.check(len(paused)==1,'Paused job generates no additional periods')
  code,source=action('saveCatalog',{'kind':'source','id':None,'expectedRevision':None,'values':{'name':'Credit card','type':'creditCard','nickname':None,'lastFour':'1234','notes':'','active':True}})
  t.check(code==200,'Payment source stores only a label and last four digits');source_id=source['result']['id']
  code,response=action('createRecurring',{**terms,'title':'Netflix','defaultAmountMinor':54900,'paymentMode':'automatic','paymentSourceId':source_id})
  t.check(code==200,'Automatic deduction fixture scheduled');automatic=response['result']
  period=t.rows(owner,'obligation_instances','&id=eq.'+automatic['firstInstanceId'])[0]
  # Only the local admin fixture changes admission time. Production actions never
  # accept an injected clock or editable audit timestamp.
  historical={**period['data'],'createdAt':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(days=1)).isoformat()}
  code,_=t.request('/rest/v1/tally_obligation_instances?user_id=eq.'+uid+'&id=eq.'+period['id'],{'data':historical},admin=True,method='PATCH')
  t.check(code==204,'Local fixture was admitted before the expected deduction')
  t.worker();t.worker()
  deducted=t.rows(owner,'obligation_instances','&id=eq.'+period['id'])[0]['data']
  t.check(deducted['deductionStatus']=='deducted' and deducted['totalPaidMinor']==54900,'Scheduled automatic event records exactly one assumed payment')
  payments=t.rows(owner,'payments','&data->>obligationId=eq.'+automatic['obligationId']);t.check(len(payments)==1,'Automatic retry preserves one permanent financial event')
  code,_=action('reportDeductionFailure',{'obligationId':automatic['obligationId'],'instanceId':period['id'],'expectedRevision':deducted['revision'],'reason':'Card declined'})
  t.check(code==200,'Failed deduction appends a reversal and keeps its original evidence')
  failed=t.rows(owner,'obligation_instances','&id=eq.'+period['id'])[0]['data']
  t.check(failed['deductionStatus']=='failed' and failed['remainingMinor']==54900,'Failed automatic payment restores the exact outstanding amount')
  debt={'title':'USD installments','description':'','notes':'','direction':'owedToMe','currency':'USD','amountMinor':50000,
   'originationDate':date,'dueDate':(today+datetime.timedelta(days=3)).isoformat(),'contactId':None,'categoryId':'default-installment','paymentSourceId':None,'interestInfo':None,
   'installments':[{'amountMinor':25000,'dueDate':date},{'amountMinor':25000,'dueDate':(today+datetime.timedelta(days=3)).isoformat()}]}
  code,response=action('createInstallment',debt);t.check(code==200,'Installments use independent bounded period records');installment=response['result']
  code,_=action('recordInstallmentPayment',{'obligationId':installment['obligationId'],'currency':'USD','amountMinor':30000,'paymentDate':date,'paymentSourceId':None,'paymentMethod':'cash','notes':'','explicitAllocations':None})
  t.check(code==200,'One payment allocates across installments in due-date order')
  t.worker();t.worker()
  usd=t.rows(owner,'summaries','&id=eq.dashboard-USD')[0]['data'];php=t.rows(owner,'summaries','&id=eq.dashboard-PHP')[0]['data']
  t.check(usd['owedToYouMinor']==20000 and php['owedToYouMinor']==0,'Dashboard never combines USD and PHP balances')
  code,response=action('createRecurring',{**terms,'title':'Confirm automatic','defaultAmountMinor':54900,'paymentMode':'automaticConfirmation','paymentSourceId':source_id})
  t.check(code==200,'Confirmation mode creates an independent scheduled deduction');confirmation=response['result']
  current=t.rows(owner,'obligation_instances','&id=eq.'+confirmation['firstInstanceId'])[0]
  code,_=t.request('/rest/v1/tally_obligation_instances?user_id=eq.'+uid+'&id=eq.'+current['id'],{'data':{**current['data'],'createdAt':historical['createdAt']}},admin=True,method='PATCH')
  t.check(code==204,'Confirmation fixture precedes deduction schedule');t.worker()
  expected=t.rows(owner,'obligation_instances','&id=eq.'+current['id'])[0]['data']
  t.check(expected['deductionStatus']=='expected' and expected['totalPaidMinor']==0,'Expected deduction never invents a paid balance')
  code,_=action('confirmDeduction',{'obligationId':confirmation['obligationId'],'instanceId':current['id'],'expectedRevision':expected['revision'],'amountMinor':54900,'paymentDate':date,'paymentSourceId':source_id,'paymentMethod':'other','notes':''})
  t.check(code==200,'User confirmation records the real automatic payment')
  confirmed=t.rows(owner,'obligation_instances','&id=eq.'+current['id'])[0]['data']
  t.check(confirmed['deductionStatus']=='confirmed' and confirmed['remainingMinor']==0,'Confirmed full payment closes the period')
  print('Recurring integration checks:',t.checks)
 finally:t.close()
if __name__=='__main__':main()
