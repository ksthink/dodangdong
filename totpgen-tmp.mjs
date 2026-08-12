import { createHmac } from 'node:crypto';
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decode(s){let bits=0,val=0;const out=[];for(const ch of s.toUpperCase()){const i=B32.indexOf(ch);if(i<0)continue;val=(val<<5)|i;bits+=5;if(bits>=8){out.push((val>>>(bits-8))&0xff);bits-=8;}}return Buffer.from(out);}
export function totp(secret, step){
  const buf=Buffer.alloc(8); buf.writeUInt32BE(Math.floor(step/2**32),0); buf.writeUInt32BE(step>>>0,4);
  const mac=createHmac('sha1', decode(secret)).update(buf).digest();
  const o=mac[mac.length-1]&0x0f;
  const code=((mac[o]&0x7f)<<24)|(mac[o+1]<<16)|(mac[o+2]<<8)|mac[o+3];
  return String(code%1e6).padStart(6,'0');
}
const s=process.argv[2];
const step=Math.floor(Date.now()/1000/30);
console.log(totp(s, step));
