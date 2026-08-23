import { ApiClientError } from './apiClient.js';

export type AsyncDataState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'unauthenticated'; message: string }
  | { status: 'error'; message: string };

export type AsyncDataMessages = {
  unauthenticated: string;
  error: string;
};

export function toLoadingState<T>(): AsyncDataState<T> {
  return { status: 'loading' };
}

export function toLoadedState<T>(data: T): AsyncDataState<T> {
  return { status: 'loaded', data };
}

export function toAsyncDataErrorState<T>(error: unknown, messages: AsyncDataMessages): AsyncDataState<T> {
  if (error instanceof ApiClientError && error.status === 401) {
    return { status: 'unauthenticated', message: messages.unauthenticated };
  }
  return { status: 'error', message: messages.error };
}
