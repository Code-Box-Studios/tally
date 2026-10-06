import {performance} from 'node:perf_hooks';
import {HttpsError} from 'firebase-functions/v2/https';

/** Leave five seconds within the dispatcher's sixty-second start reserve. */
export class AttachmentWorkBudget {
 private readonly started:number;
 constructor(private readonly monotonic:()=>number=()=>performance.now()) {
  this.started=monotonic();
 }
 assertAvailable():void {
  if(this.monotonic()-this.started>=55_000)
   throw new HttpsError('deadline-exceeded','File processing is delayed.');
 }
}
