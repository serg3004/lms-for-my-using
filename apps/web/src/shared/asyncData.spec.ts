import { describe, expect, it } from 'vitest';

import { ApiClientError } from './apiClient.js';
import { toAsyncDataErrorState, toLoadedState, toLoadingState } from './asyncData.js';

const messages = { unauthenticated: 'Your session expired.', error: 'Unable to load data.' };

describe('toLoadingState', () => {
  it('returns the loading status', () => {
    expect(toLoadingState()).toEqual({ status: 'loading' });
  });
});

describe('toLoadedState', () => {
  it('wraps the resolved data under the loaded status', () => {
    expect(toLoadedState({ items: [1, 2, 3] })).toEqual({ status: 'loaded', data: { items: [1, 2, 3] } });
  });
});

describe('toAsyncDataErrorState', () => {
  it('maps a 401 ApiClientError to the unauthenticated status with its message', () => {
    const error = new ApiClientError('Unauthorized', 401);
    expect(toAsyncDataErrorState(error, messages)).toEqual({ status: 'unauthenticated', message: messages.unauthenticated });
  });

  it('maps a non-401 ApiClientError to the generic error status', () => {
    const error = new ApiClientError('Server error', 500);
    expect(toAsyncDataErrorState(error, messages)).toEqual({ status: 'error', message: messages.error });
  });

  it('maps a plain Error to the generic error status', () => {
    expect(toAsyncDataErrorState(new Error('network down'), messages)).toEqual({ status: 'error', message: messages.error });
  });

  it('maps a non-Error rejection to the generic error status', () => {
    expect(toAsyncDataErrorState('boom', messages)).toEqual({ status: 'error', message: messages.error });
  });

  it('maps a 404 ApiClientError to the notFound status when messages.notFound is set', () => {
    const error = new ApiClientError('Not found', 404);
    const withNotFound = { ...messages, notFound: 'This item was not found.' };
    expect(toAsyncDataErrorState(error, withNotFound)).toEqual({ status: 'notFound', message: withNotFound.notFound });
  });

  it('maps a 404 ApiClientError to the generic error status when messages.notFound is not set', () => {
    const error = new ApiClientError('Not found', 404);
    expect(toAsyncDataErrorState(error, messages)).toEqual({ status: 'error', message: messages.error });
  });
});
