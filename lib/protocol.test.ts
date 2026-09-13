import { describe, expect, it } from 'vitest';
import { commandSchema } from './protocol';

describe('realtime protocol',()=>{
 it('rejects malformed commands at the boundary',()=>{expect(commandSchema.safeParse({type:'ANSWER',roomCode:'ROOM',playerId:'short',yes:'yes'}).success).toBe(false);});
 it('accepts a fully formed answer command',()=>{expect(commandSchema.safeParse({type:'ANSWER',roomCode:'ROOM',playerId:'player-1234',sessionToken:'a'.repeat(40),commandId:'00000000-0000-4000-8000-000000000001',yes:true}).success).toBe(true);});
});
