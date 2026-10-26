import { z } from 'zod';
import type { Action } from '../lib/validation';
import { commandDataSchemas, viewDataSchemas, type PlatformView } from './api-responses';

/** Validate the JSON wire envelope without coercion or silently stripping unexpected fields. */
export function parseDataResponse<S extends z.ZodType>(schema: S, value: unknown) {
  return z.strictObject({ data: schema }).parse(value);
}

export function parseViewResponse<V extends PlatformView>(view: V, value: unknown) {
  return parseDataResponse(viewDataSchemas[view], value);
}

export function parseCommandResponse<A extends Action>(action: A, value: unknown) {
  return parseDataResponse(commandDataSchemas[action], value);
}
