declare module 'bcryptjs' {
  export function hash(data: string, saltOrRounds: string | number): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
  export function genSalt(rounds?: number): Promise<string>;
  export function getRounds(encrypted: string): number;
  const bcryptjs: {
    hash: typeof hash;
    compare: typeof compare;
    genSalt: typeof genSalt;
    getRounds: typeof getRounds;
  };
  export default bcryptjs;
}
