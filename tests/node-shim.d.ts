// 项目没有 @types/node；测试只用到这几个函数，在这里声明。
declare module 'node:fs' {
  export function readdirSync(path: string): string[];
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function statSync(path: string): { isDirectory(): boolean };
  export function existsSync(path: string): boolean;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
