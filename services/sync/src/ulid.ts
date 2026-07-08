import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RANDOM_MASK = (1n << 80n) - 1n;
let lastTime = -1;
let lastRandom = 0n;

const encodeNumber = (input: bigint, length: number) => {
  let value = input;
  let output = "";

  for (let i = length - 1; i >= 0; i -= 1) {
    output = ENCODING[Number(value & 31n)] + output;
    value >>= 5n;
  }

  return output;
};

const random80 = () => {
  let value = 0n;

  for (const byte of randomBytes(10)) {
    value = (value << 8n) | BigInt(byte);
  }

  return value;
};

export const createRevisionId = () => {
  const time = Date.now();
  if (time === lastTime) {
    lastRandom = (lastRandom + 1n) & RANDOM_MASK;
  } else {
    lastTime = time;
    lastRandom = random80();
  }

  return `${encodeNumber(BigInt(time), 10)}${encodeNumber(lastRandom, 16)}`;
};
