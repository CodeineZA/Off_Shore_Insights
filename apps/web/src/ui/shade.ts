// One gold per selected tax year, oldest darkest, shared by every chart that draws a bar per year.
export const YEAR_SHADES = ['#8a6844', '#b98d5a', '#d8b07a', '#f3dcb2'];
export const shade = (i: number, n: number) => YEAR_SHADES[n <= 1 ? 3 : Math.round((i * (YEAR_SHADES.length - 1)) / (n - 1))];
