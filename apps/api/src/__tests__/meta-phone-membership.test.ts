import {it,expect,beforeEach,afterEach,vi} from 'vitest';
import {assertMetaPhoneMembership} from '../services/meta-phone-membership';
const network=vi.hoisted(()=>({fetch:vi.fn()}));vi.mock('@sos-sales/application',async original=>({...await original<typeof import('@sos-sales/application')>(),safeFetchWithSsrfGuard:(...args:unknown[])=>network.fetch(...args)}));
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const run=()=>assertMetaPhoneMembership('123456','987654','SIM-secret','+551130000000');
beforeEach(()=>network.fetch.mockReset());afterEach(()=>vi.restoreAllMocks());
it('requires the exact line and matching phone in the selected account',async()=>{
 network.fetch.mockImplementation(async()=>response({data:[{id:'111111',display_phone_number:'551130000000'}]}));await expect(run()).rejects.toMatchObject({statusCode:422});
 network.fetch.mockImplementation(async()=>response({data:[{id:'987654',display_phone_number:'551130000001'}]}));await expect(run()).rejects.toMatchObject({statusCode:422});
 network.fetch.mockImplementation(async()=>response({data:[{id:'987654',display_phone_number:'+55 (11) 3000-0000'}]}));await expect(run()).resolves.toBeUndefined();
 expect(network.fetch.mock.calls.every(([url,options])=>options.method==='GET'&&!url.includes('SIM-secret'))).toBe(true);
});
it('paginates only on the official host and never treats an incomplete list as membership',async()=>{
 network.fetch.mockImplementation(async(url:string)=>response(url.includes('after=')?{data:[{id:'987654',display_phone_number:'551130000000'}]}:{data:[],paging:{next:'https://attacker.invalid/secret',cursors:{after:'SIM-cursor'}}}));await expect(run()).resolves.toBeUndefined();expect(network.fetch.mock.calls).toHaveLength(2);expect(network.fetch.mock.calls.every(([url])=>url.startsWith('https://graph.facebook.com/'))).toBe(true);
 network.fetch.mockImplementation(async()=>response({data:[],paging:{next:'SIM-next'}}));await expect(run()).rejects.toMatchObject({statusCode:502});
});
it('rejects invalid envelopes, provider failures, missing account and oversized responses',async()=>{
 for(const body of [{},{data:'bad'},{data:[null]},{data:[{}]}]){network.fetch.mockImplementation(async()=>response(body));await expect(run()).rejects.toMatchObject({statusCode:502});}
 network.fetch.mockImplementation(async()=>response({},403));await expect(run()).rejects.toMatchObject({statusCode:502});
 network.fetch.mockImplementation(async()=>new Response('x'.repeat(262145)));await expect(run()).rejects.toMatchObject({statusCode:502});
 network.fetch.mockClear();await expect(assertMetaPhoneMembership(undefined,'987654','SIM-secret','+551130000000')).rejects.toMatchObject({statusCode:422});expect(network.fetch).not.toHaveBeenCalled();
});
