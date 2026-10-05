import generated from '../generated/timezones.json';

interface ZoneData {
  initialOffset:number;offsets:number[];transitionAt:number[];transitionZone:number[];
}
const locations=generated.locations as unknown as Record<string,ZoneData>;
export const timezoneDataVersion=generated.version;
export const supportedZones=Object.freeze(Object.keys(locations).sort());
export function hasZone(name:unknown):name is string {
  return typeof name==='string' && Object.hasOwn(locations,name);
}
function location(name:string):ZoneData {
  if(!hasZone(name))throw new RangeError('Unsupported timezone.');
  return locations[name]!;
}
export function zoneOffsets(name:string):readonly number[] {
  const value=location(name);
  return [...new Set([value.initialOffset,...value.offsets])];
}
export function localWallMilliseconds(instant:number,name:string):number {
  if(!Number.isSafeInteger(instant))throw new RangeError('Invalid timestamp.');
  const value=location(name),transitions=value.transitionAt;
  let low=0,high=transitions.length;
  while(low<high) {
    const middle=low+Math.floor((high-low)/2);
    if(transitions[middle]!<=instant)low=middle+1;else high=middle;
  }
  const offset=low===0?value.initialOffset:value.offsets[value.transitionZone[low-1]!]!;
  return instant+offset;
}
export function civilAt(instant:Date,name:string):string {
  return new Date(localWallMilliseconds(instant.getTime(),name)).toISOString().slice(0,10);
}
