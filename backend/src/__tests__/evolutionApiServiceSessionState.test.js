import { describe, it, expect } from '@jest/globals';
import {
  EvolutionApiError,
  getProviderErrorMessage,
  isInstanceNotFoundError,
  isSessionStateError,
} from '../services/evolutionApiService.js';

describe('evolutionApiService session state error classification', () => {
  it('classifies 400 not-acceptable as session state error', () => {
    const error = new EvolutionApiError('Error: not-acceptable', {
      status: 400,
      details: {
        response: {
          message: ['Error: not-acceptable'],
        },
      },
    });

    expect(isSessionStateError(error)).toBe(true);
  });

  it('classifies PreKeyError and Invalid PreKey ID as session state errors', () => {
    const error = new EvolutionApiError('PreKeyError: Invalid PreKey ID', {
      status: 500,
    });

    expect(isSessionStateError(error)).toBe(true);
  });

  it('classifies stream:error and init query bad-request as session state errors', () => {
    const error = new EvolutionApiError('unexpected error in init queries', {
      status: 400,
      details: {
        message: ['bad-request: unexpected error in init queries'],
      },
    });

    expect(isSessionStateError(error)).toBe(true);
  });

  it('classifies unexpected logout as session state error', () => {
    const error = new EvolutionApiError('Instance "easybarber" - LOGOUT', {
      status: 500,
    });

    expect(isSessionStateError(error)).toBe(true);
  });

  it('does not classify invalid payload phone error as session state error', () => {
    const error = new EvolutionApiError('Numero de telefone invalido para envio', {
      code: 'EVOLUTION_INVALID_PHONE',
    });

    expect(isSessionStateError(error)).toBe(false);
  });

  it('builds provider error message from details payload', () => {
    const error = new EvolutionApiError('Erro na Evolution API', {
      status: 400,
      details: {
        response: {
          message: ['Error: not-acceptable'],
        },
      },
    });

    expect(getProviderErrorMessage(error)).toContain('Error: not-acceptable');
  });

  it('classifies 404 as instance_not_found', () => {
    const error = new EvolutionApiError("The 'easybarber' instance does not exist", {
      status: 404,
    });

    expect(isInstanceNotFoundError(error)).toBe(true);
  });

  it('classifies provider message with instance does not exist as instance_not_found', () => {
    const error = new EvolutionApiError('Falha ao consultar instancia', {
      status: 400,
      details: {
        message: ["The 'easybarber' instance does not exist"],
      },
    });

    expect(isInstanceNotFoundError(error)).toBe(true);
  });
});
