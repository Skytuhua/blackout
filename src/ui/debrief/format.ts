const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const number = (value: number) => formatter.format(value);
