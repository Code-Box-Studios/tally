import {test} from 'node:test';
import assert from 'node:assert/strict';
import {civilDate,moneyMinor,currencyCode,identifier,textValue} from '../src/shared/validation.js';
import {validateCatalog} from '../src/catalog/catalog.js';
import {validateObligationCreation} from '../src/obligations/obligation_service.js';
import {commandDocumentId} from '../src/shared/commands.js';
const loan={title:'Loan',description:'Borrowed',notes:'',direction:'owedByMe',currency:'PHP',amountMinor:1_000_000,originationDate:'2020-01-01',dueDate:'2026-10-15',contactId:null,categoryId:'default-personal-loan',paymentSourceId:null,interestInfo:null};
test('financial scalars preserve exact civil dates and bounded integer money',()=>{
 assert.equal(civilDate('2024-02-29'),'2024-02-29');assert.equal(moneyMinor(1_000_000_000_000),1_000_000_000_000);assert.equal(currencyCode('JPY'),'JPY');assert.equal(identifier('loan-1'),'loan-1');assert.equal(textValue('  John  ',120,true),'John');
});
test('reject malformed dates unsafe amounts references and currencies',()=>{
 for(const date of ['2023-02-29','2026-04-31','2026-2-01','1899-12-31','2200-01-01','2026-01-01T00:00:00Z'])assert.throws(()=>civilDate(date),{code:'invalid-argument'});
 for(const amount of [0,-1,1.1,NaN,Infinity,1_000_000_000_001,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>moneyMinor(amount),{code:'invalid-argument'});
 assert.throws(()=>currencyCode('php'),{code:'invalid-argument'});assert.throws(()=>identifier('../bob'),{code:'invalid-argument'});assert.throws(()=>textValue('a'.repeat(121),120,true),{code:'invalid-argument'});
});
test('obligation input cannot inject owner balances enums or inconsistent dates',()=>{
 assert.equal(validateObligationCreation(loan).amountMinor,1_000_000);assert.equal(validateObligationCreation({...loan,dueDate:null}).dueDate,null);
 for(const patch of [{userId:'bob'},{remainingMinor:1},{direction:'recurringDue'},{currency:'XYZ'},{amountMinor:0},{dueDate:'2019-12-31'},{title:' '},{interestInfo:{rateBasisPoints:-1,basis:'annual',agreementNotes:''}}])assert.throws(()=>validateObligationCreation({...loan,...patch}),{code:'invalid-argument'});
});
test('catalog accepts labels but rejects card credentials and malformed last four',()=>{
 const input={kind:'source',id:null,expectedRevision:null,values:{name:'Visa',type:'creditCard',nickname:null,lastFour:'1234',notes:'',active:true}};
 assert.equal(validateCatalog(input).kind,'source');
 for(const values of [{...input.values,cvv:'123'},{...input.values,lastFour:'12345'},{...input.values,lastFour:'12a4'},{...input.values,type:'bankPassword'}])assert.throws(()=>validateCatalog({...input,values}),{code:'invalid-argument'});
 assert.throws(()=>validateCatalog({...input,id:'cash',expectedRevision:null}),{code:'invalid-argument'});
});
test('command document IDs stay deterministic and distinct by role',()=>{
 assert.equal(commandDocumentId('same','obligation'),commandDocumentId('same','obligation'));
 assert.notEqual(commandDocumentId('same','obligation'),commandDocumentId('same','instance'));
 assert.match(commandDocumentId('same','obligation'),/^[A-Za-z0-9_-]{1,128}$/);
});
