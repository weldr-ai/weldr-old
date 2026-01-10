const ELEMENTS = 3;
const SIZE = 80;

export const hashCode = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    const character = name.charCodeAt(i);
    hash = (hash << 5) - hash + character;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const getModulus = (num: number, max: number) => {
  return num % max;
};

export const getDigit = (number: number, ntn: number) => {
  return Math.floor((number / 10 ** ntn) % 10);
};

export const getAngle = (x: number, y: number) => {
  return (Math.atan2(y, x) * 180) / Math.PI;
};

export const getUnit = (number: number, range: number, index: number) => {
  const value = number % range;

  if (index && getDigit(number, index) % 2 === 0) {
    return -value;
  }
  return value;
};

export const getRandomColor = (number: number, colors: string[], range: number) => {
  return colors[number % range];
};

export function generateGradient(name: string, colors: string[]) {
  const numFromName = hashCode(name);
  const range = colors.length;

  const elementsProperties = Array.from({ length: ELEMENTS }, (_, i) => ({
    color: getRandomColor(numFromName + i, colors, range),
    translateX: getUnit(numFromName * (i + 1), SIZE / 10, 1),
    translateY: getUnit(numFromName * (i + 1), SIZE / 10, 2),
    scale: 1.2 + getUnit(numFromName * (i + 1), SIZE / 20, 1) / 10,
    rotate: getUnit(numFromName * (i + 1), 360, 1),
  }));

  return elementsProperties;
}
