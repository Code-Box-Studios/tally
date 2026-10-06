import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachmentReservation,sniffAttachment,maxAttachmentBytes,maxAttachmentsPerTarget} from '../src/attachments/policy.js';

const payload=()=>({targetType:'payment',targetId:'payment-1',filename:'receipt.pdf',contentType:'application/pdf',sizeBytes:123,sha256:null});
test('attachment reservation accepts only bounded target and declared metadata',()=>{
 assert.equal(maxAttachmentBytes,10485760);assert.equal(maxAttachmentsPerTarget,10);
 assert.deepEqual(validateAttachmentReservation(payload()),payload());
 for(const targetType of ['obligation','instance','payment'])assert.equal(validateAttachmentReservation({...payload(),targetType}).targetType,targetType);
 assert.throws(()=>validateAttachmentReservation({...payload(),userId:'someone'}));
 assert.throws(()=>validateAttachmentReservation({...payload(),storagePath:'public/file'}));
});
test('four formats and exact ten MiB supported; unsupported or unsafe metadata denied',()=>{
 for(const contentType of ['image/jpeg','image/png','image/webp','application/pdf'])assert.equal(validateAttachmentReservation({...payload(),contentType,sizeBytes:10485760}).contentType,contentType);
 for(const patch of [
  {sizeBytes:0},{sizeBytes:-1},{sizeBytes:10485761},{sizeBytes:1.2},{sizeBytes:Number.NaN},
  {contentType:'image/svg+xml'},{contentType:'text/html'},{targetType:'account'},{targetId:'../one'},
  {filename:''},{filename:'../receipt.pdf'},{filename:'folder\\receipt.pdf'},{filename:'a\n.pdf'},
  {filename:'a\u202e.pdf'},{filename:'a'.repeat(151)},{sha256:'AB'.repeat(32)},{sha256:'ab'.repeat(31)},
 ])assert.throws(()=>validateAttachmentReservation({...payload(),...patch}));
 assert.equal(validateAttachmentReservation({...payload(),sha256:'ab'.repeat(32)}).sha256,'ab'.repeat(32));
});
test('file detection uses bytes rather than a supplied MIME or extension',()=>{
 assert.equal(sniffAttachment(Buffer.from([255,216,255,224,0,0,255,217])),'image/jpeg');
 assert.equal(sniffAttachment(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000049454e44ae426082','hex')),'image/png');
 const webp=Buffer.from('524946460c000000574542505650384c00000000','hex');
 assert.equal(sniffAttachment(webp),'image/webp');
 assert.equal(sniffAttachment(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')),'application/pdf');
 for(const bytes of [Buffer.alloc(0),Buffer.from('<html>receipt</html>'),Buffer.from('<svg></svg>'),Buffer.from('%PDF-1.7'),Buffer.from([255,216,255])])assert.equal(sniffAttachment(bytes),null);
});
