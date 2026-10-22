import {readCursor,signCursor} from '../src/modules/sync/cursor';
const secret='s'.repeat(32), scope={userId:'user',clinicId:'clinic',permissionRevision:'1'};
const claims={version:1 as const,...scope,afterRevision:'0',throughRevision:'9223372036854775807'};
describe('sync cursor',()=>{
 it('preserves revisions beyond JS safe integers',()=>{expect(readCursor(signCursor(claims,secret),secret,scope)).toEqual(claims);});
 it('rejects tampering and different signing keys',()=>{const token=signCursor(claims,secret);expect(()=>readCursor(token+'x',secret,scope)).toThrow();expect(()=>readCursor(token,'other'.repeat(8),scope)).toThrow();});
 it('requires reset after owner, clinic or permission change',()=>{const token=signCursor(claims,secret);for(const field of ['userId','clinicId','permissionRevision'] as const)expect(()=>readCursor(token,secret,{...scope,[field]:'changed'})).toThrow();});
 it('rejects a signed malformed range',()=>{expect(()=>readCursor(signCursor({...claims,afterRevision:'2',throughRevision:'1'},secret),secret,scope)).toThrow();});
});
