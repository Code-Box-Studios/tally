import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {commandDocumentId} from '../src/shared/commands.js';

test('offline creation fixtures preserve the existing owner-scoped server ID contract',()=>{
 const fixtures=JSON.parse(readFileSync(resolve(__dirname,'../../../test/fixtures/sync/command-identities.json'),'utf8')) as {owner:string;commandId:string;role:string;expectedId:string}[];
 for(const row of fixtures)assert.equal(commandDocumentId(`${row.owner}:${row.commandId}`,row.role),row.expectedId);
});
