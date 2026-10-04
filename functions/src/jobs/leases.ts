import {localToday} from '../shared/validation.js';
export interface LeaseSchedule {status:string;nextRunAt:Date;leaseExpiresAt:Date|null}
export function canClaimLease(job:LeaseSchedule,now:Date):boolean {
  return job.status==='pending'?job.nextRunAt.getTime()<=now.getTime():job.status==='leased' && job.leaseExpiresAt!==null && job.leaseExpiresAt.getTime()<=now.getTime();
}
export function leaseMatches(job:{status:string;leaseToken:string|null;generation:number;leaseGeneration:number|null},token:string):boolean {
  return job.status==='leased' && job.leaseToken===token && job.generation===job.leaseGeneration;
}
export function nextCivilBoundary(timezone:string,now:Date):Date {
  const day=localToday(timezone,now);let left=now.getTime();let right=left+48*60*60*1000;
  while(left+1<right) {
    const middle=Math.floor((left+right)/2);
    if(localToday(timezone,new Date(middle))===day)left=middle;else right=middle;
  }
  return new Date(right);
}
