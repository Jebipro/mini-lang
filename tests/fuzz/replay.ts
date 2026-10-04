import { campaign } from './campaign.js';
const seed = Number(process.argv[2]), index = Number(process.argv[3]);
if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isSafeInteger(index) || index < 0) throw new Error('usage: replay <uint32 seed> <nonnegative index>');
console.log(JSON.stringify(await campaign(seed, 1, index)));
