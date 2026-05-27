import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId?: string;
  userId?: string;
  barbershopId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const getRequestContext = (): RequestContext => storage.getStore() ?? {};

export const setRequestContext = (patch: Partial<RequestContext>): void => {
  const store = storage.getStore();
  if (store) Object.assign(store, patch);
};

export const runWithRequestContext = <T>(ctx: RequestContext, fn: () => T): T =>
  storage.run(ctx, fn);
