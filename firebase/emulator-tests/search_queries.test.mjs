import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,terminate,collection,getDocs,query,where,orderBy,limit} from 'firebase/firestore';
import {withOwner,loan} from './support/session.mjs';
if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST??''))throw new Error('Local emulator required.');
const variable={title:'Electricity',description:'Home utility',notes:'',contactId:null,categoryId:'default-utilities',currency:'PHP',amountKind:'variable',defaultAmountMinor:350000,paymentMode:'manual',paymentSourceId:null,
 recurrence:{frequency:'monthly',unit:'months',interval:1,anchorDate:'2026-10-04',preferredDay:4,monthEnd:false,timezone:'Asia/Manila',localDeductionTime:'09:00',startDate:'2026-10-04',endDate:null,ruleVersion:1},reminderPolicy:{enabled:false,offsetDays:[],localTime:'09:00'}};
const month=(db,uid)=>query(collection(db,`users/${uid}/obligationInstances`),where('dueDate','>=','2026-10-01'),where('dueDate','<=','2026-10-31'),orderBy('dueDate'),limit(50));
test('canonical calendar and period history queries retain paid and unknown bills with native currencies',async()=>withOwner('search-calendar',async({call,command,user,db})=>{
 const created=await call('createObligation',command('loan',loan({amountMinor:30000,dueDate:'2026-10-10'})));
 const paid=await call('recordPayment',command('payment',{obligationId:created.obligationId,obligationInstanceId:created.obligationInstanceId,currency:'PHP',amountMinor:30000,paymentDate:'2026-10-05',paymentSourceId:null,paymentMethod:'cash',notes:''}));
 const bill=await call('createRecurring',command('variable',variable));
 await call('createObligation',command('usd',loan({currency:'USD',amountMinor:50000,dueDate:'2026-10-20'})));
 const periods=await getDocs(month(db,user.uid)); assert.equal(periods.size,3);
 const completed=periods.docs.find(d=>d.id===created.obligationInstanceId).data(),unknown=periods.docs.find(d=>d.id===bill.firstInstanceId).data();
 assert.equal(completed.closed,true);assert.equal(completed.remainingMinor,0);
 assert.equal(unknown.amountMinor,null);assert.equal(unknown.snapshot.estimatedAmountMinor,350000);
 const parents=await getDocs(query(collection(db,`users/${user.uid}/obligations`),where('archived','==',false),where('currency','==','PHP'),orderBy('createdAt','desc'),limit(50)));
 assert.equal(parents.size,2);assert.ok(parents.docs.every(d=>d.data().currency==='PHP'));
 const history=await getDocs(query(collection(db,`users/${user.uid}/payments`),where('obligationId','==',created.obligationId),where('obligationInstanceId','==',created.obligationInstanceId),orderBy('paymentDate','desc'),orderBy('createdAt','desc'),limit(50)));
 assert.deepEqual(history.docs.map(d=>d.id),[paid.paymentId]);
}));
test('filtered calendar queries deny another owner and an unauthenticated browser',async()=>withOwner('search-private-a',async owner=>withOwner('search-private-b',async other=>{
 await owner.call('createRecurring',owner.command('bill',variable));
 await assert.rejects(getDocs(month(other.db,owner.user.uid)),{code:'permission-denied'});
 const app=initializeApp({projectId:'demo-tally',apiKey:'demo-tally',appId:'demo-tally'},`search-anonymous-${Date.now()}`),db=getFirestore(app);
 connectFirestoreEmulator(db,'127.0.0.1',8080);
 try{await assert.rejects(getDocs(month(db,owner.user.uid)),{code:'permission-denied'});}
 finally{await terminate(db);await deleteApp(app);}
})));
