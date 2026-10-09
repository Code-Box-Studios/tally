#!/usr/bin/env python3
"""Real Auth/session fencing and sanitized multi-device registration tests."""
import uuid
from supabase_test_support import LocalBackend

def main():
 t=LocalBackend()
 try:
  alice=t.owner();bob=t.owner();uid,token=alice
  payload={'installationId':'device-'+uuid.uuid4().hex,'platform':'web','token':'qa-token-'+uuid.uuid4().hex,'permission':'granted','channel':'push','appVersion':'1.0.0','expectedRevision':0}
  code,response=t.action(uid,token,'registerNotificationDevice',payload)
  t.check(code==200,'Device registration validates an owned installation')
  view=response['result']['device'];t.check('token' not in view and 'tokenHash' not in view,'Registration response excludes private push tokens')
  code,response=t.action(uid,token,'listNotificationDevices',{'limit':10,'after':None})
  t.check(code==200 and response['result']['devices'][0]['installationId']==payload['installationId'],'Device listing returns owner-scoped views')
  t.check('token' not in str(response['result']),'Device listing never returns registration secrets')
  code,_=t.request('/rest/v1/tally_notification_devices?select=*',token=token)
  t.check(code==403,'Client cannot directly read raw device-token table')
  code,response=t.action(bob[0],bob[1],'registerNotificationDevice',payload)
  t.check(code==409,'Same push token cannot bind to two active owners')
  code,_=t.action(uid,token,'unregisterNotificationDevice',{'installationId':payload['installationId'],'expectedRevision':1})
  t.check(code==200,'Sign-out can deactivate the exact owned registration')
  code,_=t.action(bob[0],bob[1],'registerNotificationDevice',payload)
  t.check(code==200,'An unregistered device can bind safely to the next owner')
  expo={**payload,'installationId':'expo-'+uuid.uuid4().hex,'platform':'ios','token':'ExpoPushToken['+uuid.uuid4().hex+']'}
  code,response=t.action(uid,token,'registerNotificationDevice',expo)
  t.check(code==200 and 'token' not in response['result']['device'],'Expo native registration stores only a sanitized owner view')
  code,_=t.action(bob[0],bob[1],'registerNotificationDevice',expo)
  t.check(code==409,'Expo push token remains unique across active owners')
  code,_=t.action(uid,token,'unregisterNotificationDevice',{'installationId':expo['installationId'],'expectedRevision':1})
  t.check(code==200,'Expo token deactivates through the same owner authorization')
  code,_=t.request('/auth/v1/logout?scope=global',token=token,method='POST')
  t.check(code in (200,204),'Auth revokes the real owner session')
  code,response=t.request('/rest/v1/tally_contacts?select=id',token=token)
  t.check(code==200 and response==[],'Old valid JWT cannot read private rows after session revocation')
  code,_=t.request('/functions/v1/tally-api',{'name':'bootstrapUser','input':{}},token)
  t.check(code==401,'Old JWT cannot invoke trusted actions after sign-out')
  print('Device/session integration checks:',t.checks)
 finally:t.close()
if __name__=='__main__':main()
