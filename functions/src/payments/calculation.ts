import {HttpsError} from 'firebase-functions/v2/https';
import {moneyMinor,invalid} from '../shared/validation.js';
export interface Balance {totalPaidMinor:number;remainingMinor:number}
export function calculateBalance(original:number,effectivePaid:number,delta:number):Balance {
  moneyMinor(original);
  if(!Number.isSafeInteger(effectivePaid) || effectivePaid<0 || effectivePaid>original || !Number.isSafeInteger(delta) || Math.abs(delta)>1_000_000_000_000)return invalid('Invalid payment history.');
  const totalPaidMinor=effectivePaid+delta;
  if(totalPaidMinor>original)throw new HttpsError('failed-precondition','Payment exceeds the remaining balance.',{reason:'overpayment',remainingMinor:original-effectivePaid});
  if(totalPaidMinor<0)throw new HttpsError('failed-precondition','Payment history needs recovery.',{reason:'invalidBalance'});
  return {totalPaidMinor,remainingMinor:original-totalPaidMinor};
}
