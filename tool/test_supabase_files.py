#!/usr/bin/env python3
"""Actual maximum-size private file upload and download regression."""
import base64, hashlib, sys

from supabase_test_support import LocalBackend
x=LocalBackend()
try:
 uid,token=x.owner()
 terms={'title':'Large attachment QA','description':'','notes':'','direction':'owedByMe','currency':'PHP','amountMinor':10000,'originationDate':'2026-10-09','dueDate':None,'contactId':None,'categoryId':'default-personal-loan','paymentSourceId':None,'interestInfo':None}
 code,result=x.action(uid,token,'createObligation',terms);x.check(code==200,'Large-file owner target created')
 data=b'%PDF-1.7\n'+b'0'*(10*1024*1024-15)+b'%%EOF\n'
 code,res=x.action(uid,token,'reserveAttachment',{'targetType':'obligation','targetId':result['result']['obligationId'],'filename':'max-size.pdf','contentType':'application/pdf','sizeBytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 x.check(code==200,'Exact 10 MiB receipt reserves successfully')
 file_id=res['result']['attachmentId']
 code,value=x.action(uid,token,'uploadAttachment',{'attachmentId':file_id,'expectedRevision':1,'contentBase64':base64.b64encode(data).decode()})
 x.check(code==200,'Exact 10 MiB receipt passes actual Edge upload')
 code,value=x.action(uid,token,'downloadAttachment',{'attachmentId':file_id})
 x.check(code==200 and hashlib.sha256(base64.b64decode(value['result']['contentBase64'])).hexdigest()==hashlib.sha256(data).hexdigest(),'Exact 10 MiB private download preserves checksum')
finally:x.close()
